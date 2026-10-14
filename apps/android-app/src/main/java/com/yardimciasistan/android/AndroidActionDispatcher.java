package com.yardimciasistan.android;

import android.content.SharedPreferences;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;

final class AndroidActionDispatcher {
  static final class Command {
    final String id;
    final String type;
    final JSONObject payload;

    Command(String type, JSONObject payload) {
      this.id = ActionOutbox.createActionId();
      this.type = type == null ? "" : type;
      this.payload = payload == null ? new JSONObject() : payload;
    }
  }

  interface Listener {
    boolean isBusy();
    void onError(String message);
    void onClearError();
    void onToast(String message);
    void onSyncRequired();
    void onDispatchStarted();
    void onActionsAccepted(
        List<OperationData.ActionRecord> accepted,
        String feedbackActionType,
        String successMessage,
        boolean marketFeedback
    );
    void onActionsFailed(
        List<OperationData.ActionRecord> accepted,
        String feedbackActionType,
        String marketQueuedMessage,
        String errorMessage,
        boolean actionRemainsQueued
    );
    void onBarcodeAccepted(String barcode, OperationData.ActionRecord accepted);
    void onBarcodeQueued(String barcode, boolean rejected, String errorMessage);
  }

  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final ExecutorService executor;
  private final AndroidOperationsTransport operationsTransport;
  private final DeviceIdentity identity;
  private final ActionOutbox actionOutbox;
  private final OperationCache operationCache;
  private final Listener listener;

  AndroidActionDispatcher(
      ComponentActivity activity,
      SharedPreferences preferences,
      ExecutorService executor,
      AndroidOperationsTransport operationsTransport,
      DeviceIdentity identity,
      ActionOutbox actionOutbox,
      OperationCache operationCache,
      Listener listener
  ) {
    this.activity = activity;
    this.preferences = preferences;
    this.executor = executor;
    this.operationsTransport = operationsTransport;
    this.identity = identity;
    this.actionOutbox = actionOutbox;
    this.operationCache = operationCache;
    this.listener = listener;
  }

  boolean send(
      List<Command> commands,
      String successMessage,
      String marketQueuedMessage,
      OperationData data
  ) {
    if (listener.isBusy()) {
      listener.onToast("Devam eden bağlantı işleminin bitmesini bekleyin.");
      return false;
    }

    for (Command command : commands) {
      String validationError = AndroidActionPolicy.validationError(
          data,
          command.type,
          command.payload
      );
      if (!validationError.isEmpty()) {
        listener.onError(validationError);
        if (!"Cihaz masaüstünde pasifleştirilmiş.".equals(validationError)) {
          listener.onToast(validationError);
        }
        return false;
      }
    }

    String baseUrl = ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = ConnectionSettings.syncSecret(preferences);
    if (baseUrl.isEmpty() || syncSecret.isEmpty()) {
      listener.onError("İşlem gönderilemedi. Ayarlar'dan bağlantıyı tamamlayın.");
      return false;
    }

    final String actionTargetKey = CompanionConnectionIdentity.actionTargetKey(baseUrl);
    if (actionTargetKey.isEmpty()) {
      listener.onError("İşlem hedefi doğrulanamadı.");
      return false;
    }

    boolean commerceDecision = commands.size() == 1 && CompanionUiRules.isDecision(commands.get(0).type);
    try {
      List<ActionOutbox.PendingAction> existing = actionOutbox.load();
      if (commerceDecision) {
        Command command = commands.get(0);
        String error = CompanionUiRules.submissionError(data, command.type, command.payload, existing, actionTargetKey);
        if (!error.isEmpty()) { listener.onError(error); return false; }
      } else if (!existing.isEmpty()) {
        listener.onToast("Önce telefonda bekleyen işlem yeniden gönderiliyor.");
        listener.onSyncRequired();
        return false;
      }
    } catch (ActionOutbox.OutboxException error) {
      listener.onError(error.getMessage());
      return false;
    }

    if (!commerceDecision && data.pendingActions > 0) {
      listener.onError("Önce masaüstünü bekleyen işlemleri uygulayın ve canlı veriyi yenileyin.");
      listener.onToast("Güncel sonuç alınmadan yeni işlem gönderilemez.");
      return false;
    }

    ArrayList<ActionOutbox.PendingAction> pendingActions = new ArrayList<>();
    try {
      for (Command command : commands) {
        pendingActions.add(ActionOutbox.PendingAction.create(
            command.id,
            command.type,
            command.payload,
            actionTargetKey
        ));
      }
      actionOutbox.appendAll(pendingActions);
    } catch (ActionOutbox.OutboxException error) {
      listener.onError(error.getMessage());
      return false;
    }

    final String feedbackActionType = commands.size() == 1
        ? commands.get(0).type
        : "";
    listener.onDispatchStarted();

    executor.execute(() -> {
      ArrayList<OperationData.ActionRecord> accepted = new ArrayList<>();
      try {
        for (ActionOutbox.PendingAction action : pendingActions) {
          OperationData.ActionRecord record = operationsTransport.enqueueAction(
              baseUrl,
              syncSecret,
              identity,
              action.id,
              action.type,
              action.payload
          );
          operationCache.recordActionResult(record, actionTargetKey);
          actionOutbox.remove(action.id);
          accepted.add(record);
        }

        final String acceptedMessage = MarketUiRules.ACTION_SALE.equals(feedbackActionType) || MarketUiRules.ACTION_CREDIT_PAYMENT.equals(feedbackActionType)
            ? MarketUiRules.financialFeedback(feedbackActionType, accepted.get(0).status)
            : KbsUiRules.isAction(feedbackActionType) ? KbsUiRules.actionFeedback(feedbackActionType, accepted.get(0).status) : successMessage;
        activity.runOnUiThread(() -> listener.onActionsAccepted(
            accepted,
            feedbackActionType,
            acceptedMessage,
            marketQueuedMessage != null
        ));
      } catch (AndroidOperationsTransport.TransportException | ActionOutbox.OutboxException | OperationCache.CacheException error) {
        boolean rejected = error instanceof AndroidOperationsTransport.TransportException
            && ((AndroidOperationsTransport.TransportException) error).invalidatesPendingAction();

        if (rejected) {
          for (ActionOutbox.PendingAction pending : pendingActions) {
            try {
              if (CompanionUiRules.isDecision(pending.type)) operationCache.recordActionResult(failedRecord(pending, error.getMessage()), actionTargetKey);
              actionOutbox.remove(pending.id);
            } catch (ActionOutbox.OutboxException | OperationCache.CacheException ignored) {
              // The visible error remains actionable and the next sync retries cleanup.
            }
          }
        }

        final boolean actionRemainsQueued = !rejected && (marketQueuedMessage != null || KbsUiRules.isAction(feedbackActionType));
        activity.runOnUiThread(() -> listener.onActionsFailed(
            accepted,
            feedbackActionType,
            KbsUiRules.isAction(feedbackActionType) ? "Kuyruğa alındı; bağlantı geldiğinde aynı istek masaüstüne iletilecek." : marketQueuedMessage,
            error.getMessage(),
            actionRemainsQueued
        ));
      }
    });
    return true;
  }

  static OperationData.ActionRecord failedRecord(ActionOutbox.PendingAction pending, String message) {
    OperationData.ActionRecord record = new OperationData.ActionRecord();
    record.id = pending.id; record.type = pending.type; record.orderId = pending.payload.optString("order_id");
    record.notificationId = pending.payload.optString("notification_id");
    record.status = "failed"; record.errorMessage = message;
    record.createdAt = new java.util.Date().toInstant().toString(); record.processedAt = record.createdAt;
    return record;
  }

  boolean sendBarcodeScan(
      String barcode,
      JSONObject actionPayload,
      OperationData data
  ) {
    if (!MarketUiRules.canScanToDesktop(data)) {
      listener.onError("Bu cihazın masaüstüne barkod gönderme yetkisi yok.");
      return false;
    }

    String baseUrl = ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = ConnectionSettings.syncSecret(preferences);
    if (baseUrl.isEmpty() || syncSecret.isEmpty()) {
      listener.onError("Barkod gönderilemedi. Ayarlar'dan bağlantıyı tamamlayın.");
      return false;
    }

    final String actionTargetKey = CompanionConnectionIdentity.actionTargetKey(baseUrl);
    if (actionTargetKey.isEmpty()) {
      listener.onError("Barkod gönderim hedefi doğrulanamadı.");
      return false;
    }

    try {
      for (ActionOutbox.PendingAction existing : actionOutbox.load()) {
        if (!existing.matchesTarget(actionTargetKey)) {
          listener.onError("Telefonda önceki bağlantıya ait bekleyen işlem var.");
          return false;
        }
      }
    } catch (ActionOutbox.OutboxException error) {
      listener.onError(error.getMessage());
      return false;
    }

    final ActionOutbox.PendingAction pending;
    try {
      pending = ActionOutbox.PendingAction.create(
          ActionOutbox.createActionId(),
          MarketUiRules.ACTION_BARCODE_SCAN,
          actionPayload,
          actionTargetKey
      );
      ArrayList<ActionOutbox.PendingAction> additions = new ArrayList<>();
      additions.add(pending);
      actionOutbox.appendAll(additions);
    } catch (ActionOutbox.OutboxException error) {
      listener.onError(error.getMessage());
      return false;
    }

    listener.onClearError();
    executor.execute(() -> {
      try {
        OperationData.ActionRecord accepted = operationsTransport.enqueueAction(
            baseUrl,
            syncSecret,
            identity,
            pending.id,
            pending.type,
            pending.payload
        );
        actionOutbox.remove(pending.id);
        activity.runOnUiThread(() -> listener.onBarcodeAccepted(barcode, accepted));
      } catch (AndroidOperationsTransport.TransportException | ActionOutbox.OutboxException error) {
        boolean rejected = error instanceof AndroidOperationsTransport.TransportException
            && ((AndroidOperationsTransport.TransportException) error).invalidatesPendingAction();
        if (rejected) {
          try {
            actionOutbox.remove(pending.id);
          } catch (ActionOutbox.OutboxException ignored) {
            // The action id remains safe to replay because desktop receipts are idempotent.
          }
        }
        activity.runOnUiThread(() ->
            listener.onBarcodeQueued(barcode, rejected, error.getMessage())
        );
      }
    });
    return true;
  }
}

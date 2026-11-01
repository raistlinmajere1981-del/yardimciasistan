package com.yardimciasistan.android;

import android.content.SharedPreferences;

import androidx.activity.ComponentActivity;

import java.util.List;
import java.util.concurrent.ExecutorService;

final class AndroidOperationsSyncController {
  interface Listener {
    void onRejected(String message);
    void onStarted(String connectionState);
    void onSuccess(SyncResult result);
    void onAndroidDisabled(OperationData data, String message);
    void onFailure(String message, boolean retryingOnlyMarketActions, String retriedMarketActionType);
  }

  static final class SyncResult {
    final OperationData data;
    final int discardedActionCount;
    final boolean retryingOnlyMarketActions;
    final String retriedMarketActionType;
    final String retriedMarketActionId;
    final boolean usedLocalTransport;
    final boolean webAllowsLocalNetwork;
    final boolean shouldRender;
    final String connectionState;

    SyncResult(
        OperationData data,
        int discardedActionCount,
        boolean retryingOnlyMarketActions,
        String retriedMarketActionType,
        String retriedMarketActionId,
        boolean usedLocalTransport,
        boolean webAllowsLocalNetwork,
        boolean shouldRender,
        String connectionState
    ) {
      this.data = data;
      this.discardedActionCount = discardedActionCount;
      this.retryingOnlyMarketActions = retryingOnlyMarketActions;
      this.retriedMarketActionType = retriedMarketActionType;
      this.retriedMarketActionId = retriedMarketActionId;
      this.usedLocalTransport = usedLocalTransport;
      this.webAllowsLocalNetwork = webAllowsLocalNetwork;
      this.shouldRender = shouldRender;
      this.connectionState = connectionState;
    }
  }

  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final ExecutorService executor;
  private final AndroidOperationsTransport operationsTransport;
  private final DeviceIdentity identity;
  private final ActionOutbox actionOutbox;
  private final OperationCache operationCache;
  private final LocalNotificationCenter localNotifications;

  AndroidOperationsSyncController(
      ComponentActivity activity,
      SharedPreferences preferences,
      ExecutorService executor,
      AndroidOperationsTransport operationsTransport,
      DeviceIdentity identity,
      ActionOutbox actionOutbox,
      OperationCache operationCache,
      LocalNotificationCenter localNotifications
  ) {
    this.activity = activity;
    this.preferences = preferences;
    this.executor = executor;
    this.operationsTransport = operationsTransport;
    this.identity = identity;
    this.actionOutbox = actionOutbox;
    this.operationCache = operationCache;
    this.localNotifications = localNotifications;
  }

  void sync(String baseUrl, String syncSecret, OperationData fallbackData, Listener listener) {
    if (!ConnectionSettings.isLocalOnly(preferences) && (baseUrl == null || baseUrl.trim().isEmpty())) {
      listener.onRejected("Web modül adresi gerekli.");
      return;
    }
    if (!ConnectionSettings.isLocalOnly(preferences) && (syncSecret == null || syncSecret.trim().isEmpty())) {
      listener.onRejected("Güvenlik anahtarı gerekli.");
      return;
    }

    final String normalizedBaseUrl = baseUrl == null ? "" : baseUrl.trim();
    final String normalizedSecret = syncSecret == null ? "" : syncSecret.trim();
    final String actionTargetKey = CompanionConnectionIdentity.actionTargetKey(preferences, normalizedBaseUrl);
    final String preferredSourceKey = operationsTransport.preferredSourceKey(normalizedBaseUrl, normalizedSecret);
    if (actionTargetKey.isEmpty() || preferredSourceKey.isEmpty()) {
      listener.onRejected("Bağlantı hedefi doğrulanamadı.");
      return;
    }

    final List<ActionOutbox.PendingAction> pendingToRetry;
    try {
      pendingToRetry = actionOutbox.load();
      for (ActionOutbox.PendingAction pending : pendingToRetry) {
        if (!pending.matchesTarget(actionTargetKey)) {
          listener.onRejected("Telefonda önceki bağlantıya ait bekleyen işlem var. Önce eski bağlantı bilgileriyle işlemi gönderin.");
          return;
        }
      }
    } catch (ActionOutbox.OutboxException error) {
      listener.onRejected(error.getMessage());
      return;
    }

    final boolean retryingOnlyMarketActions = containsOnlyMarketActions(pendingToRetry);
    final String retriedMarketActionType = retryingOnlyMarketActions && !pendingToRetry.isEmpty()
        ? pendingToRetry.get(pendingToRetry.size() - 1).type
        : "";

    if (!ConnectionSettings.isLocalOnly(preferences)) {
      preferences.edit()
          .putString(ConnectionSettings.KEY_WEB_MODULE_URL, normalizedBaseUrl)
          .putString(ConnectionSettings.KEY_SYNC_SECRET, normalizedSecret).apply();
    }

    listener.onStarted(
        pendingToRetry.isEmpty()
            ? "Canlı veri çekiliyor"
            : "Bekleyen işlemler yeniden gönderiliyor"
    );

    // not_modified still carries action receipts, pending counts and voice availability.
    // Capture the currently displayed state before the worker mutates its cache copy.
    final String previousStatus = presentationStatus(fallbackData);
    final OperationData previousData = operationCache.load();
    executor.execute(() -> {
      try {
        int invalidatedPendingActions = 0;
        for (ActionOutbox.PendingAction pending : pendingToRetry) {
          try {
            OperationData.ActionRecord result = operationsTransport.enqueueAction(
                normalizedBaseUrl,
                normalizedSecret,
                identity,
                pending.id,
                pending.type,
                pending.payload
            );
            operationCache.recordActionResult(result, actionTargetKey);
            actionOutbox.remove(pending.id);
          } catch (AndroidOperationsTransport.TransportException error) {
            if (!error.invalidatesPendingAction()) {
              throw error;
            }
            operationCache.recordActionResult(AndroidActionDispatcher.failedRecord(pending, error.getMessage()), actionTargetKey);
            actionOutbox.remove(pending.id);
            invalidatedPendingActions += 1;
            if (error.disablesAndroidService()) {
              actionOutbox.clear();
              throw error;
            }
          }
        }

        AndroidOperationsTransport.FetchResult fetched = operationsTransport.fetchOperations(
            normalizedBaseUrl,
            normalizedSecret,
            identity,
            operationCache.revision(preferredSourceKey)
        );
        final String fetchedSourceKey = fetched.sourceKey.isEmpty()
            ? preferredSourceKey
            : fetched.sourceKey;
        final boolean snapshotChanged = !fetched.notModified && !operationCache.hasSamePresentation(fetched.payload);
        final OperationData nextData;
        if (!fetched.notModified && fetched.data != null) {
          operationCache.save(fetched.payload, fetchedSourceKey, fetched.serverRevision);
          OperationData cachedData = operationCache.load();
          nextData = cachedData == null ? fetched.data : cachedData;
        } else {
          nextData = previousData == null ? fallbackData : previousData;
          nextData.applyVoiceProjection(fetched.payload);
          nextData.pulledAt = fetched.payload.optString("pulled_at", nextData.pulledAt);
          nextData.pendingActions = Math.max(
              0,
              fetched.payload.optInt("pending_action_count", nextData.pendingActions)
          );
        }
        org.json.JSONArray results = fetched.payload.optJSONArray("action_results");
        if (results != null) for (int i = 0; i < results.length() && i < 40; i++) {
          org.json.JSONObject row = results.optJSONObject(i);
          if (row != null) operationCache.recordActionResult(OperationData.ActionRecord.fromJson(row), actionTargetKey);
        }
        operationCache.markMissingActionResults(fetched.payload.optJSONArray("missing_action_result_ids"), actionTargetKey);
        operationCache.mergeActionResults(nextData);

        if (!fetched.notModified) {
          localNotifications.processSnapshot(previousData, nextData);
        }
        localNotifications.recordSyncSuccess();

        SyncResult result = new SyncResult(
            nextData,
            invalidatedPendingActions,
            retryingOnlyMarketActions,
            retriedMarketActionType,
            retryingOnlyMarketActions && !pendingToRetry.isEmpty() ? pendingToRetry.get(pendingToRetry.size() - 1).id : "",
            fetchedSourceKey.startsWith("local:"),
            fetched.payload.optBoolean("local_network_enabled", true),
            shouldRender(snapshotChanged, !pendingToRetry.isEmpty(), previousStatus, nextData),
            fetched.payload.optBoolean("approval_required", false) ? "Masaüstü onayı bekleniyor"
                : fetchedSourceKey.startsWith("local:") ? "Yerel ağ bağlı" : "Web bağlantısı hazır"
        );
        activity.runOnUiThread(() -> listener.onSuccess(result));
      } catch (AndroidOperationsTransport.TransportException | ActionOutbox.OutboxException | OperationCache.CacheException error) {
        if (error instanceof AndroidOperationsTransport.TransportException
            && ((AndroidOperationsTransport.TransportException) error).disablesAndroidService()) {
          OperationData disabledData = OperationData.androidCapabilityDisabled();
          String disabledMessage = error.getMessage();
          try {
            operationCache.clear();
            actionOutbox.clear();
          } catch (OperationCache.CacheException | ActionOutbox.OutboxException cleanupError) {
            disabledMessage += " " + cleanupError.getMessage();
          }
          localNotifications.processSnapshot(previousData, disabledData);
          localNotifications.recordSyncSuccess();
          final String visibleMessage = disabledMessage;
          activity.runOnUiThread(() -> listener.onAndroidDisabled(disabledData, visibleMessage));
          return;
        }

        localNotifications.recordSyncFailure(previousData, error.getMessage());
        activity.runOnUiThread(() -> listener.onFailure(
            error.getMessage(),
            retryingOnlyMarketActions,
            retriedMarketActionType
        ));
      }
    });
  }

  static boolean shouldRender(boolean snapshotChanged, boolean retriedActions, String previousStatus, OperationData next) {
    return snapshotChanged || retriedActions || !previousStatus.equals(presentationStatus(next));
  }

  static String presentationStatus(OperationData data) {
    org.json.JSONArray actions = new org.json.JSONArray();
    for (OperationData.ActionRecord action : data.actions) {
      actions.put(new org.json.JSONArray().put(action.id).put(action.type).put(action.status)
          .put(action.errorMessage).put(action.createdAt).put(action.processedAt)
          .put(action.orderId).put(action.expectedStatus).put(action.expectedUpdatedAt)
          .put(action.notificationId).put(action.taskType));
    }
    return new org.json.JSONArray().put(data.pendingActions).put(data.sttAvailable).put(actions).toString();
  }

  private static boolean containsOnlyMarketActions(List<ActionOutbox.PendingAction> pendingActions) {
    if (pendingActions == null || pendingActions.isEmpty()) {
      return false;
    }
    for (ActionOutbox.PendingAction pending : pendingActions) {
      if (MarketUiRules.requiredPermissionForAction(pending.type) == null) {
        return false;
      }
    }
    return true;
  }
}

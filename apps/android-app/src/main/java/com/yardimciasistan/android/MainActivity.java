package com.yardimciasistan.android;

import static com.yardimciasistan.android.AndroidPresentation.*;

import android.Manifest;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends ComponentActivity {
  private static final String TAB_TODAY = AndroidUiRules.TAB_TODAY;
  private static final String TAB_CUSTOMERS = AndroidUiRules.TAB_CUSTOMERS;
  private static final String TAB_PENSION = AndroidUiRules.TAB_PENSION;
  private static final String TAB_RESTAURANT = AndroidUiRules.TAB_RESTAURANT;
  private static final String TAB_MARKET = AndroidUiRules.TAB_MARKET;
  private static final String TAB_MESSAGES = AndroidUiRules.TAB_MESSAGES;
  private static final String TAB_CASH = AndroidUiRules.TAB_CASH;
  private static final String TAB_REPORTS = AndroidUiRules.TAB_REPORTS;
  private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 0x5941;
  private static final String KEY_NOTIFICATION_PERMISSION_REQUESTED = "notification_permission_requested_v1";

  private final HostingSyncClient syncClient = new HostingSyncClient();
  private AndroidOperationsTransport operationsTransport;
  private final ProductDataLookupClient productDataLookupClient = new ProductDataLookupClient();
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private SharedPreferences preferences;
  private AppTheme.Mode themeMode = AppTheme.Mode.NIGHT;
  private ActionOutbox actionOutbox;
  private OperationCache operationCache;
  private LocalNotificationCenter localNotifications;
  private LocalCompanionDiscovery localCompanionDiscovery;
  private MarketWorkspace marketWorkspace;
  private OperationData data = new OperationData();
  private DeviceIdentity identity;
  private String activeTab = TAB_TODAY;
  private boolean settingsOpen;
  private boolean loading;
  private String connectionState = "Henüz bağlanmadı";

  private AndroidShellController shell;
  private AndroidInteractionController interactionController;
  private String currentError = "";
  private AndroidImageCaptureController imageCaptureController;
  private AndroidProvisioningController provisioningController;
  private AndroidOperationsSyncController operationsSyncController;
  private AndroidForegroundSyncController foregroundSyncController;
  private AndroidActionDispatcher actionDispatcher;
  private AndroidConnectionController connectionController;
  private AndroidSettingsWorkspace settingsWorkspace;
  private ReportsWorkspace reportsWorkspace;
  private AndroidOperationCards operationCards;
  private AndroidWorkspaceCoordinator workspaceCoordinator;
  private AndroidDetailDialogCoordinator detailDialogCoordinator;
  private IdentityImageWorkflow identityImageWorkflow;
  private StockImageAnalysisController stockImageAnalysisController;
  private StockImageWorkflow stockImageWorkflow;
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    preferences = getSharedPreferences(ConnectionSettings.PREFS_NAME, MODE_PRIVATE);
    connectionController = new AndroidConnectionController(this, preferences);
    connectionController.resetDebugAppStateIfRequested(getIntent());
    themeMode = AppTheme.load(preferences);
    setTheme(themeStyleResource(themeMode));
    super.onCreate(savedInstanceState);
    provisioningController = new AndroidProvisioningController(
        this,
        preferences,
        executor,
        syncClient,
        new AndroidProvisioningController.Listener() {
          @Override
          public void onCaptureError(String message) {
            showError(message);
          }

          @Override
          public void onBootstrapStarted() {
            loading = true;
            connectionState = "Android kurulumu işletmeye bağlanıyor";
            clearError();
            render();
          }

          @Override
          public void onBootstrapSucceeded() {
            loading = false;
            clearError();
            syncOperations(false);
          }

          @Override
          public void onBootstrapFailed(String message) {
            loading = false;
            connectionState = "Android kurulum bağlantısı tamamlanamadı";
            showError(message);
            render();
          }
        }
    );
    provisioningController.captureIntent(getIntent());
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        if (settingsOpen) {
          settingsOpen = false;
          render();
          return;
        }
        if (TAB_MARKET.equals(activeTab) && marketWorkspace != null && marketWorkspace.handleBack()) {
          return;
        }
        if (TAB_REPORTS.equals(activeTab) || TAB_CASH.equals(activeTab)) {
          activeTab = TAB_TODAY;
          settingsOpen = true;
          render();
          return;
        }
        setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
      }
    });
    imageCaptureController = new AndroidImageCaptureController(this, new AndroidImageCaptureController.Listener() {
      @Override
      public void onStockImageSelected(Uri uri) {
        showStockImagePreviewDialog(uri);
      }

      @Override
      public void onIdentityImageSelected(Uri uri) {
        if (identityImageWorkflow != null) {
          identityImageWorkflow.onImageSelected(uri);
        }
      }

      @Override
      public void onError(String message) {
        showError(message);
      }
    });
    IdentityImageAnalysisController identityImageAnalysisController = new IdentityImageAnalysisController(this, executor, syncClient);
    stockImageAnalysisController = new StockImageAnalysisController(this, executor, syncClient);
    UiKit.applyTheme(AppTheme.tokens(themeMode));
    applyWindowTheme();
    shell = new AndroidShellController(
        this,
        new AndroidShellController.Listener() {
          @Override public void onRefresh() { syncOperations(false); }
          @Override public void onThemeToggle() { switchTheme(); }
          @Override public void onSettingsToggle() {
            settingsOpen = !settingsOpen;
            render();
          }
          @Override public void onTabSelected(String tab) {
            activeTab = tab;
            settingsOpen = false;
            render();
          }
          @Override public boolean canOpenTab(String tab) { return MainActivity.this.canOpenTab(tab); }
          @Override public AppTheme.Mode themeMode() { return themeMode; }
        }
    );
    interactionController = new AndroidInteractionController(this);
    ConnectionSettings.setDebugConnectionOverrideActive(preferences, connectionController.isDebugConnectionOverrideRequested(getIntent()));
    ConnectionSettings.ensureDefaults(preferences);
    operationsTransport = new CompanionOperationsRouter(preferences);
    localCompanionDiscovery = new LocalCompanionDiscovery(this, preferences);
    foregroundSyncController = new AndroidForegroundSyncController(
        localCompanionDiscovery,
        new AndroidForegroundSyncController.Listener() {
          @Override
          public boolean isBusy() {
            return loading;
          }

          @Override
          public boolean hasPendingBootstrap() {
            return ConnectionSettings.hasPendingBootstrap(preferences);
          }

          @Override
          public boolean hasConnectionSettings() {
            return MainActivity.this.hasConnectionSettings();
          }

          @Override
          public void onBootstrapDue() {
            bootstrapProvisioning();
          }

          @Override
          public void onSyncDue() {
            syncOperations(false);
          }
        }
    );
    identity = DeviceIdentity.loadOrCreate(this, preferences);
    identityImageWorkflow = new IdentityImageWorkflow(
        this,
        preferences,
        identity,
        imageCaptureController,
        identityImageAnalysisController,
        new IdentityImageWorkflow.Listener() {
          @Override public OperationData currentData() { return data; }
          @Override public void showError(String message) { MainActivity.this.showError(message); }
        }
    );
    reportsWorkspace = new ReportsWorkspace(
        this,
        preferences,
        executor,
        syncClient,
        identity,
        new ReportsWorkspace.Listener() {
          @Override public boolean isBusy() { return loading; }
          @Override public void onRefreshRequested() { syncOperations(false); }
          @Override public void onRenderRequested() { render(); }
          @Override public void onError(String message) { showError(message); }
        }
    );
    operationCards = new AndroidOperationCards(
        this,
        data,
        new AndroidOperationCards.Listener() {
          @Override public void showRequestDetail(OperationData.RequestRecord request) { MainActivity.this.showRequestDetail(request); }
          @Override public void openDialer(String phone) { MainActivity.this.openDialer(phone); }
          @Override public void openWhatsApp(String phone, String message) { MainActivity.this.openWhatsApp(phone, message); }
          @Override public void showReservationDetail(OperationData.ReservationRecord reservation) { MainActivity.this.showReservationDetail(reservation); }
          @Override public void assignCustomerToRoom(OperationData.RoomRecord room) { showRoomAssignmentDialog(null, room); }
          @Override public void manageStay(OperationData.CustomerRoomStayRecord stay) { showCustomerRoomStayActions(stay); }
          @Override public void showRoomStatus(OperationData.RoomRecord room) { showRoomStatusDialog(room); }
          @Override public void showDailyTaskEditor(DailyTaskEditorDialog.Kind kind, OperationData.TaskRecord task) { MainActivity.this.showDailyTaskEditor(kind, task); }
          @Override public void sendAction(String type, JSONObject payload, String success) { MainActivity.this.sendAction(type, payload, success); }
          @Override public void showTableOrder(OperationData.TableRecord table) { MainActivity.this.showTableOrder(table); }
          @Override public void showTableStatus(OperationData.TableRecord table) { showTableStatusDialog(table); }
          @Override public void sendOrderStatus(OperationData.TableOrder order, String status) { MainActivity.this.sendOrderStatus(order, status); }
          @Override public void confirm(String title, String message, Runnable action) { MainActivity.this.confirm(title, message, action); }
          @Override public void closeOrder(OperationData.TableOrder order, String status) { MainActivity.this.closeOrder(order, status); }
          @Override public void showStockActions(OperationData.TrackedStockItem item) { showStockActionsDialog(item); }
          @Override public void launchStockCamera() { MainActivity.this.launchStockCamera(); }
          @Override public void launchStockGallery() { MainActivity.this.launchStockGallery(); }
          @Override public void openRoute(String route) { MainActivity.this.openRoute(route); }
          @Override public void render() { MainActivity.this.render(); }
          @Override public void copyText(String message) { MainActivity.this.copyText(message); }
          @Override public void showMessageDetail(OperationData.MessageRecord message) { MainActivity.this.showMessageDetail(message); }
        }
    );
    detailDialogCoordinator = new AndroidDetailDialogCoordinator(
        this,
        new AndroidDetailDialogCoordinator.Listener() {
          @Override public void addHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen) { shell.addDetailHeaderActions(header, dialog, reopen); }
          @Override public void configureFullDialog(Dialog dialog) { MainActivity.this.configureFullDialog(dialog); }
          @Override public void configureBottomDialog(Dialog dialog) { MainActivity.this.configureBottomDialog(dialog); }
          @Override public void openDialer(String phone) { MainActivity.this.openDialer(phone); }
          @Override public void openWhatsApp(String phone, String message) { MainActivity.this.openWhatsApp(phone, message); }
          @Override public void copyText(String message) { MainActivity.this.copyText(message); }
          @Override public void showCustomerForm(OperationData.CustomerRecord customer) { MainActivity.this.showCustomerForm(customer); }
          @Override public View createStayCard(OperationData.CustomerRoomStayRecord stay) { return operationCards.customerRoomStayCard(stay); }
          @Override public void showPreparedReply(String customerName, String message) { MainActivity.this.showPreparedReply(customerName, message); }
          @Override public void sendAction(String type, JSONObject payload, String success) { MainActivity.this.sendAction(type, payload, success); }
          @Override public void confirm(String title, String message, Runnable action) { MainActivity.this.confirm(title, message, action); }
          @Override public void editReservation(ReservationEditorDialog.Kind kind, OperationData.ReservationRecord reservation) { MainActivity.this.showReservationEditor(kind, reservation); }
          @Override public void sendReservationAction(OperationData.ReservationRecord reservation, String type, String success) { MainActivity.this.sendReservationAction(reservation, type, success); }
          @Override public void showError(String message) { MainActivity.this.showError(message); }
          @Override public void addOrderItem(OperationData.TableRecord table, OperationData.TableOrder order, OperationData.MenuItem item) { MainActivity.this.addOrderItem(table, order, item); }
          @Override public void sendOrderStatus(OperationData.TableOrder order, String status) { MainActivity.this.sendOrderStatus(order, status); }
          @Override public void closeOrder(OperationData.TableOrder order, String status) { MainActivity.this.closeOrder(order, status); }
        }
    );
    workspaceCoordinator = new AndroidWorkspaceCoordinator(
        this,
        operationCards,
        new AndroidWorkspaceCoordinator.Listener() {
          @Override public void render() { MainActivity.this.render(); }
          @Override public void showCustomerForm(OperationData.CustomerRecord customer) { MainActivity.this.showCustomerForm(customer); }
          @Override public void showCustomerDetail(OperationData.CustomerRecord customer) { MainActivity.this.showCustomerDetail(customer); }
          @Override public void openDialer(String phone) { MainActivity.this.openDialer(phone); }
          @Override public void openWhatsApp(String phone, String message) { MainActivity.this.openWhatsApp(phone, message); }
          @Override public void showReservationEditor(ReservationEditorDialog.Kind kind, OperationData.ReservationRecord reservation) { MainActivity.this.showReservationEditor(kind, reservation); }
          @Override public void showRoomAssignment() { showRoomAssignmentDialog(null, null); }
          @Override public void showDailyTaskEditor(DailyTaskEditorDialog.Kind kind, OperationData.TaskRecord task) { MainActivity.this.showDailyTaskEditor(kind, task); }
          @Override public void sendAction(String actionType, JSONObject actionPayload, String successMessage) { MainActivity.this.sendAction(actionType, actionPayload, successMessage); }
        }
    );
    stockImageWorkflow = new StockImageWorkflow(
        this,
        preferences,
        identity,
        stockImageAnalysisController,
        new StockImageWorkflow.Listener() {
          @Override
          public OperationData currentData() {
            return data;
          }

          @Override
          public void launchCamera() {
            launchStockCamera();
          }

          @Override
          public void launchGallery() {
            launchStockGallery();
          }

          @Override
          public void cleanupPendingCameraFile() {
            deletePendingStockCameraFile();
          }

          @Override
          public void configureFullDialog(Dialog dialog) {
            MainActivity.this.configureFullDialog(dialog);
          }

          @Override
          public void sendAction(
              String actionType,
              JSONObject actionPayload,
              String successMessage
          ) {
            MainActivity.this.sendAction(actionType, actionPayload, successMessage);
          }

          @Override
          public void showError(String message) {
            MainActivity.this.showError(message);
          }
        }
    );
    actionOutbox = new ActionOutbox(preferences);
    actionDispatcher = new AndroidActionDispatcher(
        this,
        preferences,
        executor,
        operationsTransport,
        identity,
        actionOutbox,
        new AndroidActionDispatcher.Listener() {
          @Override
          public boolean isBusy() {
            return loading;
          }

          @Override
          public void onError(String message) {
            showError(message);
          }

          @Override
          public void onClearError() {
            clearError();
          }

          @Override
          public void onToast(String message) {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
          }

          @Override
          public void onSyncRequired() {
            syncOperations(false);
          }

          @Override
          public void onDispatchStarted() {
            loading = true;
            clearError();
          }

          @Override
          public void onActionsAccepted(
              List<OperationData.ActionRecord> accepted,
              String feedbackActionType,
              String successMessage,
              boolean marketFeedback
          ) {
            loading = false;
            for (int index = accepted.size() - 1; index >= 0; index -= 1) {
              data.actions.add(0, accepted.get(index));
            }
            data.pendingActions += pendingActionCount(accepted);
            clearError();
            if (marketFeedback && marketWorkspace != null) {
              marketWorkspace.onSubmissionAccepted(feedbackActionType, successMessage);
              Toast.makeText(MainActivity.this, successMessage, Toast.LENGTH_SHORT).show();
            }
            render();
          }

          @Override
          public void onActionsFailed(
              List<OperationData.ActionRecord> accepted,
              String feedbackActionType,
              String marketQueuedMessage,
              String errorMessage,
              boolean actionRemainsQueued
          ) {
            loading = false;
            if (!accepted.isEmpty()) {
              for (int index = accepted.size() - 1; index >= 0; index -= 1) {
                data.actions.add(0, accepted.get(index));
              }
              data.pendingActions += pendingActionCount(accepted);
            }
            if (actionRemainsQueued && marketWorkspace != null) {
              connectionState = errorMessage;
              clearError();
              marketWorkspace.onSubmissionQueued(feedbackActionType, marketQueuedMessage);
              Toast.makeText(MainActivity.this, marketQueuedMessage, Toast.LENGTH_SHORT).show();
            } else {
              showError(
                  accepted.isEmpty()
                      ? "İşlem gönderilemedi. " + errorMessage
                      : "İşlemin bir bölümü gönderildi; kalan bölüm gönderilemedi. " + errorMessage
              );
            }
            render();
          }

          @Override
          public void onBarcodeAccepted(
              String barcode,
              OperationData.ActionRecord accepted
          ) {
            data.actions.add(0, accepted);
            if ("pending".equals(accepted.status)) {
              data.pendingActions += 1;
            }
            if (marketWorkspace != null) {
              marketWorkspace.onBarcodeScanAccepted(barcode, "Gönderildi");
            }
          }

          @Override
          public void onBarcodeQueued(
              String barcode,
              boolean rejected,
              String errorMessage
          ) {
            if (marketWorkspace != null) {
              marketWorkspace.onBarcodeScanQueued(
                  barcode,
                  rejected
                      ? "Gönderilemedi"
                      : "Gönderim bekliyor; eski taramalar masaüstünde zaman aşımına uğrar"
              );
            }
            if (rejected) {
              showError(errorMessage);
            }
          }
        }
    );
    operationCache = new OperationCache(preferences, identity.deviceId);
    localNotifications = new LocalNotificationCenter(this, preferences);
    settingsWorkspace = new AndroidSettingsWorkspace(
        this,
        preferences,
        identity,
        new AndroidSettingsWorkspace.Listener() {
          @Override
          public void openCash() {
            settingsOpen = false;
            activeTab = TAB_CASH;
            clearError();
            render();
          }

          @Override
          public void openReports() {
            settingsOpen = false;
            activeTab = TAB_REPORTS;
            clearError();
            render();
          }

          @Override
          public void onSyncRequested() {
            syncOperations(true);
          }

          @Override
          public void refreshNotifications(OperationData snapshot) {
            if (localNotifications != null) {
              localNotifications.refreshCurrentSnapshot(snapshot);
            }
          }

          @Override
          public int localPendingActionCount() {
            return MainActivity.this.localPendingActionCount();
          }

          @Override
          public View actionCard(OperationData.ActionRecord action) {
            return MainActivity.this.actionCard(action);
          }
        }
    );
    operationsSyncController = new AndroidOperationsSyncController(
        this,
        preferences,
        executor,
        operationsTransport,
        identity,
        actionOutbox,
        operationCache,
        localNotifications
    );
    marketWorkspace = new MarketWorkspace(this, new MarketWorkspace.Listener() {
      @Override
      public boolean onSubmit(
          String actionType,
          JSONObject actionPayload,
          String acceptedMessage,
          String queuedMessage
      ) {
        return sendMarketAction(actionType, actionPayload, acceptedMessage, queuedMessage);
      }

      @Override
      public boolean onBarcodeScan(String barcode, JSONObject actionPayload) {
        return sendMarketBarcodeScan(barcode, actionPayload);
      }

      @Override
      public void onProductLookupRequested(String provider, String barcode, boolean includeImages) {
        executor.execute(() -> {
          ProductDataLookupClient.Result result = null;
          String errorMessage = "";
          try {
            result = productDataLookupClient.lookup(provider, barcode, includeImages);
          } catch (ProductDataLookupClient.LookupException error) {
            errorMessage = error.getMessage() == null ? "Ürün bilgileri alınamadı." : error.getMessage();
          }
          ProductDataLookupClient.Result completed = result;
          String completedError = errorMessage;
          runOnUiThread(() -> {
            if (marketWorkspace != null) {
              marketWorkspace.onProductLookupCompleted(barcode, completed, completedError);
            }
          });
        });
      }

      @Override
      public void onProductImageRequested(String productId, String provider, String imageUrl) {
        executor.execute(() -> {
          android.graphics.Bitmap preview = null;
          try {
            preview = productDataLookupClient.previewImage(provider, imageUrl);
          } catch (ProductDataLookupClient.LookupException ignored) {
            // Product details remain useful even if an optional image cannot be loaded.
          }
          android.graphics.Bitmap completedPreview = preview;
          runOnUiThread(() -> {
            if (marketWorkspace != null) {
              marketWorkspace.onProductImageLoaded(productId, imageUrl, completedPreview);
            }
          });
        });
      }

      @Override
      public void onRenderRequested() {
        render();
      }
    });
    OperationData cachedData = operationCache.load();
    if (cachedData != null) {
      data = cachedData;
      connectionState = "Son kayıtlı veri gösteriliyor";
    }
    applyConnectionExtras();
    SyncJobService.schedule(this);
    applyNotificationIntent(getIntent());
    shell.build();
    render();
    requestNotificationPermissionIfNeeded();
    if (ConnectionSettings.hasPendingBootstrap(preferences)) {
      bootstrapProvisioning();
    } else if (hasConnectionSettings()) {
      syncOperations(false);
    } else {
      showError("Canlı veriyi görmek için Ayarlar'dan bağlantıyı tamamlayın.");
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    foregroundSyncController.resume();
  }

  @Override
  protected void onPause() {
    foregroundSyncController.pause();
    super.onPause();
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    String webModuleDraft = settingsWorkspace == null
        ? null
        : settingsWorkspace.webModuleDraft();
    String syncSecretDraft = settingsWorkspace == null
        ? null
        : settingsWorkspace.syncSecretDraft();
    shell.rememberCurrentScrollPosition();
    super.onConfigurationChanged(newConfig);
    shell.build();
    render();
    if (settingsWorkspace != null) {
      settingsWorkspace.restoreDrafts(webModuleDraft, syncSecretDraft);
    }
  }

  @Override
  protected void onDestroy() {
    foregroundSyncController.destroy();
    executor.shutdownNow();
    if (imageCaptureController != null) {
      imageCaptureController.destroy();
    }
    super.onDestroy();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    provisioningController.captureIntent(intent);
    applyNotificationIntent(intent);
    if (ConnectionSettings.hasPendingBootstrap(preferences) && !loading) {
      bootstrapProvisioning();
    } else {
      render();
    }
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE && localNotifications != null) {
      localNotifications.refreshCurrentSnapshot(data);
    }
  }



  private void bootstrapProvisioning() {
    if (loading || identity == null || provisioningController == null) {
      return;
    }
    provisioningController.bootstrap(identity);
  }







  private void launchStockCamera() {
    if (!data.hasPermission("menu.stock_update") || !AndroidUiRules.canUseAi(data)) {
      showError("Bu cihazda AI destekli stok girişi kullanılamıyor.");
      return;
    }
    imageCaptureController.launchStockCamera();
  }

  private void launchStockGallery() {
    if (!data.hasPermission("menu.stock_update") || !AndroidUiRules.canUseAi(data)) {
      showError("Bu cihazda AI destekli stok girişi kullanılamıyor.");
      return;
    }
    imageCaptureController.launchStockGallery();
  }

  private void deletePendingStockCameraFile() {
    if (imageCaptureController != null) {
      imageCaptureController.cleanupStockCameraFile();
    }
  }

  private void showStockImagePreviewDialog(Uri sourceUri) {
    stockImageWorkflow.showPreview(sourceUri);
  }

  private void applyConnectionExtras() {
    AndroidConnectionController.ApplyResult result =
        connectionController.applyIntentConnection(getIntent(), data, actionOutbox);
    if (!result.connectionState.isEmpty()) {
      connectionState = result.connectionState;
    }
  }







  private void applyNotificationIntent(Intent intent) {
    if (intent == null) {
      return;
    }
    String route = intent.getStringExtra(LocalNotificationCenter.EXTRA_ROUTE);
    if (route == null || route.trim().isEmpty()) {
      return;
    }
    String normalized = route.trim();
    settingsOpen = "settings".equals(normalized)
        && (!data.permissionsResolved || data.hasPermission("settings.view"));
    if (settingsOpen) {
      return;
    }
    openRoute(normalized);
  }

  private void openRoute(String route) {
    AndroidUiRules.Destination destination = AndroidUiRules.resolveDestination(route);
    settingsOpen = false;
    if (TAB_REPORTS.equals(destination.tab) && !canOpenTab(TAB_REPORTS)) {
      activeTab = TAB_TODAY;
      showError("Bu cihazın raporlara erişim yetkisi yok.");
      return;
    }
    if (workspaceCoordinator != null) {
      workspaceCoordinator.applyDestination(data, destination);
    }
    activeTab = canOpenTab(destination.tab) ? destination.tab : TAB_TODAY;
  }

  private void requestNotificationPermissionIfNeeded() {
    if (Build.VERSION.SDK_INT < 33
        || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        || preferences.getBoolean(KEY_NOTIFICATION_PERMISSION_REQUESTED, false)) {
      return;
    }
    preferences.edit().putBoolean(KEY_NOTIFICATION_PERMISSION_REQUESTED, true).apply();
    requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, NOTIFICATION_PERMISSION_REQUEST_CODE);
  }

  private void switchTheme() {
    shell.rememberCurrentScrollPosition();
    AppTheme.Mode nextMode = themeMode.toggled();
    boolean persisted = AppTheme.save(preferences, nextMode);
    themeMode = nextMode;
    setTheme(themeStyleResource(themeMode));
    UiKit.applyTheme(AppTheme.tokens(themeMode));
    applyWindowTheme();
    shell.build();
    render();
    if (!persisted) {
      Toast.makeText(this, "Tema seçimi kalıcı olarak kaydedilemedi.", Toast.LENGTH_SHORT).show();
    }
  }

  private int themeStyleResource(AppTheme.Mode mode) {
    return mode == AppTheme.Mode.DAY ? R.style.AppTheme_Day : R.style.AppTheme_Night;
  }

  private void applyWindowTheme() {
    getWindow().setStatusBarColor(UiKit.BG);
    getWindow().setNavigationBarColor(UiKit.BG);
    getWindow().setBackgroundDrawable(new ColorDrawable(UiKit.BG));
    int flags = themeMode == AppTheme.Mode.DAY
        ? View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        : 0;
    getWindow().getDecorView().setSystemUiVisibility(flags);
  }

  private void render() {
    shell.rememberCurrentScrollPosition();
    if (operationCards != null) {
      operationCards.setData(data);
    }
    boolean canOpenSettings = !data.permissionsResolved || data.deviceActive;
    if (settingsOpen && !canOpenSettings) {
      settingsOpen = false;
    }
    if (!canOpenTab(activeTab)) {
      activeTab = TAB_TODAY;
    }
    if (workspaceCoordinator != null) {
      workspaceCoordinator.normalize(data);
    }
    boolean inactiveDevice = data.permissionsResolved && !data.deviceActive;
    if (inactiveDevice) {
      settingsOpen = false;
    }

    String screenKey = currentScreenKey(inactiveDevice);
    shell.updateChrome(
        activeTab,
        settingsOpen,
        inactiveDevice,
        canOpenSettings,
        loading,
        hasConnectionSettings()
    );

    View screen;
    String title;
    if (inactiveDevice) {
      title = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ANDROID) ? "Cihaz Pasif" : "Android Kapalı";
      screen = inactiveDeviceScreen();
    } else if (settingsOpen) {
      title = "Ayarlar";
      screen = settingsScreen();
    } else if (TAB_CUSTOMERS.equals(activeTab)) {
      title = "Müşteri";
      screen = customerScreen();
    } else if (TAB_PENSION.equals(activeTab)) {
      title = "Pansiyon";
      screen = pensionScreen();
    } else if (TAB_RESTAURANT.equals(activeTab)) {
      title = "Restoran";
      screen = restaurantScreen();
    } else if (TAB_MARKET.equals(activeTab)) {
      title = "Market";
      screen = marketWorkspace.create(data, localPendingActionCount(), loading);
    } else if (TAB_MESSAGES.equals(activeTab)) {
      title = "Mesajlar";
      screen = messagesScreen();
    } else if (TAB_CASH.equals(activeTab)) {
      title = "Kasa";
      screen = FinanceWorkspace.create(this, data, actionPayload ->
          sendAction("finance_manual_create", actionPayload, "Kasa hareketi gönderildi."));
    } else if (TAB_REPORTS.equals(activeTab)) {
      title = "Raporlar";
      screen = reportsScreen();
    } else {
      title = "Bugün";
      screen = todayScreen();
    }

    shell.showScreen(title, headerMetaText(), screen, screenKey);
  }

  private String currentScreenKey(boolean inactiveDevice) {
    if (inactiveDevice) {
      return "inactive";
    }
    if (settingsOpen) {
      return "settings";
    }
    if (TAB_CUSTOMERS.equals(activeTab)
        || TAB_PENSION.equals(activeTab)
        || TAB_RESTAURANT.equals(activeTab)) {
      return workspaceCoordinator == null
          ? activeTab
          : workspaceCoordinator.screenKey(activeTab);
    }
    if (TAB_MARKET.equals(activeTab)) {
      return TAB_MARKET + ":" + (marketWorkspace == null ? "home" : marketWorkspace.screenKey());
    }
    if (TAB_MESSAGES.equals(activeTab)) {
      return workspaceCoordinator == null
          ? TAB_MESSAGES
          : workspaceCoordinator.screenKey(TAB_MESSAGES);
    }
    if (TAB_CASH.equals(activeTab)) {
      return TAB_CASH;
    }
    if (TAB_REPORTS.equals(activeTab)) {
      return TAB_REPORTS + ":" + (reportsWorkspace == null ? AndroidUiRules.REPORT_LAST_7 : reportsWorkspace.screenKey());
    }
    return activeTab;
  }

  private boolean canOpenTab(String tab) {
    return AndroidUiRules.canOpenTab(data, tab);
  }

  private View inactiveDeviceScreen() {
    LinearLayout page = UiKit.column(this);
    boolean androidEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ANDROID);
    page.addView(androidEnabled
        ? screenIntro("ERİŞİM DURUMU", "Bu cihaz pasifleştirildi", "Cihaz masaüstünde pasifleştirilmiş. Yerel ağ bağlantısı aynı ağda otomatik hazırlanır; işletme işlemleri için masaüstünden yeniden etkinleştirilmesi gerekir.", false)
        : screenIntro("ERİŞİM DURUMU", "Android bağlantısı kapalı", "İşletmenin Android hizmeti kapatıldığı için telefondaki işletme verileri temizlendi.", false));

    ConnectionSettings.LocalConnection inactiveLocal = ConnectionSettings.localConnection(preferences);
    if (androidEnabled) {
      LinearLayout localCard = UiKit.card(this);
      localCard.addView(UiKit.text(this, "Yerel ağ", 14, UiKit.TEXT, Typeface.BOLD));
      localCard.addView(UiKit.text(
          this,
          inactiveLocal.isComplete()
              ? "Bu telefon masaüstüyle yerel ağ için otomatik bağlandı. İşletme işlemleri için cihazı masaüstünden etkinleştirin."
              : "Masaüstü aynı ağda bulunursa yerel bağlantı otomatik hazırlanır.",
          12,
          UiKit.SECONDARY,
          Typeface.NORMAL
      ));
      localCard.addView(UiKit.divider(this));
      localCard.addView(settingLine(
          "Yerel bağlantı",
          inactiveLocal.isComplete() ? "Eşleşti" : (inactiveLocal.hasEndpoint() ? "Masaüstü bulundu" : "Bekliyor"),
          inactiveLocal.isComplete() ? UiKit.SUCCESS : UiKit.MUTED
      ));
      page.addView(localCard);
    }

    LinearLayout card = UiKit.card(this);
    card.addView(settingLine("Telefon kimliği", compactDeviceId(), UiKit.MUTED));
    card.addView(UiKit.divider(this));
    card.addView(settingLine("Rol", data.deviceRoleLabel(), UiKit.WARNING));
    if (inactiveLocal.hasEndpoint()) {
      card.addView(UiKit.divider(this));
      card.addView(settingLine("Yerel adres", inactiveLocal.baseUrl, UiKit.MUTED));
    }
    page.addView(card);
    return UiKit.scroll(this, page);
  }

  private View todayScreen() {
    return new TodayWorkspace(
        this,
        data,
        new TodayWorkspace.Listener() {
          @Override
          public View requestCard(OperationData.RequestRecord request) {
            return todayRequestCard(request);
          }

          @Override
          public View reservationCard(OperationData.ReservationRecord reservation) {
            return priorityReservationCard(reservation);
          }

          @Override
          public View orderCard(OperationData.TableOrder order) {
            return activeOrderCard(order);
          }

          @Override
          public View tableCard(OperationData.TableRecord table) {
            return MainActivity.this.tableCard(table);
          }

          @Override
          public View taskCard(OperationData.TaskRecord task) {
            return MainActivity.this.taskCard(task, true);
          }

          @Override
          public View stockCard(OperationData.TrackedStockItem item) {
            return priorityStockCard(item);
          }

          @Override
          public View actionCard(OperationData.ActionRecord action) {
            return MainActivity.this.actionCard(action);
          }

          @Override
          public void openRoute(String route) {
            MainActivity.this.openRoute(route);
            render();
          }

          @Override
          public ScrollView wrap(View page) {
            return mainScreenScroll(page);
          }

          @Override
          public int localPendingActionCount() {
            return MainActivity.this.localPendingActionCount();
          }
        }
    ).build();
  }

  private View customerScreen() {
    return workspaceCoordinator.customer(data, shell.contentBottomPaddingDp());
  }

  private View pensionScreen() {
    return workspaceCoordinator.pension(data, shell.contentBottomPaddingDp());
  }

  private View restaurantScreen() {
    return workspaceCoordinator.restaurant(data, shell.contentBottomPaddingDp());
  }

  private View messagesScreen() {
    return workspaceCoordinator.messages(data, shell.contentBottomPaddingDp());
  }

  private View reportsScreen() {
    return reportsWorkspace.build(data);
  }











  private View settingsScreen() {
    return settingsWorkspace.build(
        data,
        themeMode.label,
        connectionState,
        loading
    );
  }



  private View screenIntro(String eyebrow, String title, String description, boolean includeRefresh) {
    LinearLayout intro = UiKit.column(this);
    intro.setPadding(0, UiKit.dp(this, 4), 0, UiKit.dp(this, 8));
    intro.addView(UiKit.eyebrow(this, eyebrow));
    LinearLayout titleRow = UiKit.row(this);
    TextView titleView = UiKit.text(this, title, 18, UiKit.TEXT, Typeface.BOLD);
    titleView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    titleRow.addView(titleView);
    if (includeRefresh) {
      Button refresh = UiKit.chip(this, loading ? "Bekleyin" : "Yenile", false, view -> syncOperations(false));
      refresh.setEnabled(!loading);
      titleRow.addView(refresh);
    }
    intro.addView(titleRow);
    intro.addView(UiKit.text(this, description, 12, UiKit.SECONDARY, Typeface.NORMAL));
    return intro;
  }

  private View statusStrip(CounterValue... counters) {
    HorizontalScrollView scroll = new HorizontalScrollView(this);
    scroll.setHorizontalScrollBarEnabled(false);
    scroll.setClipToPadding(false);
    scroll.setContentDescription("Sayaçlar");
    LinearLayout row = UiKit.row(this);
    row.setPadding(0, UiKit.dp(this, 2), UiKit.dp(this, 4), UiKit.dp(this, 7));
    for (CounterValue counter : counters) {
      View.OnClickListener listener = counter.route.isEmpty()
          ? null
          : view -> {
            openRoute(counter.route);
            render();
          };
      row.addView(UiKit.counterChip(this, counter.label, counter.value, counter.tone, listener));
    }
    scroll.addView(row);
    return scroll;
  }

  private ScrollView mainScreenScroll(View page) {
    return UiKit.scroll(
        this,
        page,
        shell.contentBottomPaddingDp()
    );
  }

  private View sectionLabel(String value) {
    TextView label = UiKit.text(this, value, 16, UiKit.TEXT, Typeface.BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(this, 7), 0, UiKit.dp(this, 7));
    label.setLayoutParams(params);
    return label;
  }

  private View filterBar(String[][] options, String selected, FilterListener listener) {
    HorizontalScrollView scroll = new HorizontalScrollView(this);
    scroll.setHorizontalScrollBarEnabled(false);
    LinearLayout row = UiKit.row(this);
    row.setPadding(0, UiKit.dp(this, 3), 0, UiKit.dp(this, 6));
    for (String[] option : options) {
      row.addView(UiKit.chip(this, option[1], option[0].equals(selected), view -> listener.onSelect(option[0])));
    }
    scroll.addView(row);
    return scroll;
  }

  private View emptyCard(String title, String detail) {
    LinearLayout card = UiKit.card(this);
    card.addView(UiKit.text(this, title, 14, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(this, detail, 12, UiKit.SECONDARY, Typeface.NORMAL));
    return card;
  }

  private View permissionDeniedCard() {
    return emptyCard("Bu cihazın bu alan için yetkisi yok", "Yetkiler masaüstü yöneticisi tarafından belirlenir.");
  }

  private View todayRequestCard(OperationData.RequestRecord request) {
    return operationCards.todayRequestCard(request);
  }

  private View requestCard(OperationData.RequestRecord request) {
    return operationCards.requestCard(request);
  }

  private View waitingMessageCard(OperationData.RequestRecord request) {
    return operationCards.waitingMessageCard(request);
  }



  private View reservationCard(OperationData.ReservationRecord reservation, boolean compact) {
    return operationCards.reservationCard(reservation);
  }

  private View priorityReservationCard(OperationData.ReservationRecord reservation) {
    return reservationCard(reservation, true);
  }

  private View roomCard(OperationData.RoomRecord room) {
    return operationCards.roomCard(room);
  }

  private View customerRoomStayCard(OperationData.CustomerRoomStayRecord stay) {
    return operationCards.customerRoomStayCard(stay);
  }

  private View taskCard(OperationData.TaskRecord task, boolean compact) {
    return operationCards.taskCard(task, compact);
  }

  private View tableCard(OperationData.TableRecord table) {
    return operationCards.tableCard(table);
  }

  private View stockCard(OperationData.TrackedStockItem item) {
    return operationCards.stockCard(item);
  }

  private View adminMenuCategoryCard(OperationData.MenuCategory category) {
    return operationCards.adminMenuCategoryCard(category);
  }

  private View adminMenuItemCard(OperationData.MenuItem item) {
    return operationCards.adminMenuItemCard(item);
  }

  private View stockImageImportCard() {
    return operationCards.stockImageImportCard();
  }

  private View priorityStockCard(OperationData.TrackedStockItem item) {
    return operationCards.priorityStockCard(item);
  }

  private void showRoomStatusDialog(OperationData.RoomRecord room) {
    OperationMutationDialogs.showRoomStatus(
        this,
        room,
        new OperationMutationDialogs.Listener() {
          @Override
          public void updateRoom(OperationData.RoomRecord selected, String status) {
            MainActivity.this.updateRoom(selected, status);
          }

          @Override
          public void updateTable(OperationData.TableRecord selected, String status) {
            MainActivity.this.updateTable(selected, status);
          }

          @Override
          public void sendAction(
              String actionType,
              JSONObject actionPayload,
              String successMessage
          ) {
            MainActivity.this.sendAction(actionType, actionPayload, successMessage);
          }

          @Override
          public void configureBottomDialog(Dialog dialog) {
            MainActivity.this.configureBottomDialog(dialog);
          }

          @Override
          public AlertDialog.Builder alertDialogBuilder() {
            return MainActivity.this.alertDialogBuilder();
          }
        }
    );
  }

  private void showTableStatusDialog(OperationData.TableRecord table) {
    OperationMutationDialogs.showTableStatus(
        this,
        data,
        table,
        new OperationMutationDialogs.Listener() {
          @Override
          public void updateRoom(OperationData.RoomRecord selected, String status) {
            MainActivity.this.updateRoom(selected, status);
          }

          @Override
          public void updateTable(OperationData.TableRecord selected, String status) {
            MainActivity.this.updateTable(selected, status);
          }

          @Override
          public void sendAction(
              String actionType,
              JSONObject actionPayload,
              String successMessage
          ) {
            MainActivity.this.sendAction(actionType, actionPayload, successMessage);
          }

          @Override
          public void configureBottomDialog(Dialog dialog) {
            MainActivity.this.configureBottomDialog(dialog);
          }

          @Override
          public AlertDialog.Builder alertDialogBuilder() {
            return MainActivity.this.alertDialogBuilder();
          }
        }
    );
  }



  private void showStockActionsDialog(OperationData.TrackedStockItem item) {
    OperationMutationDialogs.showStockActions(
        this,
        item,
        new OperationMutationDialogs.Listener() {
          @Override
          public void updateRoom(OperationData.RoomRecord selected, String status) {
            MainActivity.this.updateRoom(selected, status);
          }

          @Override
          public void updateTable(OperationData.TableRecord selected, String status) {
            MainActivity.this.updateTable(selected, status);
          }

          @Override
          public void sendAction(
              String actionType,
              JSONObject actionPayload,
              String successMessage
          ) {
            MainActivity.this.sendAction(actionType, actionPayload, successMessage);
          }

          @Override
          public void configureBottomDialog(Dialog dialog) {
            MainActivity.this.configureBottomDialog(dialog);
          }

          @Override
          public AlertDialog.Builder alertDialogBuilder() {
            return MainActivity.this.alertDialogBuilder();
          }
        }
    );
  }



  private View activeOrderCard(OperationData.TableOrder order) {
    return operationCards.activeOrderCard(order);
  }

  private View messageCard(OperationData.MessageRecord message) {
    return operationCards.messageCard(message);
  }

  private View messageCard(
      OperationData.MessageRecord message,
      String status,
      int tone,
      String previewText
  ) {
    return operationCards.messageCard(message, status, tone, previewText);
  }

  private View actionCard(OperationData.ActionRecord action) {
    return operationCards.actionCard(action);
  }

  private View settingLine(String label, String value, int tone) {
    LinearLayout row = UiKit.row(this);
    TextView title = UiKit.text(this, label, 13, UiKit.MUTED, Typeface.BOLD);
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    row.addView(title);
    TextView detail = UiKit.text(this, value, 13, tone, Typeface.BOLD);
    detail.setGravity(Gravity.END);
    detail.setMaxWidth(UiKit.dp(this, 190));
    row.addView(detail);
    return row;
  }

  private TextView statusBadge(String label, int tone) {
    return UiKit.badge(this, label, tone);
  }

  private void showCustomerDetail(OperationData.CustomerRecord customer) {
    detailDialogCoordinator.showCustomerDetail(data, customer);
  }

  private void showCustomerForm(OperationData.CustomerRecord existing) {
    if (!data.isAdmin() || !data.hasPermission("customer.manage")) {
      showError("Müşteri kartları yalnız yönetici cihazlarda düzenlenebilir.");
      return;
    }

    CustomerFormDialog formDialog = new CustomerFormDialog(
        this,
        existing,
        AndroidUiRules.canUseAi(data),
        new CustomerFormDialog.Listener() {
          @Override
          public void onIdentityImageRequested() {
            identityImageWorkflow.showSourceDialog();
          }

          @Override
          public void onSubmit(String actionType, JSONObject actionPayload, String successMessage) {
            sendAction(actionType, actionPayload, successMessage);
          }

          @Override
          public void onDismiss(CustomerFormDialog closedDialog) {
            identityImageWorkflow.onFormDismiss(closedDialog);
          }
        }
    );
    identityImageWorkflow.attachForm(formDialog);
    formDialog.show();
    configureFullDialog(formDialog.dialog());
  }



  private void showRoomAssignmentDialog(
      OperationData.CustomerRecord preferredCustomer,
      OperationData.RoomRecord preferredRoom
  ) {
    detailDialogCoordinator.showRoomAssignment(
        data,
        preferredCustomer,
        preferredRoom
    );
  }

  private void showCustomerRoomStayActions(OperationData.CustomerRoomStayRecord stay) {
    detailDialogCoordinator.showStayActions(data, stay);
  }

  private void showRequestDetail(OperationData.RequestRecord request) {
    detailDialogCoordinator.showRequestDetail(data, request);
  }

  private void showReservationDetail(OperationData.ReservationRecord reservation) {
    detailDialogCoordinator.showReservationDetail(data, reservation);
  }

  private void showMessageDetail(OperationData.MessageRecord message) {
    detailDialogCoordinator.showMessageDetail(data, message);
  }



  private void showPreparedReply(String customerName, String message) {
    OperationData.MessageRecord prepared = new OperationData.MessageRecord();
    prepared.customerName = customerName;
    prepared.message = message;
    showMessageDetail(prepared);
  }

  private void showTableOrder(OperationData.TableRecord table) {
    detailDialogCoordinator.showTableOrder(data, table);
  }

  private void addOrderItem(OperationData.TableRecord table, OperationData.TableOrder order, OperationData.MenuItem item) {
    if (item.outOfStock()) {
      String message = "Stokta yeterli ürün yok";
      showError(message);
      Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
      return;
    }
    if (order == null) {
      ArrayList<AndroidActionDispatcher.Command> actions = new ArrayList<>();
      AndroidActionDispatcher.Command openAction = new AndroidActionDispatcher.Command("table_order_open", payload(
          "table_id", table.id,
          "expected_table_updated_at", table.updatedAt
      ));
      actions.add(openAction);
      actions.add(new AndroidActionDispatcher.Command("table_order_add_item", payload(
          "table_id", table.id,
          "menu_item_id", item.id,
          "quantity", 1,
          "depends_on_action_id", openAction.id
      )));
      sendActions(actions, item.name + " için adisyon açma ve ekleme işlemleri gönderildi.");
    } else {
      sendAction("table_order_add_item", payload(
          "order_id", order.id,
          "table_id", table.id,
          "menu_item_id", item.id,
          "quantity", 1,
          "expected_order_updated_at", order.updatedAt
      ), item.name + " adisyona eklenmek üzere gönderildi.");
    }
  }

  private void sendOrderStatus(OperationData.TableOrder order, String status) {
    String actionType = "served".equals(status)
        ? "table_order_set_served"
        : ("payment".equals(status) ? "table_order_set_payment_waiting" : "table_order_set_preparing");
    sendAction(actionType, payload("order_id", order.id, "table_id", order.tableId, "status", status, "expected_updated_at", order.updatedAt), "Adisyon durumu güncellenmek üzere gönderildi.");
  }

  private void closeOrder(OperationData.TableOrder order, String status) {
    String actionType = "paid".equals(status) ? "table_order_close_paid" : "table_order_cancel";
    sendAction(actionType, payload("order_id", order.id, "table_id", order.tableId, "status", status, "expected_updated_at", order.updatedAt), "Adisyon kapatma işlemi gönderildi.");
  }

  private void updateRoom(OperationData.RoomRecord room, String status) {
    sendAction("room_status_update", payload("room_id", room.id, "status", status, "expected_updated_at", room.updatedAt), room.name + " durumu güncellenmek üzere gönderildi.");
  }

  private void updateTable(OperationData.TableRecord table, String status) {
    sendAction("table_status_update", payload("table_id", table.id, "status", status, "expected_updated_at", table.updatedAt), table.name + " durumu güncellenmek üzere gönderildi.");
  }

  private ReservationEditorDialog.Kind reservationEditorKind(
      OperationData.ReservationRecord reservation
  ) {
    return ReservationDetailDialog.editorKind(reservation);
  }

  private void showReservationEditor(
      ReservationEditorDialog.Kind kind,
      OperationData.ReservationRecord reservation
  ) {
    detailDialogCoordinator.showReservationEditor(data, kind, reservation);
  }

  private void showDailyTaskEditor(
      DailyTaskEditorDialog.Kind kind,
      OperationData.TaskRecord task
  ) {
    detailDialogCoordinator.showDailyTaskEditor(data, kind, task);
  }

  private void sendReservationAction(OperationData.ReservationRecord reservation, String actionType, String message) {
    sendAction(actionType, payload(
        "reservation_id", reservation.id,
        "reservation_type", reservation.type,
        "expected_updated_at", reservation.updatedAt
    ), message);
  }

  private void syncOperations(boolean readSettingsInputs) {
    if (loading) {
      return;
    }
    if (readSettingsInputs && data.permissionsResolved && !data.hasPermission("settings.edit")) {
      showError("Bu cihazın bağlantı ayarlarını değiştirme yetkisi yok.");
      return;
    }

    String baseUrl = readSettingsInputs && settingsWorkspace != null
        ? settingsWorkspace.webModuleValue()
        : ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = readSettingsInputs && settingsWorkspace != null
        ? settingsWorkspace.syncSecretValue()
        : ConnectionSettings.syncSecret(preferences);

    operationsSyncController.sync(baseUrl, syncSecret, data, new AndroidOperationsSyncController.Listener() {
      @Override
      public void onRejected(String message) {
        showError(message);
      }

      @Override
      public void onStarted(String nextConnectionState) {
        loading = true;
        connectionState = nextConnectionState;
        clearError();
      }

      @Override
      public void onSuccess(AndroidOperationsSyncController.SyncResult result) {
        if (!result.usedLocalTransport) {
          if (result.webAllowsLocalNetwork) {
            foregroundSyncController.requestLocalDiscovery(false);
          } else {
            ConnectionSettings.clearLocalEndpoint(preferences);
          }
        }

        data = result.data;
        loading = false;
        connectionState = result.connectionState;
        if (result.discardedActionCount > 0) {
          showError(result.discardedActionCount + " bekleyen telefon işlemi yeni yetki veya capability sınırı nedeniyle iptal edildi.");
        } else {
          clearError();
          if (result.retryingOnlyMarketActions && marketWorkspace != null) {
            marketWorkspace.onSubmissionAccepted(
                result.retriedMarketActionType,
                "Bekleyen Market işlemi masaüstüne gönderildi."
            );
          }
        }
        if (result.shouldRender) {
          render();
        }
      }

      @Override
      public void onAndroidDisabled(OperationData disabledData, String message) {
        data = disabledData;
        loading = false;
        connectionState = message;
        showError(message);
        render();
      }

      @Override
      public void onFailure(
          String message,
          boolean retryingOnlyMarketActions,
          String retriedMarketActionType
      ) {
        loading = false;
        connectionState = message;
        if (retryingOnlyMarketActions && marketWorkspace != null) {
          clearError();
          marketWorkspace.onSubmissionQueued(
              retriedMarketActionType,
              "Gönderim bekliyor. Bağlantı gelince yeniden gönderilecek."
          );
          render();
        } else {
          showError(message);
        }
      }
    });
  }

  private void sendAction(String actionType, JSONObject actionPayload, String successMessage) {
    ArrayList<AndroidActionDispatcher.Command> actions = new ArrayList<>();
    actions.add(new AndroidActionDispatcher.Command(actionType, actionPayload));
    sendActions(actions, successMessage);
  }

  private void sendActions(
      List<AndroidActionDispatcher.Command> actions,
      String successMessage
  ) {
    actionDispatcher.send(actions, successMessage, null, data);
  }

  private boolean sendMarketAction(
      String actionType,
      JSONObject actionPayload,
      String acceptedMessage,
      String queuedMessage
  ) {
    ArrayList<AndroidActionDispatcher.Command> actions = new ArrayList<>();
    actions.add(new AndroidActionDispatcher.Command(actionType, actionPayload));
    return actionDispatcher.send(actions, acceptedMessage, queuedMessage, data);
  }

  private boolean sendMarketBarcodeScan(String barcode, JSONObject actionPayload) {
    return actionDispatcher.sendBarcodeScan(barcode, actionPayload, data);
  }

  private void showError(String message) {
    currentError = message == null ? "" : message;
    shell.updateError(currentError);
  }

  private void clearError() {
    currentError = "";
    shell.updateError(currentError);
  }

  private int localPendingActionCount() {
    if (actionOutbox == null) {
      return 0;
    }
    try {
      return actionOutbox.load().size();
    } catch (ActionOutbox.OutboxException ignored) {
      return 0;
    }
  }






  private void confirm(String title, String message, Runnable action) {
    interactionController.confirm(themeMode, title, message, action);
  }

  private AlertDialog.Builder alertDialogBuilder() {
    return interactionController.alertDialogBuilder(themeMode);
  }

  private void configureFullDialog(Dialog dialog) {
    interactionController.configureFullDialog(dialog);
  }

  private void configureBottomDialog(Dialog dialog) {
    interactionController.configureBottomDialog(dialog);
  }

  private void openDialer(String phone) {
    interactionController.openDialer(phone);
  }

  private void openWhatsApp(String phone, String message) {
    interactionController.openWhatsApp(data, phone, message);
  }

  private void copyText(String value) {
    interactionController.copyText(value);
  }

  private String headerMetaText() {
    String role = data.permissionsResolved ? data.deviceRoleLabel() : "Personel (atanıyor)";
    String timestamp = shortTimestamp(data.pulledAt);
    if (timestamp.isEmpty()) {
      return role + " · Henüz sync yok";
    }
    int separator = timestamp.lastIndexOf(' ');
    String time = separator >= 0 && separator + 1 < timestamp.length()
        ? timestamp.substring(separator + 1)
        : timestamp;
    return role + " · Son sync " + time;
  }











  private int countCoreTasks(boolean completed) {
    int count = 0;
    for (OperationData.TaskRecord task : data.tasks) {
      if (!"core".equals(AndroidUiRules.taskDomain(data, task)) || !AndroidUiRules.taskAllowed(data, task)) {
        continue;
      }
      if ((completed && "done".equals(task.status)) || (!completed && "pending".equals(task.status))) {
        count += 1;
      }
    }
    return count;
  }

  private int countOrdersByStatus(String status) {
    int count = 0;
    for (OperationData.TableOrder order : data.tableOrders) {
      if (status.equals(order.status) && order.isActive()) {
        count += 1;
      }
    }
    return count;
  }






  private boolean hasConnectionSettings() {
    return connectionController != null && connectionController.hasConnectionSettings();
  }

  private boolean isPensionReservation(OperationData.ReservationRecord reservation) {
    return AndroidUiRules.isPensionReservation(data, reservation);
  }




















  private String textValue(EditText input) {
    return input == null ? "" : input.getText().toString().trim();
  }

  private String selectedChoiceValue(Spinner spinner) {
    Object selected = spinner == null ? null : spinner.getSelectedItem();
    return selected instanceof ChoiceItem ? ((ChoiceItem) selected).value : "";
  }










  private String compactDeviceId() {
    return identity.deviceId.length() <= 20 ? identity.deviceId : identity.deviceId.substring(0, 12) + "…" + identity.deviceId.substring(identity.deviceId.length() - 5);
  }





























  private OperationData.TrackedStockItem trackedStockItem(String menuItemId) {
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      if (item.menuItemId.equals(menuItemId)) {
        return item;
      }
    }
    return null;
  }



  private JSONObject payload(Object... values) {
    JSONObject payload = new JSONObject();
    try {
      for (int index = 0; index + 1 < values.length; index += 2) {
        payload.put(String.valueOf(values[index]), values[index + 1]);
      }
    } catch (Exception ignored) {
      // Values used by the UI are primitive strings and numbers.
    }
    return payload;
  }

  private interface FilterListener {
    void onSelect(String value);
  }

  private static final class CounterValue {
    final String label;
    final int value;
    final int tone;
    final String route;

    CounterValue(String label, int value, int tone, String route) {
      this.label = label;
      this.value = value;
      this.tone = tone;
      this.route = route == null ? "" : route;
    }
  }



  private static final class ChoiceItem {
    final String value;
    final String label;

    ChoiceItem(String value, String label) {
      this.value = value == null ? "" : value;
      this.label = label == null ? "" : label;
    }

    @Override
    public String toString() {
      return label;
    }
  }




}

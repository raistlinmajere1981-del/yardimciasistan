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
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
  private static final int BOTTOM_NAV_HEIGHT_DP = 70;
  private static final int MAIN_CONTENT_BOTTOM_PADDING_DP = BOTTOM_NAV_HEIGHT_DP + 24;
  private static final int LANDSCAPE_CONTENT_BOTTOM_PADDING_DP = 18;
  private static final int LANDSCAPE_SIDE_NAV_WIDTH_DP = 112;
  private static final int PORTRAIT_HEADER_HEIGHT_DP = 72;
  private static final int LANDSCAPE_HEADER_HEIGHT_DP = 60;
  private static final int HEADER_ACTION_SIZE_DP = 44;
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
  private String customerFilter = AndroidUiRules.CUSTOMER_NEW;
  private String pensionMode = AndroidUiRules.PENSION_RESERVATIONS;
  private String restaurantMode = AndroidUiRules.RESTAURANT_TABLES;
  private String messageMode = AndroidUiRules.MESSAGES_PREPARED;
  private String reportPreset = AndroidUiRules.REPORT_LAST_7;
  private String reportAiAnswer = "";
  private String reportAiMessage = "";
  private boolean reportAiLoading;
  private int reportAiRequestVersion;
  private boolean settingsOpen;
  private boolean loading;
  private String connectionState = "Henüz bağlanmadı";

  private LinearLayout root;
  private FrameLayout content;
  private LinearLayout bottomNavigation;
  private TextView headerTitle;
  private TextView headerMeta;
  private TextView errorBanner;
  private Button refreshButton;
  private ImageButton themeButton;
  private Button settingsButton;
  private boolean landscapeLayout;
  private final Map<String, Integer> screenScrollPositions = new HashMap<>();
  private String renderedScreenKey = "";
  private String currentError = "";
  private AndroidImageCaptureController imageCaptureController;
  private AndroidProvisioningController provisioningController;
  private AndroidOperationsSyncController operationsSyncController;
  private AndroidForegroundSyncController foregroundSyncController;
  private AndroidActionDispatcher actionDispatcher;
  private AndroidConnectionController connectionController;
  private AndroidConnectionSettingsPanel connectionSettingsPanel;
  private IdentityImageAnalysisController identityImageAnalysisController;
  private StockImageAnalysisController stockImageAnalysisController;
  private CustomerFormDialog activeCustomerFormDialog;
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
        analyzeIdentityImage(uri);
      }

      @Override
      public void onError(String message) {
        showError(message);
      }
    });
    identityImageAnalysisController = new IdentityImageAnalysisController(this, executor, syncClient);
    stockImageAnalysisController = new StockImageAnalysisController(this, executor, syncClient);
    UiKit.applyTheme(AppTheme.tokens(themeMode));
    applyWindowTheme();
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
    buildShell();
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
    String webModuleDraft = connectionSettingsPanel == null
        ? null
        : connectionSettingsPanel.webModuleDraft();
    String syncSecretDraft = connectionSettingsPanel == null
        ? null
        : connectionSettingsPanel.syncSecretDraft();
    rememberCurrentScrollPosition();
    super.onConfigurationChanged(newConfig);
    buildShell();
    render();
    if (connectionSettingsPanel != null) {
      connectionSettingsPanel.restoreDrafts(webModuleDraft, syncSecretDraft);
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

  private void launchIdentityCamera() {
    if (activeCustomerFormDialog != null && activeCustomerFormDialog.isShowing()) {
      imageCaptureController.launchIdentityCamera();
    }
  }

  private void launchIdentityGallery() {
    if (activeCustomerFormDialog != null && activeCustomerFormDialog.isShowing()) {
      imageCaptureController.launchIdentityGallery();
    }
  }

  private void deletePendingStockCameraFile() {
    if (imageCaptureController != null) {
      imageCaptureController.cleanupStockCameraFile();
    }
  }

  private void deletePendingIdentityCameraFile() {
    if (imageCaptureController != null) {
      imageCaptureController.cleanupIdentityCameraFile();
    }
  }

  private void showIdentityImageSourceDialog() {
    if (!data.isAdmin() || !data.hasPermission("customer.manage") || !AndroidUiRules.canUseAi(data)) {
      showError("Kimlik görseli analizi yalnız yönetici cihazlarda kullanılabilir.");
      return;
    }
    new AlertDialog.Builder(this)
        .setTitle("Kimlik görselinden doldur")
        .setMessage("Kimliğin ön veya arka yüzünü çekebilir ya da galeriden seçebilirsiniz. Görsel kalıcı saklanmaz.")
        .setNegativeButton("Vazgeç", null)
        .setNeutralButton("Galeriden Seç", (dialog, which) -> launchIdentityGallery())
        .setPositiveButton("Fotoğraf Çek", (dialog, which) -> launchIdentityCamera())
        .show();
  }




  private void analyzeIdentityImage(Uri sourceUri) {
    CustomerFormDialog formDialog = activeCustomerFormDialog;
    if (formDialog == null || !formDialog.isShowing()) {
      deletePendingIdentityCameraFile();
      return;
    }
    if (!AndroidUiRules.canUseAi(data)) {
      deletePendingIdentityCameraFile();
      formDialog.setStatus("AI capability kapalı olduğu için kimlik analizi kullanılamıyor.", UiKit.DANGER);
      return;
    }

    String baseUrl = ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = ConnectionSettings.syncSecret(preferences);
    if (baseUrl.isEmpty() || syncSecret.isEmpty()) {
      deletePendingIdentityCameraFile();
      formDialog.setStatus("Kimlik analizi için bağlantı ayarlarını tamamlayın.", UiKit.DANGER);
      return;
    }

    formDialog.setLoading(true);
    formDialog.setStatus("Kimlik görseli hazırlanıyor ve AI ile okunuyor…", UiKit.INFO);
    identityImageAnalysisController.analyze(
        sourceUri,
        baseUrl,
        syncSecret,
        identity,
        new IdentityImageAnalysisController.Listener() {
          @Override
          public void onSuccess(JSONObject analysis, String message) {
            if (activeCustomerFormDialog != formDialog || !formDialog.isShowing()) {
              return;
            }
            formDialog.applyIdentityAnalysis(analysis);
            formDialog.setLoading(false);
            formDialog.setStatus(message, UiKit.SUCCESS);
            Toast.makeText(MainActivity.this, "Okunan alanları kaydetmeden önce kontrol edin.", Toast.LENGTH_LONG).show();
          }

          @Override
          public void onError(String message) {
            if (activeCustomerFormDialog != formDialog || !formDialog.isShowing()) {
              return;
            }
            formDialog.setLoading(false);
            formDialog.setStatus(message, UiKit.DANGER);
          }

          @Override
          public void onFinished() {
            deletePendingIdentityCameraFile();
          }
        }
    );
  }





  private void selectSpinnerValue(Spinner spinner, String value) {
    if (value == null || value.trim().isEmpty() || spinner.getAdapter() == null) {
      return;
    }
    for (int index = 0; index < spinner.getAdapter().getCount(); index += 1) {
      Object item = spinner.getAdapter().getItem(index);
      if (item instanceof ChoiceItem && value.equals(((ChoiceItem) item).value)) {
        spinner.setSelection(index);
        return;
      }
    }
  }

  private void showStockImagePreviewDialog(Uri sourceUri) {
    if (!data.hasPermission("menu.stock_update") || !AndroidUiRules.canUseAi(data)) {
      deletePendingStockCameraFile();
      showError("Bu cihazda AI destekli stok girişi kullanılamıyor.");
      return;
    }
    Dialog dialog = new Dialog(this);
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
    LinearLayout root = UiKit.column(this);
    root.setPadding(UiKit.dp(this, 16), UiKit.dp(this, 14), UiKit.dp(this, 16), UiKit.dp(this, 16));
    root.setBackgroundColor(UiKit.BG);

    LinearLayout header = UiKit.row(this);
    LinearLayout heading = UiKit.column(this);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(this, "AI DESTEKLİ STOK GİRİŞİ"));
    heading.addView(UiKit.title(this, "Görseli kontrol et"));
    header.addView(heading);
    Button close = UiKit.iconButton(this, "×", "Görsel ekranını kapat", false, view -> dialog.dismiss());
    header.addView(close, new LinearLayout.LayoutParams(UiKit.dp(this, 44), UiKit.dp(this, 44)));
    root.addView(header);

    TextView status = UiKit.text(this, "Görsel hazırlanıyor…", 13, UiKit.MUTED, Typeface.BOLD);
    LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, -2);
    statusParams.setMargins(0, UiKit.dp(this, 8), 0, UiKit.dp(this, 8));
    status.setLayoutParams(statusParams);
    root.addView(status);

    ImageView preview = new ImageView(this);
    preview.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
    preview.setAdjustViewBounds(true);
    preview.setBackground(UiKit.rounded(this, UiKit.SURFACE, UiKit.BORDER, 14));
    preview.setContentDescription("Seçilen fatura veya fiş önizlemesi");
    LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(-1, 0, 1f);
    previewParams.setMargins(0, 0, 0, UiKit.dp(this, 10));
    preview.setLayoutParams(previewParams);
    root.addView(preview);

    final StockImageFile.PreparedImage[] prepared = {null};
    final int[] rotation = {0};
    final boolean[] analyzing = {false};

    LinearLayout imageActions = UiKit.row(this);
    Button retake = UiKit.outlineButton(this, "Yeniden çek", view -> {
      dialog.dismiss();
      launchStockCamera();
    });
    Button reselect = UiKit.outlineButton(this, "Başka görsel seç", view -> {
      dialog.dismiss();
      launchStockGallery();
    });
    Button rotate = UiKit.outlineButton(this, "90° döndür", view -> {
      rotation[0] = (rotation[0] + 90) % 360;
      preview.setRotation(rotation[0]);
    });
    retake.setEnabled(false);
    reselect.setEnabled(false);
    rotate.setEnabled(false);
    UiKit.addAction(imageActions, retake, this);
    UiKit.addAction(imageActions, reselect, this);
    UiKit.addAction(imageActions, rotate, this);
    root.addView(imageActions);

    TextView privacy = UiKit.text(this,
        "Görsel analiz için işletmenin yapılandırdığı AI sağlayıcısına gönderilir; uygulamada kalıcı saklanmaz.",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    );
    LinearLayout.LayoutParams privacyParams = new LinearLayout.LayoutParams(-1, -2);
    privacyParams.setMargins(0, UiKit.dp(this, 9), 0, UiKit.dp(this, 9));
    privacy.setLayoutParams(privacyParams);
    root.addView(privacy);

    final Button[] analyze = {null};
    analyze[0] = UiKit.button(this, "Analiz Et", UiKit.PRIMARY, view -> {
      if (prepared[0] == null || analyzing[0]) {
        return;
      }
      String baseUrl = ConnectionSettings.webModuleUrl(preferences);
      String syncSecret = ConnectionSettings.syncSecret(preferences);
      if (baseUrl.isEmpty() || syncSecret.isEmpty()) {
        status.setText("Görsel analizi için bağlantı ayarlarını tamamlayın.");
        status.setTextColor(UiKit.DANGER);
        return;
      }
      JSONArray candidates = stockImageCandidatesJson();
      if (candidates.length() == 0) {
        status.setText("Stok takip edilen menü ürünü bulunamadı.");
        status.setTextColor(UiKit.DANGER);
        return;
      }
      analyzing[0] = true;
      dialog.setCancelable(false);
      close.setEnabled(false);
      analyze[0].setEnabled(false);
      retake.setEnabled(false);
      reselect.setEnabled(false);
      rotate.setEnabled(false);
      status.setText("Görsel analiz ediliyor; stoklar henüz değişmiyor…");
      status.setTextColor(UiKit.INFO);
      String importId = "stock_import_android_" + UUID.randomUUID().toString().replace("-", "");
      StockImageFile.PreparedImage baseImage = prepared[0];
      stockImageAnalysisController.analyze(
          baseImage,
          rotation[0],
          baseUrl,
          syncSecret,
          identity,
          importId,
          candidates,
          new StockImageAnalysisController.AnalysisListener() {
            @Override
            public void onSuccess(HostingSyncClient.StockImageAnalysisResult result) {
              if (!dialog.isShowing()) {
                return;
              }
              boolean duplicate = data.appliedStockImageHashes.contains(result.imageHash);
              dialog.dismiss();
              showStockImageReviewDialog(result, duplicate);
            }

            @Override
            public void onError(String message) {
              if (!dialog.isShowing()) {
                return;
              }
              analyzing[0] = false;
              dialog.setCancelable(true);
              close.setEnabled(true);
              analyze[0].setEnabled(true);
              retake.setEnabled(true);
              reselect.setEnabled(true);
              rotate.setEnabled(true);
              status.setText(message);
              status.setTextColor(UiKit.DANGER);
            }
          }
      );
    });
    analyze[0].setEnabled(false);
    root.addView(analyze[0], new LinearLayout.LayoutParams(-1, UiKit.dp(this, 48)));

    dialog.setOnDismissListener(value -> {
      if (prepared[0] != null) {
        preview.setImageDrawable(null);
        prepared[0].release();
        prepared[0] = null;
      }
    });
    dialog.setContentView(root);
    dialog.show();
    configureFullDialog(dialog);

    stockImageAnalysisController.prepare(sourceUri, new StockImageAnalysisController.PrepareListener() {
      @Override
      public void onReady(StockImageFile.PreparedImage ready) {
        deletePendingStockCameraFile();
        if (!dialog.isShowing()) {
          ready.release();
          return;
        }
        prepared[0] = ready;
        preview.setImageBitmap(ready.preview);
        status.setText("Görsel hazır. Gerekirse döndürüp analizi başlatın.");
        status.setTextColor(UiKit.SUCCESS);
        analyze[0].setEnabled(true);
        retake.setEnabled(true);
        reselect.setEnabled(true);
        rotate.setEnabled(true);
      }

      @Override
      public void onError(String message) {
        deletePendingStockCameraFile();
        if (!dialog.isShowing()) {
          return;
        }
        status.setText(message);
        status.setTextColor(UiKit.DANGER);
        retake.setEnabled(true);
        reselect.setEnabled(true);
      }
    });
  }

  private JSONArray stockImageCandidatesJson() {
    JSONArray candidates = new JSONArray();
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      try {
        JSONObject candidate = new JSONObject();
        candidate.put("id", item.menuItemId);
        candidate.put("name", item.name);
        candidate.put("category", item.category);
        candidate.put("current_stock", item.stockQuantity);
        candidate.put("stock_unit", item.stockUnit);
        candidates.put(candidate);
      } catch (Exception ignored) {
        // Snapshot values are primitives; a malformed row is omitted safely.
      }
    }
    return candidates;
  }

  private void showStockImageReviewDialog(HostingSyncClient.StockImageAnalysisResult result, boolean duplicate) {
    List<StockImageReviewLine> lines = parseStockImageReviewLines(result.analysis);
    Dialog dialog = new Dialog(this);
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
    LinearLayout root = UiKit.column(this);
    root.setBackgroundColor(UiKit.BG);

    LinearLayout header = UiKit.row(this);
    header.setPadding(UiKit.dp(this, 16), UiKit.dp(this, 12), UiKit.dp(this, 12), UiKit.dp(this, 8));
    LinearLayout heading = UiKit.column(this);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(this, "EŞLEŞMELERİ KONTROL ET"));
    heading.addView(UiKit.title(this, "Stok taslağı"));
    header.addView(heading);
    header.addView(UiKit.iconButton(this, "×", "Stok taslağını kapat", false, view -> dialog.dismiss()),
        new LinearLayout.LayoutParams(UiKit.dp(this, 44), UiKit.dp(this, 44)));
    root.addView(header);

    LinearLayout content = UiKit.column(this);
    JSONObject document = result.analysis.optJSONObject("document");
    LinearLayout documentCard = UiKit.card(this);
    documentCard.addView(UiKit.text(this, "Belge bilgisi", 15, UiKit.TEXT, Typeface.BOLD));
    documentCard.addView(UiKit.text(this,
        "Tedarikçi: " + stockImageDocumentValue(document, "supplier_name")
            + "\nBelge no: " + stockImageDocumentValue(document, "invoice_number")
            + " · Tarih: " + stockImageDocumentValue(document, "invoice_date"),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    content.addView(documentCard);

    TextView analysisMessage = UiKit.text(this, result.message, 12, UiKit.INFO, Typeface.BOLD);
    LinearLayout.LayoutParams analysisMessageParams = new LinearLayout.LayoutParams(-1, -2);
    analysisMessageParams.setMargins(0, 0, 0, UiKit.dp(this, 9));
    analysisMessage.setLayoutParams(analysisMessageParams);
    content.addView(analysisMessage);

    CheckBox duplicateApproval = new CheckBox(this);
    duplicateApproval.setTextColor(UiKit.WARNING);
    duplicateApproval.setTextSize(12);
    duplicateApproval.setVisibility(duplicate ? View.VISIBLE : View.GONE);
    boolean canOverrideDuplicate = "admin".equals(data.deviceRole);
    if (duplicate) {
      duplicateApproval.setText(canOverrideDuplicate
          ? "Bu görsel daha önce kullanılmış olabilir. Yönetici olarak yine de uygulamak istiyorum."
          : "Bu görsel daha önce kullanılmış olabilir. Yeniden uygulamak için yönetici gerekir.");
      duplicateApproval.setEnabled(canOverrideDuplicate);
      LinearLayout.LayoutParams duplicateParams = new LinearLayout.LayoutParams(-1, -2);
      duplicateParams.setMargins(0, 0, 0, UiKit.dp(this, 10));
      duplicateApproval.setLayoutParams(duplicateParams);
      content.addView(duplicateApproval);
    }

    content.addView(UiKit.sectionTitle(this, "Okunan satırlar"));
    TextView summary = UiKit.text(this, "", 13, UiKit.TEXT, Typeface.BOLD);
    Button apply = UiKit.button(this, "Stokları Güncelle", UiKit.PRIMARY, view -> {});
    final Runnable[] refreshSummary = {null};
    if (lines.isEmpty()) {
      content.addView(emptyCard("Eşleşen satır bulunamadı", "Görseli yeniden deneyin veya mevcut manuel stok güncelleme düğmelerini kullanın."));
    }
    for (StockImageReviewLine line : lines) {
      content.addView(stockImageReviewCard(line, refreshSummary));
    }

    ScrollView scroll = UiKit.scroll(this, content, 18);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    root.addView(scroll);

    LinearLayout bottom = UiKit.column(this);
    bottom.setPadding(UiKit.dp(this, 16), UiKit.dp(this, 10), UiKit.dp(this, 16), UiKit.dp(this, 14));
    bottom.setBackground(UiKit.rounded(this, UiKit.SURFACE_ALT, UiKit.BORDER, 0));
    bottom.addView(summary);
    LinearLayout bottomActions = UiKit.row(this);
    LinearLayout.LayoutParams bottomActionsParams = new LinearLayout.LayoutParams(-1, -2);
    bottomActionsParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
    bottomActions.setLayoutParams(bottomActionsParams);
    UiKit.addAction(bottomActions, UiKit.outlineButton(this, "Vazgeç", view -> dialog.dismiss()), this);
    UiKit.addAction(bottomActions, apply, this);
    bottom.addView(bottomActions);
    root.addView(bottom);

    refreshSummary[0] = () -> {
      int valid = 0;
      int pieceTotal = 0;
      int gramTotal = 0;
      int review = 0;
      for (StockImageReviewLine line : lines) {
        if (line.ignored) {
          continue;
        }
        int quantity = line.quantity();
        if (!line.menuItemId.isEmpty() && quantity > 0) {
          valid += 1;
          OperationData.TrackedStockItem item = trackedStockItem(line.menuItemId);
          if (item != null && "gram".equals(item.stockUnit)) {
            gramTotal += quantity;
          } else {
            pieceTotal += quantity;
          }
        } else {
          review += 1;
        }
      }
      String totals = (pieceTotal > 0 ? pieceTotal + " adet" : "")
          + (pieceTotal > 0 && gramTotal > 0 ? " + " : "")
          + (gramTotal > 0 ? stockNumber(gramTotal) + " g" : "");
      summary.setText(valid + " satır · " + (totals.isEmpty() ? "0" : totals) + " · " + review + " kontrol gerekli");
      apply.setEnabled(valid > 0 && (!duplicate || (canOverrideDuplicate && duplicateApproval.isChecked())));
    };
    duplicateApproval.setOnCheckedChangeListener((button, checked) -> refreshSummary[0].run());
    apply.setOnClickListener(view -> {
      JSONArray approvedLines = new JSONArray();
      for (StockImageReviewLine line : lines) {
        int quantity = line.quantity();
        if (line.ignored || line.menuItemId.isEmpty() || quantity <= 0) {
          continue;
        }
        try {
          JSONObject approved = new JSONObject();
          approved.put("menu_item_id", line.menuItemId);
          approved.put("quantity", quantity);
          approved.put("raw_text", line.rawText);
          approved.put("confidence", line.confidence);
          approvedLines.put(approved);
        } catch (Exception ignored) {
          // Primitive review values are safe; an unencodable row is not applied.
        }
      }
      if (approvedLines.length() == 0) {
        Toast.makeText(this, "Miktarlar kontrol edilmeli.", Toast.LENGTH_SHORT).show();
        return;
      }
      JSONObject actionPayload = payload(
          "import_id", result.importId,
          "image_hash", result.imageHash,
          "duplicate_warning_acknowledged", duplicate && duplicateApproval.isChecked(),
          "lines", approvedLines
      );
      dialog.dismiss();
      sendAction(
          "menu_stock_image_import_apply",
          actionPayload,
          "Onaylanan stok girişi action queue üzerinden masaüstüne gönderildi."
      );
    });
    refreshSummary[0].run();

    dialog.setContentView(root);
    dialog.show();
    configureFullDialog(dialog);
  }

  private View stockImageReviewCard(StockImageReviewLine line, Runnable[] refreshSummary) {
    LinearLayout card = UiKit.card(this);
    TextView raw = UiKit.text(this, line.rawText, 14, UiKit.TEXT, Typeface.BOLD);
    card.addView(raw);
    if (!line.reason.isEmpty()) {
      TextView reason = UiKit.text(this, line.reason, 11, UiKit.WARNING, Typeface.NORMAL);
      LinearLayout.LayoutParams reasonParams = new LinearLayout.LayoutParams(-1, -2);
      reasonParams.setMargins(0, UiKit.dp(this, 3), 0, UiKit.dp(this, 7));
      reason.setLayoutParams(reasonParams);
      card.addView(reason);
    }

    TextView itemLabel = UiKit.text(this, "Menü karşılığı", 11, UiKit.MUTED, Typeface.BOLD);
    card.addView(itemLabel);
    ArrayList<String> labels = new ArrayList<>();
    labels.add("Eşleşme yok");
    int selectedIndex = 0;
    for (int index = 0; index < data.trackedStockItems.size(); index += 1) {
      OperationData.TrackedStockItem item = data.trackedStockItems.get(index);
      labels.add(item.name + " · " + item.category + " · " + stockUnitLabel(item.stockUnit));
      if (item.menuItemId.equals(line.menuItemId)) {
        selectedIndex = index + 1;
      }
    }
    Spinner itemSelect = new Spinner(this);
    ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, labels);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    itemSelect.setAdapter(adapter);
    itemSelect.setSelection(selectedIndex);
    itemSelect.setBackground(UiKit.rounded(this, UiKit.SURFACE, UiKit.BORDER, 10));
    itemSelect.setPadding(UiKit.dp(this, 8), 0, UiKit.dp(this, 8), 0);
    itemSelect.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 48)));
    itemSelect.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
      @Override
      public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
        line.menuItemId = position <= 0 ? "" : data.trackedStockItems.get(position - 1).menuItemId;
        if (refreshSummary[0] != null) {
          refreshSummary[0].run();
        }
      }

      @Override
      public void onNothingSelected(android.widget.AdapterView<?> parent) {
        line.menuItemId = "";
        if (refreshSummary[0] != null) {
          refreshSummary[0].run();
        }
      }
    });
    card.addView(itemSelect);

    LinearLayout quantityRow = UiKit.row(this);
    LinearLayout.LayoutParams quantityRowParams = new LinearLayout.LayoutParams(-1, -2);
    quantityRowParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
    quantityRow.setLayoutParams(quantityRowParams);
    EditText quantity = UiKit.input(this, "Eklenecek miktar");
    quantity.setInputType(InputType.TYPE_CLASS_NUMBER);
    quantity.setText(line.quantityText);
    quantity.setLayoutParams(new LinearLayout.LayoutParams(0, UiKit.dp(this, 48), 1f));
    quantity.addTextChangedListener(new TextWatcher() {
      @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence value, int start, int before, int count) {
        line.quantityText = value == null ? "" : value.toString();
        if (refreshSummary[0] != null) {
          refreshSummary[0].run();
        }
      }
      @Override public void afterTextChanged(Editable value) {}
    });
    quantityRow.addView(quantity);
    TextView confidence = statusBadge(stockImageConfidenceLabel(line.confidence), stockImageConfidenceTone(line.confidence));
    LinearLayout.LayoutParams confidenceParams = new LinearLayout.LayoutParams(-2, -2);
    confidenceParams.setMargins(UiKit.dp(this, 8), 0, 0, 0);
    confidence.setLayoutParams(confidenceParams);
    quantityRow.addView(confidence);
    card.addView(quantityRow);

    Button remove = UiKit.outlineButton(this, "Kaldır", view -> {
      line.ignored = !line.ignored;
      itemSelect.setEnabled(!line.ignored);
      quantity.setEnabled(!line.ignored);
      raw.setAlpha(line.ignored ? 0.5f : 1f);
      ((Button) view).setText(line.ignored ? "Geri al" : "Kaldır");
      if (refreshSummary[0] != null) {
        refreshSummary[0].run();
      }
    });
    LinearLayout.LayoutParams removeParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 42));
    removeParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
    remove.setLayoutParams(removeParams);
    card.addView(remove);
    return card;
  }

  private List<StockImageReviewLine> parseStockImageReviewLines(JSONObject analysis) {
    ArrayList<StockImageReviewLine> lines = new ArrayList<>();
    JSONArray sourceLines = analysis.optJSONArray("lines");
    if (sourceLines == null) {
      return lines;
    }
    for (int index = 0; index < sourceLines.length() && lines.size() < 200; index += 1) {
      JSONObject source = sourceLines.optJSONObject(index);
      if (source == null) {
        continue;
      }
      String rawText = source.optString("raw_text", "").trim();
      if (rawText.isEmpty()) {
        continue;
      }
      String menuItemId = source.optString("matched_menu_item_id", "").trim();
      if (!isTrackedStockItem(menuItemId)) {
        menuItemId = "";
      }
      String quantity = "";
      Object suggested = source.opt("suggested_quantity");
      if (suggested instanceof Number) {
        double value = ((Number) suggested).doubleValue();
        if (value == Math.rint(value) && value > 0 && value <= 100000) {
          quantity = String.valueOf((int) value);
        }
      }
      String confidence = source.optString("confidence", "low");
      if (!"high".equals(confidence) && !"medium".equals(confidence)) {
        confidence = "low";
      }
      lines.add(new StockImageReviewLine(
          rawText,
          menuItemId,
          quantity,
          confidence,
          source.optString("needs_review_reason", "").trim()
      ));
    }
    return lines;
  }

  private boolean isTrackedStockItem(String menuItemId) {
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      if (item.menuItemId.equals(menuItemId)) {
        return true;
      }
    }
    return false;
  }

  private String stockImageDocumentValue(JSONObject document, String field) {
    if (document == null) {
      return "Okunamadı";
    }
    String value = document.optString(field, "").trim();
    return value.isEmpty() ? "Okunamadı" : value;
  }

  private String stockImageConfidenceLabel(String confidence) {
    if ("high".equals(confidence)) return "Yüksek";
    if ("medium".equals(confidence)) return "Orta";
    return "Düşük";
  }

  private int stockImageConfidenceTone(String confidence) {
    if ("high".equals(confidence)) return UiKit.SUCCESS;
    if ("medium".equals(confidence)) return UiKit.WARNING;
    return UiKit.DANGER;
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
    if (TAB_CUSTOMERS.equals(destination.tab)) {
      customerFilter = destination.mode;
    } else if (TAB_PENSION.equals(destination.tab)) {
      String visibleMode = AndroidUiRules.visiblePensionMode(data, destination.mode);
      if (visibleMode != null) {
        pensionMode = visibleMode;
      }
    } else if (TAB_RESTAURANT.equals(destination.tab)) {
      String visibleMode = AndroidUiRules.visibleRestaurantMode(data, destination.mode);
      if (visibleMode != null) {
        restaurantMode = visibleMode;
      }
    } else if (TAB_MESSAGES.equals(destination.tab)) {
      messageMode = destination.mode;
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

  private void buildShell() {
    landscapeLayout = getResources().getConfiguration().orientation
        == Configuration.ORIENTATION_LANDSCAPE;
    root = UiKit.column(this);
    root.setBackgroundColor(UiKit.BG);

    LinearLayout header = UiKit.row(this);
    int headerVerticalPadding = landscapeLayout ? 4 : 8;
    header.setPadding(
        UiKit.dp(this, 14),
        UiKit.dp(this, headerVerticalPadding),
        UiKit.dp(this, 10),
        UiKit.dp(this, headerVerticalPadding)
    );
    header.setBackgroundColor(UiKit.BG);
    header.setLayoutParams(new LinearLayout.LayoutParams(
        -1,
        UiKit.dp(this, landscapeLayout ? LANDSCAPE_HEADER_HEIGHT_DP : PORTRAIT_HEADER_HEIGHT_DP)
    ));

    LinearLayout titleGroup = UiKit.column(this);
    titleGroup.setGravity(Gravity.CENTER_VERTICAL);
    headerTitle = UiKit.text(this, "Bugün", 20, UiKit.TEXT, Typeface.BOLD);
    titleGroup.addView(headerTitle);
    headerMeta = UiKit.text(this, "Personel · Henüz sync yok", 11, UiKit.MUTED, Typeface.NORMAL);
    titleGroup.addView(headerMeta);
    titleGroup.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    header.addView(titleGroup);

    LinearLayout headerActions = UiKit.row(this);
    refreshButton = UiKit.iconButton(this, "↻", "Yenile", false, view -> syncOperations(false));
    headerActions.addView(refreshButton, headerActionParams(false));

    themeButton = createThemeButton(null);
    headerActions.addView(themeButton, headerActionParams(true));

    settingsButton = UiKit.iconButton(this, "⚙", "Ayarlar", false, view -> {
      settingsOpen = !settingsOpen;
      render();
    });
    headerActions.addView(settingsButton, headerActionParams(true));
    header.addView(headerActions);
    root.addView(header);

    errorBanner = UiKit.text(this, "", 12, UiKit.TEXT, Typeface.BOLD);
    errorBanner.setPadding(UiKit.dp(this, 14), UiKit.dp(this, 9), UiKit.dp(this, 14), UiKit.dp(this, 9));
    errorBanner.setVisibility(View.GONE);
    LinearLayout.LayoutParams bannerParams = new LinearLayout.LayoutParams(-1, -2);
    bannerParams.setMargins(UiKit.dp(this, 14), 0, UiKit.dp(this, 14), UiKit.dp(this, 8));
    errorBanner.setLayoutParams(bannerParams);
    root.addView(errorBanner);

    content = new FrameLayout(this);
    bottomNavigation = landscapeLayout ? UiKit.column(this) : UiKit.row(this);
    bottomNavigation.setBackground(UiKit.rounded(this, UiKit.BOTTOM_NAV_BACKGROUND, UiKit.BORDER, 0));
    if (landscapeLayout) {
      LinearLayout body = UiKit.row(this);
      body.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
      bottomNavigation.setPadding(
          UiKit.dp(this, 6),
          UiKit.dp(this, 5),
          UiKit.dp(this, 6),
          UiKit.dp(this, 5)
      );
      bottomNavigation.setLayoutParams(new LinearLayout.LayoutParams(
          UiKit.dp(this, LANDSCAPE_SIDE_NAV_WIDTH_DP),
          -1
      ));
      content.setLayoutParams(new LinearLayout.LayoutParams(0, -1, 1f));
      body.addView(bottomNavigation);
      body.addView(content);
      root.addView(body);
    } else {
      content.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
      root.addView(content);
      bottomNavigation.setPadding(
          UiKit.dp(this, 5),
          UiKit.dp(this, 6),
          UiKit.dp(this, 5),
          UiKit.dp(this, 7)
      );
      bottomNavigation.setLayoutParams(new LinearLayout.LayoutParams(
          -1,
          UiKit.dp(this, BOTTOM_NAV_HEIGHT_DP)
      ));
      root.addView(bottomNavigation);
    }
    setContentView(root);
    updateErrorBanner();
  }


  private ImageButton createThemeButton(Runnable afterApplied) {
    int icon = themeMode == AppTheme.Mode.NIGHT ? R.drawable.ic_theme_day : R.drawable.ic_theme_night;
    return UiKit.themeIconButton(this, icon, themeMode.switchDescription, view -> {
      switchTheme();
      if (afterApplied != null) {
        afterApplied.run();
      }
    });
  }

  private void addDetailHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen) {
    ImageButton quickTheme = createThemeButton(() -> {
      dialog.dismiss();
      reopen.run();
    });
    header.addView(quickTheme, headerActionParams(true));
    Button close = UiKit.outlineButton(this, "Kapat", view -> dialog.dismiss());
    LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(-2, UiKit.dp(this, 44));
    closeParams.setMargins(UiKit.dp(this, 6), 0, 0, 0);
    close.setLayoutParams(closeParams);
    header.addView(close);
  }

  private void switchTheme() {
    rememberCurrentScrollPosition();
    AppTheme.Mode nextMode = themeMode.toggled();
    boolean persisted = AppTheme.save(preferences, nextMode);
    themeMode = nextMode;
    setTheme(themeStyleResource(themeMode));
    UiKit.applyTheme(AppTheme.tokens(themeMode));
    applyWindowTheme();
    buildShell();
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

  private LinearLayout.LayoutParams headerActionParams(boolean withMargin) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        UiKit.dp(this, HEADER_ACTION_SIZE_DP),
        UiKit.dp(this, HEADER_ACTION_SIZE_DP)
    );
    if (withMargin) {
      params.setMargins(UiKit.dp(this, 6), 0, 0, 0);
    }
    return params;
  }

  private void render() {
    rememberCurrentScrollPosition();
    boolean canOpenSettings = !data.permissionsResolved || data.deviceActive;
    if (settingsOpen && !canOpenSettings) {
      settingsOpen = false;
    }
    if (!canOpenTab(activeTab)) {
      activeTab = TAB_TODAY;
    }
    String visiblePensionMode = AndroidUiRules.visiblePensionMode(data, pensionMode);
    if (visiblePensionMode != null) {
      pensionMode = visiblePensionMode;
    }
    String visibleRestaurantMode = AndroidUiRules.visibleRestaurantMode(data, restaurantMode);
    if (visibleRestaurantMode != null) {
      restaurantMode = visibleRestaurantMode;
    }
    boolean inactiveDevice = data.permissionsResolved && !data.deviceActive;
    if (inactiveDevice) {
      settingsOpen = false;
    }
    String screenKey = currentScreenKey(inactiveDevice);
    refreshButton.setVisibility(inactiveDevice ? View.GONE : View.VISIBLE);
    refreshButton.setEnabled(!loading && hasConnectionSettings());
    refreshButton.setContentDescription(loading ? "Yenileniyor" : "Yenile");
    settingsButton.setVisibility(canOpenSettings ? View.VISIBLE : View.GONE);
    styleHeaderAction(settingsButton, settingsOpen);
    bottomNavigation.setVisibility(
        settingsOpen || inactiveDevice || TAB_REPORTS.equals(activeTab) || TAB_CASH.equals(activeTab) ? View.GONE : View.VISIBLE
    );
    renderBottomNavigation();
    content.removeAllViews();
    View screen;
    if (inactiveDevice) {
      headerTitle.setText(data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ANDROID) ? "Cihaz Pasif" : "Android Kapalı");
      screen = inactiveDeviceScreen();
    } else if (settingsOpen) {
      headerTitle.setText("Ayarlar");
      screen = settingsScreen();
    } else if (TAB_CUSTOMERS.equals(activeTab)) {
      headerTitle.setText("Müşteri");
      screen = customerScreen();
    } else if (TAB_PENSION.equals(activeTab)) {
      headerTitle.setText("Pansiyon");
      screen = pensionScreen();
    } else if (TAB_RESTAURANT.equals(activeTab)) {
      headerTitle.setText("Restoran");
      screen = restaurantScreen();
    } else if (TAB_MARKET.equals(activeTab)) {
      headerTitle.setText("Market");
      screen = marketWorkspace.create(data, localPendingActionCount(), loading);
    } else if (TAB_MESSAGES.equals(activeTab)) {
      headerTitle.setText("Mesajlar");
      screen = messagesScreen();
    } else if (TAB_CASH.equals(activeTab)) {
      headerTitle.setText("Kasa");
      screen = FinanceWorkspace.create(this, data, actionPayload ->
          sendAction("finance_manual_create", actionPayload, "Kasa hareketi gönderildi."));
    } else if (TAB_REPORTS.equals(activeTab)) {
      headerTitle.setText("Raporlar");
      screen = reportsScreen();
    } else {
      headerTitle.setText("Bugün");
      screen = todayScreen();
    }
    headerMeta.setText(headerMetaText());
    content.addView(screen);
    renderedScreenKey = screenKey;
    restoreScrollPosition(screen, screenKey);
  }

  private void styleHeaderAction(Button button, boolean selected) {
    button.setTextColor(selected ? UiKit.PRIMARY : UiKit.TEXT);
    button.setBackground(UiKit.rounded(
        this,
        selected ? UiKit.PRIMARY_DARK : UiKit.SURFACE_ALT,
        selected ? UiKit.PRIMARY : UiKit.BORDER,
        11
    ));
  }

  private void rememberCurrentScrollPosition() {
    if (renderedScreenKey.isEmpty() || content == null || content.getChildCount() == 0) {
      return;
    }
    View currentScreen = content.getChildAt(0);
    if (currentScreen instanceof ScrollView) {
      screenScrollPositions.put(renderedScreenKey, ((ScrollView) currentScreen).getScrollY());
    }
  }

  private String currentScreenKey(boolean inactiveDevice) {
    if (inactiveDevice) {
      return "inactive";
    }
    if (settingsOpen) {
      return "settings";
    }
    if (TAB_CUSTOMERS.equals(activeTab)) {
      return TAB_CUSTOMERS + ":" + customerFilter;
    }
    if (TAB_PENSION.equals(activeTab)) {
      return TAB_PENSION + ":" + pensionMode;
    }
    if (TAB_RESTAURANT.equals(activeTab)) {
      return TAB_RESTAURANT + ":" + restaurantMode;
    }
    if (TAB_MARKET.equals(activeTab)) {
      return TAB_MARKET + ":" + (marketWorkspace == null ? "home" : marketWorkspace.screenKey());
    }
    if (TAB_MESSAGES.equals(activeTab)) {
      return TAB_MESSAGES + ":" + messageMode;
    }
    if (TAB_CASH.equals(activeTab)) {
      return TAB_CASH;
    }
    if (TAB_REPORTS.equals(activeTab)) {
      return TAB_REPORTS + ":" + reportPreset;
    }
    return activeTab;
  }

  private void restoreScrollPosition(View screen, String screenKey) {
    if (!(screen instanceof ScrollView)) {
      return;
    }
    ScrollView scrollView = (ScrollView) screen;
    int scrollY = Math.max(0, screenScrollPositions.getOrDefault(screenKey, 0));
    scrollView.post(() -> {
      if (screenKey.equals(renderedScreenKey)
          && content.getChildCount() > 0
          && content.getChildAt(0) == scrollView) {
        scrollView.scrollTo(0, scrollY);
      }
    });
  }

  private void renderBottomNavigation() {
    bottomNavigation.removeAllViews();
    addNavButton("Bugün", TAB_TODAY);
    if (canOpenTab(TAB_CUSTOMERS)) {
      addNavButton("Müşteri", TAB_CUSTOMERS);
    }
    if (canOpenTab(TAB_PENSION)) {
      addNavButton("Pansiyon", TAB_PENSION);
    }
    if (canOpenTab(TAB_RESTAURANT)) {
      addNavButton("Restoran", TAB_RESTAURANT);
    }
    if (canOpenTab(TAB_MARKET)) {
      addNavButton("Market", TAB_MARKET);
    }
    if (canOpenTab(TAB_MESSAGES)) {
      addNavButton("Mesajlar", TAB_MESSAGES);
    }
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

  private void addNavButton(String label, String tab) {
    boolean selected = tab.equals(activeTab) && !settingsOpen;
    Button button = new Button(this);
    button.setText(label);
    button.setTextSize(11);
    button.setTextColor(selected ? UiKit.BOTTOM_NAV_ACTIVE : UiKit.BOTTOM_NAV_INACTIVE);
    button.setTypeface(Typeface.create("sans", selected ? Typeface.BOLD : Typeface.NORMAL));
    button.setAllCaps(false);
    button.setGravity(Gravity.CENTER);
    button.setPadding(1, 0, 1, 0);
    button.setMinWidth(0);
    button.setMinimumWidth(0);
    button.setMinHeight(0);
    button.setMinimumHeight(0);
    button.setBackground(UiKit.rounded(this, selected ? UiKit.SURFACE_ALT : Color.TRANSPARENT, Color.TRANSPARENT, 11));
    button.setOnClickListener(view -> {
      activeTab = tab;
      settingsOpen = false;
      render();
    });
    button.setLayoutParams(landscapeLayout
        ? new LinearLayout.LayoutParams(-1, 0, 1f)
        : new LinearLayout.LayoutParams(0, -1, 1f));
    bottomNavigation.addView(button);
  }

  private View todayScreen() {
    LinearLayout page = UiKit.column(this);
    boolean canViewCustomers = data.hasPermission("customer.view");
    boolean canViewRequests = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_REQUESTS)
        && data.hasPermission("customer.view");
    boolean canViewReservations = data.hasPermission("reservation.view");
    boolean canViewRooms = data.hasPermission("room.view");
    boolean canViewPensionTasks = AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_TASKS);
    boolean canViewRestaurantTasks = AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_TASKS);
    boolean canViewTasks = data.hasPermission("daily_task.view");
    boolean canViewTables = data.hasPermission("table.view");
    boolean canViewOrders = data.hasPermission("table_order.view");
    boolean canViewStock = data.hasPermission("menu.stock_view");

    ArrayList<CounterValue> counters = new ArrayList<>();
    if (canViewRequests) {
      counters.add(new CounterValue("Yeni", data.newRequests, UiKit.INFO, "customers:new"));
      counters.add(new CounterValue("Cevap", data.waitingResponses > 0 ? data.waitingResponses : countWaitingRequests(), UiKit.DANGER, "customers:waiting"));
    }
    if (canViewReservations) {
      int pensionPending = countPensionReservations("pending");
      int restaurantPending = countRestaurantOnlyReservations("pending");
      if (pensionPending > 0) {
        counters.add(new CounterValue("Oda Rez.", pensionPending, UiKit.WARNING, "pension:reservations"));
      }
      if (restaurantPending > 0) {
        counters.add(new CounterValue("Masa Rez.", restaurantPending, UiKit.WARNING, "restaurant:reservations"));
      }
    }
    int visibleTaskCount = 0;
    boolean hasPensionTasks = false;
    boolean hasRestaurantTasks = false;
    boolean hasOtherTasks = false;
    if (canViewTasks) {
      for (OperationData.TaskRecord task : data.tasks) {
        if (!"pending".equals(task.status) || !AndroidUiRules.taskAllowed(data, task)) {
          continue;
        }
        String domain = AndroidUiRules.taskDomain(data, task);
        if ("accommodation".equals(domain) && canViewPensionTasks) {
          hasPensionTasks = true;
        } else if ("food_service".equals(domain) && canViewRestaurantTasks) {
          hasRestaurantTasks = true;
        } else if ("mixed".equals(domain) && canViewPensionTasks && canViewRestaurantTasks) {
          hasPensionTasks = true;
          hasRestaurantTasks = true;
        } else if ("core".equals(domain)) {
          hasOtherTasks = true;
        } else {
          continue;
        }
        visibleTaskCount += 1;
      }
    }
    if (visibleTaskCount > 0) {
      String taskLabel = hasPensionTasks && !hasRestaurantTasks && !hasOtherTasks
          ? "Oda işi"
          : (hasRestaurantTasks && !hasPensionTasks && !hasOtherTasks ? "Servis işi" : "İş");
      String taskRoute = hasPensionTasks && !hasRestaurantTasks && !hasOtherTasks
          ? "pension:tasks"
          : (hasRestaurantTasks && !hasPensionTasks && !hasOtherTasks ? "restaurant:tasks" : "today");
      counters.add(new CounterValue(taskLabel, visibleTaskCount, UiKit.ACCENT, taskRoute));
    }
    if (canViewRooms) {
      counters.add(new CounterValue("Oda", data.availableRooms, UiKit.SUCCESS, "pension:rooms"));
    }
    if (canViewOrders) {
      counters.add(new CounterValue("Hesap", data.billWaitingTables, UiKit.WARNING, "restaurant:orders"));
    }
    int outOfStock = countStockByStatus("out_of_stock");
    int lowStock = countStockByStatus("low_stock");
    if (canViewStock && outOfStock > 0) {
      counters.add(new CounterValue("Stok yok", outOfStock, UiKit.DANGER, "restaurant:stock"));
    }
    if (canViewStock && lowStock > 0) {
      counters.add(new CounterValue("Az stok", lowStock, UiKit.WARNING, "restaurant:stock"));
    }
    if (!counters.isEmpty()) {
      page.addView(statusStrip(counters.toArray(new CounterValue[0])));
    }

    page.addView(sectionLabel("Öncelikli işler"));
    int shown = 0;
    int categoryShown = 0;
    if (canViewRequests) {
      for (OperationData.RequestRecord request : data.requests) {
        if (!"new".equals(request.status) || categoryShown >= 2 || shown >= 8) {
          continue;
        }
        page.addView(todayRequestCard(request));
        categoryShown += 1;
        shown += 1;
      }
    }
    categoryShown = 0;
    if (canViewReservations) {
      for (OperationData.ReservationRecord reservation : data.reservations) {
        if (!AndroidUiRules.reservationAllowed(data, reservation)
            || !"pending".equals(reservation.status)
            || categoryShown >= 2
            || shown >= 8) {
          continue;
        }
        page.addView(priorityReservationCard(reservation));
        categoryShown += 1;
        shown += 1;
      }
    }
    categoryShown = 0;
    if (canViewOrders) {
      for (OperationData.TableOrder order : data.tableOrders) {
        if (!"payment".equals(order.status) || categoryShown >= 2 || shown >= 8) {
          continue;
        }
        page.addView(activeOrderCard(order));
        categoryShown += 1;
        shown += 1;
      }
    }
    if (canViewTables && categoryShown < 2 && shown < 8) {
      for (OperationData.TableRecord table : data.tables) {
        if (!("bill_waiting".equals(table.status) || "payment".equals(table.status))
            || hasPaymentOrderForTable(table.id) || categoryShown >= 2 || shown >= 8) {
          continue;
        }
        page.addView(tableCard(table));
        categoryShown += 1;
        shown += 1;
      }
    }
    categoryShown = 0;
    if (canViewTasks) {
      for (OperationData.TaskRecord task : data.tasks) {
        if (!AndroidUiRules.taskAllowed(data, task)
            || !isPriorityTask(task)
            || categoryShown >= 2
            || shown >= 8) {
          continue;
        }
        page.addView(taskCard(task, true));
        categoryShown += 1;
        shown += 1;
      }
    }
    categoryShown = 0;
    if (canViewStock) {
      for (OperationData.TrackedStockItem item : data.trackedStockItems) {
        if ((!("out_of_stock".equals(item.stockStatus) || "low_stock".equals(item.stockStatus)))
            || categoryShown >= 2 || shown >= 8) {
          continue;
        }
        page.addView(priorityStockCard(item));
        categoryShown += 1;
        shown += 1;
      }
    }

    if (shown == 0) {
      boolean hasOperationalPermission = canViewCustomers || canViewReservations || canViewRooms
          || canViewTasks || canViewTables || canViewOrders || canViewStock;
      page.addView(hasOperationalPermission
          ? emptyCard("Öncelikli iş yok", "Açık operasyonlar geldikçe bu liste güncellenir.")
          : permissionDeniedCard());
    }

    int visiblePendingActions = data.pendingActions + localPendingActionCount();
    OperationData.ActionRecord latestFailedAction = latestFailedAction();
    if (visiblePendingActions > 0 || latestFailedAction != null) {
      page.addView(sectionLabel("Telefon işlemleri"));
    }
    if (visiblePendingActions > 0) {
      LinearLayout pending = UiKit.card(this);
      pending.addView(UiKit.text(this, visiblePendingActions + " işlem masaüstünü bekliyor", 14, UiKit.WARNING, Typeface.BOLD));
      pending.addView(UiKit.text(this, "Sonuçlar bir sonraki senkronla güncellenir.", 12, UiKit.MUTED, Typeface.NORMAL));
      page.addView(pending);
    }
    if (latestFailedAction != null) {
      page.addView(actionCard(latestFailedAction));
    }
    return mainScreenScroll(page);
  }

  private View customerScreen() {
    CustomerWorkspace workspace = new CustomerWorkspace(
        this,
        data,
        new CustomerWorkspace.Listener() {
          @Override
          public void onFilterNormalized(String filter) {
            customerFilter = filter;
          }

          @Override
          public void onFilterChanged(String filter) {
            customerFilter = filter;
            render();
          }

          @Override
          public void onCreateCustomer() {
            showCustomerForm(null);
          }

          @Override
          public void onOpenCustomer(OperationData.CustomerRecord customer) {
            showCustomerDetail(customer);
          }

          @Override
          public View createRequestCard(OperationData.RequestRecord request) {
            return requestCard(request);
          }

          @Override
          public void onDial(String phone) {
            openDialer(phone);
          }

          @Override
          public void onWhatsApp(String phone) {
            openWhatsApp(phone, "");
          }
        },
        landscapeLayout ? LANDSCAPE_CONTENT_BOTTOM_PADDING_DP : MAIN_CONTENT_BOTTOM_PADDING_DP
    );
    return workspace.render(customerFilter);
  }

  private View pensionScreen() {
    PensionWorkspace workspace = new PensionWorkspace(
        this,
        data,
        new PensionWorkspace.Listener() {
          @Override
          public void onModeChanged(String mode) {
            pensionMode = mode;
            render();
          }

          @Override
          public void onCreateRoomReservation() {
            showReservationEditor(ReservationEditorDialog.Kind.ROOM, null);
          }

          @Override
          public void onAssignCustomerToRoom() {
            showRoomAssignmentDialog(null, null);
          }

          @Override
          public void onCreateTask() {
            showDailyTaskEditor(DailyTaskEditorDialog.Kind.PENSION, null);
          }

          @Override
          public View createReservationCard(OperationData.ReservationRecord reservation) {
            return reservationCard(reservation, false);
          }

          @Override
          public View createRoomCard(OperationData.RoomRecord room) {
            return roomCard(room);
          }

          @Override
          public View createStayCard(OperationData.CustomerRoomStayRecord stay) {
            return customerRoomStayCard(stay);
          }

          @Override
          public View createTaskCard(OperationData.TaskRecord task) {
            return taskCard(task, false);
          }

          @Override
          public void onFolioAction(String actionType, JSONObject actionPayload, String successMessage) {
            sendAction(actionType, actionPayload, successMessage);
          }
        },
        landscapeLayout ? LANDSCAPE_CONTENT_BOTTOM_PADDING_DP : MAIN_CONTENT_BOTTOM_PADDING_DP
    );
    return workspace.render(pensionMode);
  }

  private View restaurantScreen() {
    RestaurantWorkspace workspace = new RestaurantWorkspace(
        this,
        data,
        new RestaurantWorkspace.Listener() {
          @Override
          public void onModeChanged(String mode) {
            restaurantMode = mode;
            render();
          }

          @Override
          public void onRoute(String route) {
            openRoute(route);
            render();
          }

          @Override
          public void onCreateTableReservation() {
            showReservationEditor(ReservationEditorDialog.Kind.TABLE, null);
          }

          @Override
          public void onCreateTask() {
            showDailyTaskEditor(DailyTaskEditorDialog.Kind.RESTAURANT, null);
          }

          @Override
          public View createTableCard(OperationData.TableRecord table) {
            return tableCard(table);
          }

          @Override
          public View createReservationCard(OperationData.ReservationRecord reservation) {
            return reservationCard(reservation, false);
          }

          @Override
          public View createOrderCard(OperationData.TableOrder order) {
            return activeOrderCard(order);
          }

          @Override
          public View createTaskCard(OperationData.TaskRecord task) {
            return taskCard(task, false);
          }

          @Override
          public View createStockImageImportCard() {
            return stockImageImportCard();
          }

          @Override
          public View createStockCard(OperationData.TrackedStockItem item) {
            return stockCard(item);
          }

          @Override
          public View createAdminCategoryCard(OperationData.MenuCategory category) {
            return adminMenuCategoryCard(category);
          }

          @Override
          public View createAdminMenuItemCard(OperationData.MenuItem item) {
            return adminMenuItemCard(item);
          }
        },
        landscapeLayout ? LANDSCAPE_CONTENT_BOTTOM_PADDING_DP : MAIN_CONTENT_BOTTOM_PADDING_DP
    );
    return workspace.render(restaurantMode);
  }

  private View messagesScreen() {
    LinearLayout page = UiKit.column(this);
    if (!AndroidUiRules.canUseWhatsApp(data) || !data.hasPermission("customer.view")) {
      page.addView(permissionDeniedCard());
      return mainScreenScroll(page);
    }
    boolean requestsEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_REQUESTS);
    ArrayList<String[]> messageOptions = new ArrayList<>();
    messageOptions.add(new String[] {AndroidUiRules.MESSAGES_PREPARED, "Hazır Mesajlar"});
    if (requestsEnabled) {
      messageOptions.add(new String[] {AndroidUiRules.MESSAGES_WAITING, "Cevap Bekleyenler"});
    } else if (AndroidUiRules.MESSAGES_WAITING.equals(messageMode)) {
      messageMode = AndroidUiRules.MESSAGES_PREPARED;
    }
    page.addView(filterBar(messageOptions.toArray(new String[0][]), messageMode, value -> {
      messageMode = value;
      render();
    }));
    if (AndroidUiRules.MESSAGES_PREPARED.equals(messageMode)) {
      if (data.messages.isEmpty()) {
        page.addView(emptyCard("Hazır mesaj yok", "Masaüstünde hazırlanan cevaplar burada görünür."));
      }
      for (OperationData.MessageRecord message : data.messages) {
        page.addView(messageCard(message));
      }
    } else {
      int shown = 0;
      for (OperationData.RequestRecord request : data.requests) {
        if (!request.waitingForResponse()) {
          continue;
        }
        page.addView(waitingMessageCard(request));
        shown += 1;
      }
      if (shown == 0) {
        page.addView(emptyCard("Cevap bekleyen müşteri yok", "Yanıt gerektiren talepler burada görünür."));
      }
    }
    return mainScreenScroll(page);
  }

  private View reportsScreen() {
    LinearLayout page = UiKit.column(this);
    if (!data.isAdmin()) {
      page.addView(emptyCard(
          "Bu cihazın raporlara erişim yetkisi yok",
          "Raporlar yalnız masaüstünde aktif yönetici olarak atanmış telefonlarda açılır."
      ));
      return UiKit.scroll(this, page);
    }

    page.addView(screenIntro(
        "YÖNETİCİ RAPORU",
        "İşletmenin kısa görünümü",
        AndroidUiRules.canUseAi(data)
            ? "Tutarlar ve adetler masaüstündeki SQLite verisinden hazırlanır. AI yalnız bu hazır özeti açıklar."
            : "Tutarlar ve adetler masaüstündeki SQLite verisinden hazırlanır.",
        true
    ));
    page.addView(filterBar(new String[][] {
        {AndroidUiRules.REPORT_TODAY, "Bugün"},
        {AndroidUiRules.REPORT_YESTERDAY, "Dün"},
        {AndroidUiRules.REPORT_LAST_7, "Son 7 Gün"},
        {AndroidUiRules.REPORT_LAST_30, "Son 30 Gün"}
    }, reportPreset, value -> {
      reportPreset = AndroidUiRules.normalizeReportPreset(value);
      reportAiRequestVersion += 1;
      reportAiLoading = false;
      reportAiAnswer = "";
      reportAiMessage = "";
      render();
    }));

    OperationData.ReportSnapshot report = data.report(reportPreset);
    if (report == null) {
      page.addView(emptyCard(
          "Rapor verisi henüz hazır değil",
          "Masaüstünde otomatik senkronu çalıştırın, ardından bu ekrandaki Yenile düğmesine dokunun."
      ));
      return UiKit.scroll(this, page);
    }
    boolean ordersEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS);
    boolean customersEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_CUSTOMERS);
    boolean requestsEnabled = customersEnabled && data.hasBusinessCapability(AndroidUiRules.CAPABILITY_REQUESTS);
    boolean reservationsEnabled = data.hasAnyReservationCapability();
    boolean tasksEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_TASKS);
    boolean stockEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_MENU)
        && data.hasBusinessCapability(AndroidUiRules.CAPABILITY_INVENTORY);

    LinearLayout period = UiKit.card(this);
    period.addView(settingLine("Dönem", report.label.isEmpty() ? reportPresetLabel(reportPreset) : report.label, UiKit.PRIMARY));
    period.addView(UiKit.divider(this));
    period.addView(settingLine("Tarih", formatReportPeriod(report.startDate, report.endDate), UiKit.TEXT));
    page.addView(period);

    page.addView(sectionLabel("Genel özet"));
    LinearLayout summary = UiKit.card(this);
    if (ordersEnabled) {
      addReportMetric(summary, "Restoran cirosu", money(report.restaurantRevenue, "TRY"), UiKit.SUCCESS);
      addReportMetric(summary, "Kapanan hesap", String.valueOf(report.closedOrders), UiKit.INFO);
      addReportMetric(summary, "Ortalama hesap", money(report.averageOrder, "TRY"), UiKit.ACCENT);
    }
    if (reservationsEnabled) {
      addReportMetric(summary, "Onaylanan rezervasyon", String.valueOf(report.approvedReservations), UiKit.PRIMARY);
    }
    if (requestsEnabled) {
      addReportMetric(summary, "Yeni talep", String.valueOf(report.newRequests), UiKit.WARNING);
    }
    addReportMetric(summary, "Dikkat gerektiren", String.valueOf(report.attentionCount), report.attentionCount > 0 ? UiKit.DANGER : UiKit.SUCCESS);
    page.addView(summary);

    if (ordersEnabled) {
      page.addView(sectionLabel("Restoran"));
      LinearLayout restaurant = UiKit.card(this);
      addReportMetric(restaurant, "Satılan ürün", String.valueOf(report.soldItemCount), UiKit.INFO);
      addReportMetric(restaurant, "İptal edilen hesap", String.valueOf(report.cancelledOrders), report.cancelledOrders > 0 ? UiKit.WARNING : UiKit.SUCCESS);
      page.addView(restaurant);

      page.addView(sectionLabel("En çok satılan 3 ürün"));
      if (report.topItems.isEmpty()) {
        page.addView(emptyCard("Satış satırı yok", "Seçili dönemde kapanmış hesaplara bağlı ürün satışı bulunmuyor."));
      } else {
        int rank = 1;
        for (OperationData.ReportTopItem item : report.topItems) {
          page.addView(reportTopItemCard(item, rank));
          rank += 1;
        }
      }
    }

    page.addView(sectionLabel("Şu an dikkat gerektirenler"));
    LinearLayout attentionSummary = UiKit.card(this);
    if (requestsEnabled) {
      addReportMetric(attentionSummary, "Bekleyen müşteri talebi", String.valueOf(report.pendingRequests), UiKit.WARNING);
    }
    if (reservationsEnabled) {
      addReportMetric(attentionSummary, "Bekleyen rezervasyon", String.valueOf(report.pendingReservations), UiKit.WARNING);
    }
    if (ordersEnabled) {
      addReportMetric(attentionSummary, "Hesap bekleyen masa", String.valueOf(report.paymentWaitingTables), UiKit.DANGER);
    }
    if (tasksEnabled) {
      addReportMetric(attentionSummary, "Geciken / tamamlanmayan iş", report.overdueTasks + " / " + report.incompleteTasks, UiKit.ACCENT);
    }
    if (stockEnabled) {
      addReportMetric(attentionSummary, "Tükenen / az stok", report.outOfStockItems + " / " + report.lowStockItems, UiKit.DANGER);
    }
    page.addView(attentionSummary);
    if (report.attentionItems.isEmpty()) {
      page.addView(emptyCard("Acil başlık yok", "Şu anda ayrıca listelenecek dikkat başlığı bulunmuyor."));
    } else {
      for (OperationData.ReportAttentionItem item : report.attentionItems) {
        page.addView(reportAttentionCard(item));
      }
    }

    if (AndroidUiRules.canUseAi(data)) {
      page.addView(sectionLabel("AI yorumu (isteğe bağlı)"));
      page.addView(UiKit.text(
          this,
          "AI yeni hesap yapmaz; yalnız yukarıdaki hazır JSON özetini kısa ve sade biçimde açıklar.",
          12,
          UiKit.SECONDARY,
          Typeface.NORMAL
      ));
      page.addView(reportAiButton("Bu dönemi özetle", "summary"));
      page.addView(reportAiButton("Dikkat edilmesi gerekenler", "attention"));
      if (ordersEnabled) {
        page.addView(reportAiButton("Satışları yorumla", "sales"));
      }
      page.addView(reportAiButton("3 kısa öneri ver", "recommendations"));
      if (reportAiLoading) {
        page.addView(emptyCard("AI yorumu hazırlanıyor", "Hazır rapor güvenli sunucu bağlantısı üzerinden yorumlanıyor."));
      } else if (!reportAiAnswer.isEmpty()) {
        LinearLayout answer = UiKit.card(this);
        answer.setBackground(UiKit.rounded(this, UiKit.PRIMARY_DARK, UiKit.PRIMARY, 14));
        answer.addView(UiKit.text(this, reportAiAnswer, 13, UiKit.TEXT, Typeface.NORMAL));
        page.addView(answer);
      } else if (!reportAiMessage.isEmpty()) {
        LinearLayout message = UiKit.card(this);
        message.addView(UiKit.text(this, reportAiMessage, 13, UiKit.WARNING, Typeface.BOLD));
        page.addView(message);
      }
    }
    return UiKit.scroll(this, page);
  }

  private void addReportMetric(LinearLayout card, String label, String value, int tone) {
    if (card.getChildCount() > 0) {
      card.addView(UiKit.divider(this));
    }
    card.addView(settingLine(label, value, tone));
  }

  private View reportTopItemCard(OperationData.ReportTopItem item, int rank) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    TextView name = UiKit.text(this, rank + ". " + item.name, 14, UiKit.TEXT, Typeface.BOLD);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(name);
    top.addView(statusBadge(money(item.revenue, "TRY"), UiKit.SUCCESS));
    card.addView(top);
    card.addView(UiKit.text(
        this,
        "Satılan miktar: " + stockNumber(item.quantity),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    return card;
  }

  private View reportAttentionCard(OperationData.ReportAttentionItem item) {
    LinearLayout card = UiKit.card(this);
    card.addView(UiKit.text(this, item.title, 14, UiKit.TEXT, Typeface.BOLD));
    if (!item.detail.isEmpty()) {
      card.addView(UiKit.text(this, item.detail, 12, UiKit.SECONDARY, Typeface.NORMAL));
    }
    return card;
  }

  private View reportAiButton(String label, String mode) {
    Button button = UiKit.outlineButton(this, label, view -> requestReportAi(mode));
    button.setEnabled(!reportAiLoading);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
    params.setMargins(0, UiKit.dp(this, 8), 0, 0);
    button.setLayoutParams(params);
    return button;
  }

  private void requestReportAi(String mode) {
    if (!data.isAdmin() || !AndroidUiRules.canUseAi(data)) {
      reportAiMessage = "Bu cihazın raporlara erişim yetkisi yok.";
      showError(reportAiMessage);
      render();
      return;
    }
    if ("sales".equals(mode) && !data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS)) {
      reportAiMessage = "Restoran sipariş capability'si kapalı olduğu için satış yorumu kullanılamıyor.";
      render();
      return;
    }
    if (data.report(reportPreset) == null) {
      reportAiMessage = "Rapor verisi henüz hazır değil. Masaüstünde senkronu yenileyin.";
      render();
      return;
    }
    String baseUrl = ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = ConnectionSettings.syncSecret(preferences);
    if (baseUrl.isEmpty() || syncSecret.isEmpty()) {
      reportAiMessage = "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.";
      render();
      return;
    }

    final String requestedPreset = reportPreset;
    final int requestVersion = ++reportAiRequestVersion;
    reportAiLoading = true;
    reportAiAnswer = "";
    reportAiMessage = "";
    render();
    executor.execute(() -> {
      try {
        String answer = syncClient.generateReportComment(
            baseUrl,
            syncSecret,
            identity,
            mode,
            requestedPreset
        );
        runOnUiThread(() -> {
          if (requestVersion != reportAiRequestVersion || !requestedPreset.equals(reportPreset)) {
            return;
          }
          reportAiLoading = false;
          if (!data.isAdmin() || !AndroidUiRules.canUseAi(data)) {
            reportAiAnswer = "";
            reportAiMessage = "Bu cihazın raporlara erişim yetkisi yok.";
          } else {
            reportAiAnswer = answer;
            reportAiMessage = "";
          }
          render();
        });
      } catch (HostingSyncClient.SyncException error) {
        runOnUiThread(() -> {
          if (requestVersion != reportAiRequestVersion || !requestedPreset.equals(reportPreset)) {
            return;
          }
          reportAiLoading = false;
          reportAiAnswer = "";
          reportAiMessage = "Bu cihazın raporlara erişim yetkisi yok.".equals(error.getMessage())
              ? error.getMessage()
              : "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.";
          render();
        });
      }
    });
  }

  private View settingsScreen() {
    LinearLayout page = UiKit.column(this);
    boolean canViewTechnicalSettings = !data.permissionsResolved || data.hasPermission("settings.view");
    page.addView(sectionLabel("Görünüm"));
    LinearLayout appearance = UiKit.card(this);
    appearance.addView(settingLine("Tema", themeMode.label, UiKit.PRIMARY));
    page.addView(appearance);
    if (data.hasPermission("finance.view")) {
      page.addView(sectionLabel("Kasa"));
      LinearLayout cash = UiKit.card(this);
      cash.addView(UiKit.text(this, "Mobil Kasa", 15, UiKit.TEXT, Typeface.BOLD));
      cash.addView(UiKit.text(
          this,
          data.hasBusinessCapability(AndroidUiRules.CAPABILITY_FOLIO)
              ? "Bugünkü gelir, gider, net durum, bekleyen oda alacağı ve son hareketleri hızlıca izleyin."
              : "Bugünkü gelir, gider, net durum ve son hareketleri hızlıca izleyin.",
          12,
          UiKit.SECONDARY,
          Typeface.NORMAL
      ));
      Button openCash = UiKit.button(this, "Kasa'yı Aç", UiKit.PRIMARY, view -> {
        settingsOpen = false;
        activeTab = TAB_CASH;
        clearError();
        render();
      });
      LinearLayout.LayoutParams cashButtonParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
      cashButtonParams.setMargins(0, UiKit.dp(this, 12), 0, 0);
      openCash.setLayoutParams(cashButtonParams);
      cash.addView(openCash);
      page.addView(cash);
    }
    if (AndroidUiRules.canOpenTab(data, TAB_REPORTS)) {
      page.addView(sectionLabel("Yönetici"));
      LinearLayout reports = UiKit.card(this);
      reports.addView(UiKit.text(this, "İşletme raporları", 15, UiKit.TEXT, Typeface.BOLD));
      boolean reportOrdersEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS);
      boolean reportCustomersEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_CUSTOMERS);
      String reportDescription = reportOrdersEnabled && reportCustomersEnabled
          ? "Satışları, müşteri taleplerini ve güncel dikkat listesini kısa dönemlerle izleyin."
          : reportOrdersEnabled
              ? "Satışları ve etkin operasyonların güncel dikkat listesini kısa dönemlerle izleyin."
              : reportCustomersEnabled
                  ? "Müşteri taleplerini ve etkin operasyonların güncel dikkat listesini kısa dönemlerle izleyin."
                  : "Etkin operasyonların güncel dikkat listesini kısa dönemlerle izleyin.";
      reports.addView(UiKit.text(
          this,
          reportDescription,
          12,
          UiKit.SECONDARY,
          Typeface.NORMAL
      ));
      Button openReports = UiKit.button(this, "Raporları Aç", UiKit.PRIMARY, view -> {
        settingsOpen = false;
        activeTab = TAB_REPORTS;
        clearError();
        render();
      });
      LinearLayout.LayoutParams reportButtonParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
      reportButtonParams.setMargins(0, UiKit.dp(this, 12), 0, 0);
      openReports.setLayoutParams(reportButtonParams);
      reports.addView(openReports);
      page.addView(reports);
    }
    if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_NOTIFICATIONS)) {
      page.addView(sectionLabel("Bildirim tercihleri"));
      LinearLayout notificationPreferences = UiKit.card(this);
      boolean hasNotificationPreference = false;
    boolean customerNotifications = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_CUSTOMERS)
        && (!data.permissionsResolved || data.hasPermission("customer.view"));
    boolean reservationNotifications = data.hasAnyReservationCapability()
        && (!data.permissionsResolved || data.hasPermission("reservation.view"));
    if (customerNotifications || reservationNotifications) {
      notificationPreferences.addView(notificationToggle(
          customerNotifications && reservationNotifications
              ? "Müşteri / Rezervasyon"
              : (reservationNotifications ? "Rezervasyon" : "Müşteri Talepleri"),
          customerNotifications && reservationNotifications
              ? "Yeni talepler ve etkin alanlardaki onay bekleyen rezervasyonlar"
              : (reservationNotifications ? "Etkin alanlardaki onay bekleyen rezervasyonlar" : "Yeni ve yanıt bekleyen müşteri talepleri"),
          NotificationEvent.CATEGORY_CUSTOMER
      ));
      hasNotificationPreference = true;
    }
    boolean orderNotifications = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS)
        && (!data.permissionsResolved || data.hasPermission("table_order.view"));
    if (orderNotifications) {
      if (hasNotificationPreference) notificationPreferences.addView(UiKit.divider(this));
      notificationPreferences.addView(notificationToggle(
          "Restoran / Sipariş",
          "Masa siparişleri ve hesap bekleyen adisyonlar",
          NotificationEvent.CATEGORY_RESTAURANT
      ));
      hasNotificationPreference = true;
    }
    boolean roomNotifications = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ROOMS)
        && (!data.permissionsResolved || data.hasPermission("room.view"));
    boolean taskNotifications = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_TASKS)
        && (!data.permissionsResolved || data.hasPermission("daily_task.view"));
    if (roomNotifications || taskNotifications) {
      if (hasNotificationPreference) notificationPreferences.addView(UiKit.divider(this));
      notificationPreferences.addView(notificationToggle(
          roomNotifications && taskNotifications ? "Oda / Günlük İş" : (roomNotifications ? "Oda" : "Günlük İşler"),
          roomNotifications && taskNotifications
              ? "Temizlik, bakım ve etkin alanlardaki bekleyen işler"
              : (roomNotifications ? "Temizlik ve bakım bekleyen odalar" : "Bekleyen ve geciken günlük işler"),
          NotificationEvent.CATEGORY_ROOMS
      ));
      hasNotificationPreference = true;
    }
    if (hasNotificationPreference) notificationPreferences.addView(UiKit.divider(this));
    notificationPreferences.addView(notificationToggle(
        "İşlem hataları",
        "Telefondan gönderilen işlemler uygulanamadığında",
        NotificationEvent.CATEGORY_ACTION
    ));
    hasNotificationPreference = true;
    if (canViewTechnicalSettings) {
      notificationPreferences.addView(UiKit.divider(this));
      notificationPreferences.addView(notificationToggle(
          "Sync bağlantısı",
          "Canlı veri uzun süredir yenilenemediğinde",
          NotificationEvent.CATEGORY_SYNC
      ));
    }
    notificationPreferences.addView(UiKit.text(
        this,
        "Bu anahtarlar cihaz yetkilerini genişletmez; masaüstünde kapalı olan görev alanları bildirim üretemez.",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
      page.addView(notificationPreferences);
    }

    if (!canViewTechnicalSettings) {
      return UiKit.scroll(this, page);
    }

    connectionSettingsPanel = new AndroidConnectionSettingsPanel(
        this,
        preferences,
        data,
        identity,
        connectionState,
        loading,
        localPendingActionCount(),
        () -> syncOperations(true)
    );
    connectionSettingsPanel.appendTo(page);

    page.addView(UiKit.sectionTitle(this, "Son telefon işlemleri"));
    if (data.actions.isEmpty()) {
      page.addView(emptyCard("Gönderilmiş işlem yok", "Telefondan yaptığınız değişiklikler burada bekliyor, uygulandı veya hata durumuyla görünür."));
    }
    for (OperationData.ActionRecord action : data.actions) {
      page.addView(actionCard(action));
    }
    return UiKit.scroll(this, page);
  }

  private View notificationToggle(String title, String detail, String category) {
    LinearLayout row = UiKit.row(this);
    row.setGravity(Gravity.CENTER_VERTICAL);
    row.setPadding(0, UiKit.dp(this, 7), 0, UiKit.dp(this, 7));
    LinearLayout copy = UiKit.column(this);
    copy.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    copy.addView(UiKit.text(this, title, 14, UiKit.TEXT, Typeface.BOLD));
    copy.addView(UiKit.text(this, detail, 11, UiKit.SECONDARY, Typeface.NORMAL));
    row.addView(copy);

    Switch toggle = new Switch(this);
    UiKit.styleSwitch(toggle);
    toggle.setChecked(NotificationPreferences.isEnabled(preferences, category));
    toggle.setContentDescription(title + " bildirimleri");
    toggle.setOnCheckedChangeListener((button, checked) -> {
      NotificationPreferences.setEnabled(preferences, category, checked);
      if (localNotifications != null) {
        localNotifications.refreshCurrentSnapshot(data);
      }
    });
    row.addView(toggle, new LinearLayout.LayoutParams(-2, UiKit.dp(this, 48)));
    return row;
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
        landscapeLayout ? LANDSCAPE_CONTENT_BOTTOM_PADDING_DP : MAIN_CONTENT_BOTTOM_PADDING_DP
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
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    TextView name = UiKit.text(this, request.customerName, 15, UiKit.TEXT, Typeface.BOLD);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(name);
    top.addView(statusBadge(formatRequestStatus(request.status), requestTone(request.status)));
    card.addView(top);
    card.addView(UiKit.text(this, formatRequestType(request.type) + " · " + requestDate(request), 12, UiKit.MUTED, Typeface.NORMAL));
    LinearLayout actions = UiKit.row(this);
    UiKit.addAction(actions, UiKit.outlineButton(this, "Ara", view -> openDialer(request.customerPhone)), this);
    UiKit.addAction(actions, UiKit.button(this, "Aç", UiKit.PRIMARY, view -> showRequestDetail(request)), this);
    LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(-1, -2);
    actionParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
    actions.setLayoutParams(actionParams);
    card.addView(actions);
    return card;
  }

  private View requestCard(OperationData.RequestRecord request) {
    LinearLayout card = UiKit.card(this);
    card.setOnClickListener(view -> showRequestDetail(request));
    LinearLayout top = UiKit.row(this);
    LinearLayout identity = UiKit.column(this);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(this, request.customerName, 16, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(this, formatRequestType(request.type), 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(identity);
    top.addView(statusBadge(formatRequestStatus(request.status), requestTone(request.status)));
    card.addView(top);

    String meta = requestDate(request);
    if (request.guestCount > 0) {
      meta += " · " + request.guestCount + " kişi";
    }
    card.addView(UiKit.text(this, meta, 12, UiKit.MUTED, Typeface.NORMAL));
    if (!request.message.isEmpty()) {
      TextView note = UiKit.text(this, ellipsize(request.message, 150), 13, UiKit.TEXT, Typeface.NORMAL);
      note.setMaxLines(2);
      note.setEllipsize(android.text.TextUtils.TruncateAt.END);
      LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, -2);
      noteParams.setMargins(0, UiKit.dp(this, 8), 0, UiKit.dp(this, 10));
      note.setLayoutParams(noteParams);
      card.addView(note);
    }
    LinearLayout actions = UiKit.row(this);
    UiKit.addAction(actions, UiKit.outlineButton(this, "Ara", view -> openDialer(request.customerPhone)), this);
    if (AndroidUiRules.canUseWhatsApp(data) && data.hasPermission("customer.respond")) {
      UiKit.addAction(actions, UiKit.outlineButton(this, "WhatsApp", view -> openWhatsApp(request.customerPhone, request.readyMessage())), this);
    }
    UiKit.addAction(actions, UiKit.button(this, "Aç", UiKit.PRIMARY, view -> showRequestDetail(request)), this);
    card.addView(actions);
    return card;
  }

  private View waitingMessageCard(OperationData.RequestRecord request) {
    OperationData.MessageRecord message = null;
    for (OperationData.MessageRecord candidate : data.messages) {
      if (request.id.equals(candidate.requestId)) {
        message = candidate;
        break;
      }
    }
    if (message == null) {
      message = new OperationData.MessageRecord();
      message.id = "message_" + request.id;
      message.requestId = request.id;
      message.customerName = request.customerName;
      message.customerPhone = request.customerPhone;
      message.message = request.readyMessage();
      message.updatedAt = request.updatedAt;
    }
    String preview = !message.message.isEmpty()
        ? message.message
        : (AndroidUiRules.canUseAi(data) && !request.aiSummary.isEmpty()
            ? request.aiSummary
            : request.message);
    return messageCard(message, "Cevap bekliyor", UiKit.WARNING, preview);
  }



  private View reservationCard(OperationData.ReservationRecord reservation, boolean compact) {
    if (!AndroidUiRules.reservationAllowed(data, reservation)) {
      return new View(this);
    }
    LinearLayout card = UiKit.card(this);
    card.setOnClickListener(view -> showReservationDetail(reservation));
    LinearLayout top = UiKit.row(this);
    TextView title = UiKit.text(this, reservation.customerName.isEmpty() ? reservation.title : reservation.customerName, 15, UiKit.TEXT, Typeface.BOLD);
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(title);
    top.addView(statusBadge(formatReservationStatus(reservation.status), reservationTone(reservation.status)));
    card.addView(top);
    String dates = joinDateRange(reservation.startDate, reservation.endDate);
    if (!reservation.time.isEmpty()) {
      dates += " · " + reservation.time;
    }
    if (reservation.guestCount > 0) {
      dates += " · " + reservation.guestCount + " kişi";
    }
    card.addView(UiKit.text(this, dates, 12, UiKit.MUTED, Typeface.NORMAL));
    if (!reservation.roomIds.isEmpty()) {
      card.addView(UiKit.text(this, "Oda: " + namesForRooms(reservation.roomIds), 12, UiKit.MUTED, Typeface.NORMAL));
    }
    if (!reservation.tableIds.isEmpty()) {
      card.addView(UiKit.text(this, "Masa: " + namesForTables(reservation.tableIds), 12, UiKit.MUTED, Typeface.NORMAL));
    }
    LinearLayout contact = UiKit.row(this);
    LinearLayout.LayoutParams contactParams = new LinearLayout.LayoutParams(-1, -2);
    contactParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
    contact.setLayoutParams(contactParams);
    UiKit.addAction(contact, UiKit.outlineButton(this, "Ara", view -> openDialer(reservation.customerPhone)), this);
    UiKit.addAction(contact, UiKit.button(this, "Aç", UiKit.PRIMARY, view -> showReservationDetail(reservation)), this);
    card.addView(contact);
    return card;
  }

  private View priorityReservationCard(OperationData.ReservationRecord reservation) {
    return reservationCard(reservation, true);
  }

  private View roomCard(OperationData.RoomRecord room) {
    return PensionRoomCard.create(
        this,
        data,
        room,
        new PensionRoomCard.Listener() {
          @Override
          public void onAssignCustomer(OperationData.RoomRecord selectedRoom) {
            showRoomAssignmentDialog(null, selectedRoom);
          }

          @Override
          public void onManageStay(OperationData.CustomerRoomStayRecord stay) {
            showCustomerRoomStayActions(stay);
          }

          @Override
          public void onChangeStatus(OperationData.RoomRecord selectedRoom) {
            showRoomStatusDialog(selectedRoom);
          }
        }
    );
  }

  private View customerRoomStayCard(OperationData.CustomerRoomStayRecord stay) {
    return PensionStayCard.create(
        this,
        data,
        stay,
        this::showCustomerRoomStayActions
    );
  }

  private View taskCard(OperationData.TaskRecord task, boolean compact) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout details = UiKit.column(this);
    details.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    details.addView(UiKit.text(this, task.title, 15, UiKit.TEXT, Typeface.BOLD));
    String due = joinNonEmpty(" · ", task.dueDate, task.dueTime);
    details.addView(UiKit.text(this, due.isEmpty() ? "Saat belirtilmemiş" : due, 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(details);
    top.addView(statusBadge(formatTaskStatus(task.status), taskTone(task.status)));
    card.addView(top);
    if (!compact && !task.description.isEmpty()) {
      card.addView(UiKit.text(this, ellipsize(task.description, 130), 12, UiKit.MUTED, Typeface.NORMAL));
    }
    boolean manualTask = AndroidUiRules.isManualTask(task);
    boolean canEdit = manualTask && data.hasPermission("daily_task.update");
    boolean canReopen = ("done".equals(task.status) || "cancelled".equals(task.status)) && data.hasPermission("daily_task.reopen");
    boolean canComplete = !"done".equals(task.status) && !"cancelled".equals(task.status) && data.hasPermission("daily_task.complete");
    if (canEdit || canReopen || canComplete) {
      LinearLayout actions = UiKit.row(this);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, UiKit.dp(this, 9), 0, 0);
      actions.setLayoutParams(params);
      if (canEdit) {
        DailyTaskEditorDialog.Kind kind = AndroidUiRules.isRestaurantTask(data, task)
            ? DailyTaskEditorDialog.Kind.RESTAURANT
            : DailyTaskEditorDialog.Kind.PENSION;
        UiKit.addAction(actions, UiKit.outlineButton(this, "Düzenle", view -> showDailyTaskEditor(kind, task)), this);
      }
      if (canReopen) {
        UiKit.addAction(actions, UiKit.button(this, "Yeniden Aç", UiKit.PRIMARY, view -> sendAction("daily_task_reopen", payload("task_id", task.id, "task_type", task.type, "expected_updated_at", task.updatedAt), "Günlük iş yeniden açılmak üzere gönderildi.")), this);
      } else if (canComplete) {
        UiKit.addAction(actions, UiKit.button(this, "Tamamla", UiKit.PRIMARY, view -> sendAction("daily_task_complete", payload("task_id", task.id, "task_type", task.type, "expected_updated_at", task.updatedAt), "Günlük iş tamamlanmak üzere gönderildi.")), this);
      }
      card.addView(actions);
    }
    return card;
  }

  private View tableCard(OperationData.TableRecord table) {
    return RestaurantTableCard.create(
        this,
        data,
        table,
        new RestaurantTableCard.Listener() {
          @Override
          public void onOpenOrder(OperationData.TableRecord selectedTable) {
            showTableOrder(selectedTable);
          }

          @Override
          public void onChangeStatus(OperationData.TableRecord selectedTable) {
            showTableStatusDialog(selectedTable);
          }

          @Override
          public void onSetPaymentWaiting(OperationData.TableOrder order) {
            sendOrderStatus(order, "payment");
          }

          @Override
          public void onClosePaid(
              OperationData.TableRecord selectedTable,
              OperationData.TableOrder order
          ) {
            confirm(
                "Adisyonu kapat",
                selectedTable.name + " adisyonu ödendi olarak kapatılsın mı?",
                () -> closeOrder(order, "paid")
            );
          }
        }
    );
  }

  private View stockCard(OperationData.TrackedStockItem item) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout identity = UiKit.column(this);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(this, item.name, 15, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(this, item.category, 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(identity);
    top.addView(statusBadge(formatStockStatus(item.stockStatus), stockTone(item.stockStatus)));
    card.addView(top);
    card.addView(UiKit.text(this,
        "Stok: " + stockQuantity(item.stockQuantity, item.stockUnit)
            + " · Minimum: " + (item.stockMinQuantity == null ? "—" : stockQuantity(item.stockMinQuantity, item.stockUnit)),
        13, UiKit.TEXT, Typeface.BOLD));

    if (data.hasPermission("menu.stock_update")) {
      Button update = UiKit.outlineButton(this, "Stok Güncelle", view -> showStockActionsDialog(item));
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 44));
      params.setMargins(0, UiKit.dp(this, 8), 0, 0);
      update.setLayoutParams(params);
      card.addView(update);
    }
    return card;
  }

  private View adminMenuCategoryCard(OperationData.MenuCategory category) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout identity = UiKit.column(this);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(this, category.name, 15, UiKit.TEXT, Typeface.BOLD));
    int productCount = 0;
    for (OperationData.MenuItem item : data.adminMenuItems) {
      if (category.id.equals(item.categoryId)) {
        productCount += 1;
      }
    }
    identity.addView(UiKit.text(
        this,
        productCount + " ürün · " + (category.active ? "Aktif" : "Pasif"),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(identity);
    top.addView(statusBadge(category.active ? "Aktif" : "Pasif", category.active ? UiKit.SUCCESS : UiKit.MUTED));
    card.addView(top);

    final int relatedProductCount = productCount;
    Button delete = UiKit.dangerButton(this, "Kategoriyi Sil", view -> confirm(
        "Menü kategorisini sil",
        category.name + " ve bağlı " + relatedProductCount + " ürün kalıcı görünümden kaldırılsın mı?",
        () -> sendAction(
            "menu_category_delete",
            payload("category_id", category.id, "expected_updated_at", category.updatedAt),
            "Menü kategorisi silinmek üzere gönderildi."
        )
    ));
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 44));
    params.setMargins(0, UiKit.dp(this, 8), 0, 0);
    delete.setLayoutParams(params);
    card.addView(delete);
    return card;
  }

  private View adminMenuItemCard(OperationData.MenuItem item) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout identity = UiKit.column(this);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(this, item.name, 15, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(
        this,
        data.adminCategoryName(item.categoryId) + " · " + money(item.price, item.currency),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(identity);
    top.addView(statusBadge(item.available ? "Satışta" : "Pasif", item.available ? UiKit.SUCCESS : UiKit.MUTED));
    card.addView(top);

    Button delete = UiKit.dangerButton(this, "Ürünü Sil", view -> confirm(
        "Menü ürününü sil",
        item.name + " menüden silinsin mi?",
        () -> sendAction(
            "menu_item_delete",
            payload("menu_item_id", item.id, "expected_updated_at", item.updatedAt),
            "Menü ürünü silinmek üzere gönderildi."
        )
    ));
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 44));
    params.setMargins(0, UiKit.dp(this, 8), 0, 0);
    delete.setLayoutParams(params);
    card.addView(delete);
    return card;
  }

  private View stockImageImportCard() {
    LinearLayout card = UiKit.card(this);
    card.setBackground(UiKit.rounded(this, UiKit.PRIMARY_DARK, UiKit.PRIMARY, 14));
    card.addView(UiKit.eyebrow(this, "AI DESTEKLİ STOK GİRİŞİ"));
    card.addView(UiKit.text(this, "Fatura veya fiş görselini kontrol edilebilir bir stok taslağına dönüştürün.", 13, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(this, "Stoklar siz onaylamadan değişmez. Görsel analiz için yapılandırılmış AI hizmetine gönderilir ve kalıcı saklanmaz.", 12, UiKit.MUTED, Typeface.NORMAL));
    LinearLayout actions = UiKit.row(this);
    LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(-1, -2);
    actionParams.setMargins(0, UiKit.dp(this, 10), 0, 0);
    actions.setLayoutParams(actionParams);
    UiKit.addAction(actions, UiKit.button(this, "Kamera ile çek", UiKit.PRIMARY, view -> launchStockCamera()), this);
    UiKit.addAction(actions, UiKit.outlineButton(this, "Galeriden seç", view -> launchStockGallery()), this);
    card.addView(actions);
    return card;
  }

  private View priorityStockCard(OperationData.TrackedStockItem item) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout identity = UiKit.column(this);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(this, item.name, 15, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(this, item.category + " · Stok " + stockQuantity(item.stockQuantity, item.stockUnit), 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(identity);
    top.addView(statusBadge(formatStockStatus(item.stockStatus), stockTone(item.stockStatus)));
    card.addView(top);
    Button open = UiKit.outlineButton(this, "Stoku Aç", view -> {
      openRoute("restaurant:stock");
      render();
    });
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 44));
    params.setMargins(0, UiKit.dp(this, 8), 0, 0);
    open.setLayoutParams(params);
    card.addView(open);
    return card;
  }

  private void showRoomStatusDialog(OperationData.RoomRecord room) {
    showStatusSelectionDialog("Oda durumunu değiştir", room.status, new String[][] {
        {"available", "Boş"},
        {"occupied", "Dolu"},
        {"cleaning", "Temizlik"},
        {"maintenance", "Bakım"}
    }, status -> updateRoom(room, status));
  }

  private void showTableStatusDialog(OperationData.TableRecord table) {
    ArrayList<String[]> options = new ArrayList<>();
    options.add(new String[] {"available", "Boş"});
    options.add(new String[] {"occupied", "Dolu"});
    if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS)) {
      options.add(new String[] {"reserved", "Rezerve"});
    }
    if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS)) {
      options.add(new String[] {"bill_waiting", "Hesap"});
    }
    showStatusSelectionDialog(
        "Masa durumunu değiştir",
        table.status,
        options.toArray(new String[0][]),
        status -> updateTable(table, status)
    );
  }

  private void showStatusSelectionDialog(String title, String current, String[][] options, StatusSelection listener) {
    Dialog dialog = new Dialog(this);
    LinearLayout sheet = UiKit.column(this);
    sheet.setPadding(UiKit.dp(this, 18), UiKit.dp(this, 16), UiKit.dp(this, 18), UiKit.dp(this, 18));
    sheet.setBackground(UiKit.rounded(this, UiKit.SURFACE, UiKit.BORDER, 18));
    sheet.addView(UiKit.eyebrow(this, "DURUM"));
    sheet.addView(UiKit.title(this, title));
    for (String[] option : options) {
      boolean selected = option[0].equals(current);
      Button choice = selected
          ? UiKit.button(this, option[1] + " · Seçili", UiKit.PRIMARY, view -> dialog.dismiss())
          : UiKit.outlineButton(this, option[1], view -> {
            listener.onSelect(option[0]);
            dialog.dismiss();
          });
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
      params.setMargins(0, UiKit.dp(this, 8), 0, 0);
      choice.setLayoutParams(params);
      sheet.addView(choice);
    }
    dialog.setContentView(sheet);
    dialog.show();
    configureBottomDialog(dialog);
  }

  private void showStockActionsDialog(OperationData.TrackedStockItem item) {
    Dialog dialog = new Dialog(this);
    LinearLayout sheet = UiKit.column(this);
    sheet.setPadding(UiKit.dp(this, 18), UiKit.dp(this, 16), UiKit.dp(this, 18), UiKit.dp(this, 18));
    sheet.setBackground(UiKit.rounded(this, UiKit.SURFACE, UiKit.BORDER, 18));
    sheet.addView(UiKit.eyebrow(this, "STOK GÜNCELLE"));
    sheet.addView(UiKit.title(this, item.name));
    sheet.addView(UiKit.text(this, "Mevcut stok: " + stockQuantity(item.stockQuantity, item.stockUnit), 13, UiKit.MUTED, Typeface.NORMAL));

    int quickAddQuantity = "gram".equals(item.stockUnit) ? 1000 : 1;
    Button add = UiKit.button(this, "+" + stockQuantity(quickAddQuantity, item.stockUnit) + " Ekle", UiKit.PRIMARY, view -> {
      sendAction(
          "menu_stock_add",
          payload("menu_item_id", item.menuItemId, "quantity", quickAddQuantity, "note", "Android hızlı stok ekleme"),
          item.name + " stok ekleme işlemi gönderildi."
      );
      dialog.dismiss();
    });
    LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
    actionParams.setMargins(0, UiKit.dp(this, 10), 0, 0);
    add.setLayoutParams(actionParams);
    sheet.addView(add);

    Button set = UiKit.outlineButton(this, "Miktarı Ayarla", view -> {
      dialog.dismiss();
      showStockMutationDialog(item, "set");
    });
    LinearLayout.LayoutParams setParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
    setParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
    set.setLayoutParams(setParams);
    sheet.addView(set);

    Button adjust = UiKit.outlineButton(this, "Fark Gir", view -> {
      dialog.dismiss();
      showStockMutationDialog(item, "adjust");
    });
    LinearLayout.LayoutParams adjustParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
    adjustParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
    adjust.setLayoutParams(adjustParams);
    sheet.addView(adjust);

    dialog.setContentView(sheet);
    dialog.show();
    configureBottomDialog(dialog);
  }

  private void showStockMutationDialog(OperationData.TrackedStockItem item, String mode) {
    LinearLayout form = UiKit.column(this);
    int horizontal = UiKit.dp(this, 20);
    form.setPadding(horizontal, 0, horizontal, 0);
    EditText quantity = UiKit.input(this, "set".equals(mode)
        ? "Yeni stok miktarı (" + stockUnitLabel(item.stockUnit) + ")"
        : "Stok farkı (" + stockUnitLabel(item.stockUnit) + ")");
    quantity.setInputType(InputType.TYPE_CLASS_NUMBER
        | InputType.TYPE_NUMBER_FLAG_DECIMAL
        | ("adjust".equals(mode) ? InputType.TYPE_NUMBER_FLAG_SIGNED : 0));
    if ("set".equals(mode)) {
      quantity.setText(stockNumber(item.stockQuantity));
    }
    EditText note = UiKit.input(this, "Not (isteğe bağlı)");
    LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 50));
    noteParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
    note.setLayoutParams(noteParams);
    form.addView(quantity);
    form.addView(note);

    AlertDialog dialog = alertDialogBuilder()
        .setTitle("set".equals(mode) ? "Stok miktarını ayarla" : "Stok farkı gir")
        .setView(form)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton("Kaydet", null)
        .create();
    dialog.setOnShowListener(value -> {
      dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(UiKit.MUTED);
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(UiKit.PRIMARY);
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
        double parsed;
        try {
          parsed = Double.parseDouble(quantity.getText().toString().trim().replace(',', '.'));
        } catch (NumberFormatException error) {
          Toast.makeText(this, "Geçerli bir stok değeri girin.", Toast.LENGTH_SHORT).show();
          return;
        }
        if (("set".equals(mode) && parsed < 0) || ("adjust".equals(mode) && parsed == 0)) {
          Toast.makeText(this, "Stok değeri geçersiz.", Toast.LENGTH_SHORT).show();
          return;
        }
        String actionType = "set".equals(mode) ? "menu_stock_set" : "menu_stock_adjust";
        String quantityKey = "set".equals(mode) ? "quantity" : "quantity_change";
        sendAction(actionType, payload(
            "menu_item_id", item.menuItemId,
            quantityKey, parsed,
            "note", note.getText().toString().trim()
        ), item.name + " stok güncellemesi gönderildi.");
        dialog.dismiss();
      });
    });
    dialog.show();
  }

  private View activeOrderCard(OperationData.TableOrder order) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    TextView table = UiKit.text(this, order.tableName, 15, UiKit.TEXT, Typeface.BOLD);
    table.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(table);
    top.addView(statusBadge(formatOrderStatus(order.status), orderTone(order.status)));
    card.addView(top);
    card.addView(UiKit.text(this, order.itemCount + " ürün · " + money(order.total, orderCurrency(order)), 14, UiKit.TEXT, Typeface.BOLD));
    OperationData.TableRecord tableRecord = tableById(order.tableId);
    if (tableRecord == null && !order.tableId.isEmpty()) {
      tableRecord = new OperationData.TableRecord();
      tableRecord.id = order.tableId;
      tableRecord.name = order.tableName;
      tableRecord.status = "occupied";
      tableRecord.updatedAt = order.updatedAt;
    }
    if (tableRecord != null && data.hasPermission("table_order.view")) {
      OperationData.TableRecord selectedTable = tableRecord;
      Button open = UiKit.button(this, "Adisyonu Aç", UiKit.PRIMARY, view -> showTableOrder(selectedTable));
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 44));
      params.setMargins(0, UiKit.dp(this, 8), 0, 0);
      open.setLayoutParams(params);
      card.addView(open);
    }
    return card;
  }

  private View messageCard(OperationData.MessageRecord message) {
    return messageCard(message, "Hazır", UiKit.PRIMARY);
  }

  private View messageCard(OperationData.MessageRecord message, String status, int tone) {
    return messageCard(message, status, tone, message.message);
  }

  private View messageCard(OperationData.MessageRecord message, String status, int tone, String previewText) {
    LinearLayout card = UiKit.card(this);
    card.setOnClickListener(view -> showMessageDetail(message));
    LinearLayout top = UiKit.row(this);
    TextView name = UiKit.text(this, message.customerName, 15, UiKit.TEXT, Typeface.BOLD);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(name);
    top.addView(statusBadge(status, tone));
    card.addView(top);
    String preview = previewText == null || previewText.trim().isEmpty()
        ? "Hazır cevap bekleniyor"
        : ellipsize(previewText, 120);
    TextView body = UiKit.text(this, preview, 13, message.message.isEmpty() ? UiKit.MUTED : UiKit.TEXT, Typeface.NORMAL);
    body.setMaxLines(2);
    body.setEllipsize(android.text.TextUtils.TruncateAt.END);
    body.setPadding(0, UiKit.dp(this, 6), 0, UiKit.dp(this, 8));
    card.addView(body);
    LinearLayout actions = UiKit.row(this);
    if (AndroidUiRules.canUseWhatsApp(data) && data.hasPermission("customer.respond")) {
      Button copy = UiKit.outlineButton(this, "Kopyala", view -> copyText(message.message));
      copy.setEnabled(!message.message.isEmpty());
      UiKit.addAction(actions, copy, this);
      Button whatsapp = UiKit.outlineButton(this, "WhatsApp", view -> openWhatsApp(message.customerPhone, message.message));
      whatsapp.setEnabled(!message.message.isEmpty());
      UiKit.addAction(actions, whatsapp, this);
    }
    UiKit.addAction(actions, UiKit.button(this, "Aç", UiKit.PRIMARY, view -> showMessageDetail(message)), this);
    card.addView(actions);
    return card;
  }

  private View actionCard(OperationData.ActionRecord action) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    TextView label = UiKit.text(this, formatActionType(action.type), 14, UiKit.TEXT, Typeface.BOLD);
    label.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(label);
    top.addView(statusBadge(formatActionStatus(action.status), actionTone(action.status)));
    card.addView(top);
    card.addView(UiKit.text(this, shortTimestamp(action.createdAt), 11, UiKit.MUTED, Typeface.NORMAL));
    if (!action.errorMessage.isEmpty()) {
      TextView error = UiKit.text(this, action.errorMessage, 12, UiKit.DANGER, Typeface.NORMAL);
      error.setPadding(0, UiKit.dp(this, 6), 0, 0);
      card.addView(error);
    }
    return card;
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
    new CustomerDetailDialog(
        this,
        data,
        customer,
        new CustomerDetailDialog.Listener() {
          @Override
          public void addHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen) {
            addDetailHeaderActions(header, dialog, reopen);
          }

          @Override
          public void configureFullDialog(Dialog dialog) {
            MainActivity.this.configureFullDialog(dialog);
          }

          @Override
          public void onDial(String phone) {
            openDialer(phone);
          }

          @Override
          public void onWhatsApp(String phone) {
            openWhatsApp(phone, "");
          }

          @Override
          public void onEditCustomer(OperationData.CustomerRecord selectedCustomer) {
            showCustomerForm(selectedCustomer);
          }

          @Override
          public void onAssignRoom(OperationData.CustomerRecord selectedCustomer) {
            showRoomAssignmentDialog(selectedCustomer, null);
          }

          @Override
          public View createStayCard(OperationData.CustomerRoomStayRecord stay) {
            return customerRoomStayCard(stay);
          }

          @Override
          public void onDeleteCustomer(OperationData.CustomerRecord selectedCustomer, Dialog dialog) {
            confirm(
                "Müşteriyi sil",
                selectedCustomer.fullName + " müşteri listesinden silinsin mi? Eski talep ve rezervasyon kayıtları korunur.",
                () -> {
                  sendAction(
                      "customer_delete",
                      payload(
                          "customer_id",
                          selectedCustomer.id,
                          "expected_updated_at",
                          selectedCustomer.updatedAt
                      ),
                      "Müşteri silinmek üzere gönderildi."
                  );
                  dialog.dismiss();
                }
            );
          }
        }
    ).show();
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
            showIdentityImageSourceDialog();
          }

          @Override
          public void onSubmit(String actionType, JSONObject actionPayload, String successMessage) {
            sendAction(actionType, actionPayload, successMessage);
          }

          @Override
          public void onDismiss(CustomerFormDialog closedDialog) {
            if (activeCustomerFormDialog == closedDialog) {
              activeCustomerFormDialog = null;
            }
            deletePendingIdentityCameraFile();
          }
        }
    );
    activeCustomerFormDialog = formDialog;
    formDialog.show();
    configureFullDialog(formDialog.dialog());
  }



  private void showRoomAssignmentDialog(
      OperationData.CustomerRecord preferredCustomer,
      OperationData.RoomRecord preferredRoom
  ) {
    if (!canManageCustomerRoomStays()) {
      showError("Müşteri-oda ataması yalnız yetkili yönetici cihazlarda kullanılabilir.");
      return;
    }
    if (data.customers.isEmpty() || data.rooms.isEmpty()) {
      showError(data.customers.isEmpty()
          ? "Odaya atamak için önce bir müşteri kartı oluşturun."
          : "Atama yapılabilecek oda kaydı bulunamadı.");
      return;
    }
    RoomAssignmentDialog.show(this, data, preferredCustomer, preferredRoom, new RoomAssignmentDialog.Listener() {
      @Override
      public void onSubmit(JSONObject actionPayload) {
        sendAction("customer_room_assign", actionPayload, "Müşteri-oda ataması gönderildi.");
      }

      @Override
      public void configureFullDialog(Dialog dialog) {
        MainActivity.this.configureFullDialog(dialog);
      }
    });
  }

  private void showCustomerRoomStayActions(OperationData.CustomerRoomStayRecord stay) {
    if (!canManageCustomerRoomStays() || !canTransitionCustomerRoomStay(stay)) {
      Toast.makeText(this, "Bu konaklama kaydında kullanılabilir durum işlemi yok.", Toast.LENGTH_SHORT).show();
      return;
    }
    PensionStayActionsDialog.show(this, stay, new PensionStayActionsDialog.Listener() {
      @Override
      public void onStatusChange(String nextStatus) {
        sendAction(
            "customer_room_stay_status",
            payload("stay_id", stay.id, "status", nextStatus, "expected_updated_at", stay.updatedAt),
            "Konaklama durumu güncellenmek üzere gönderildi."
        );
      }

      @Override
      public void configureBottomDialog(Dialog dialog) {
        MainActivity.this.configureBottomDialog(dialog);
      }
    });
  }

  private void showRequestDetail(OperationData.RequestRecord request) {
    Dialog dialog = new Dialog(this);
    LinearLayout shell = UiKit.column(this);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(this, 16), UiKit.dp(this, 14), UiKit.dp(this, 16), UiKit.dp(this, 20));

    LinearLayout header = UiKit.row(this);
    LinearLayout heading = UiKit.column(this);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(this, "TALEP DETAYI"));
    heading.addView(UiKit.title(this, request.customerName));
    header.addView(heading);
    addDetailHeaderActions(header, dialog, () -> showRequestDetail(request));
    shell.addView(header);

    LinearLayout page = UiKit.column(this);
    LinearLayout summary = UiKit.card(this);
    summary.addView(detailLine("Talep", formatRequestType(request.type)));
    summary.addView(UiKit.divider(this));
    summary.addView(detailLine("Tarih / kişi", requestDate(request) + (request.guestCount > 0 ? " · " + request.guestCount + " kişi" : "")));
    summary.addView(UiKit.divider(this));
    summary.addView(detailLine("Durum", formatRequestStatus(request.status)));
    if (!request.message.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(UiKit.text(this, request.message, 14, UiKit.TEXT, Typeface.NORMAL));
    }
    if (AndroidUiRules.canUseAi(data) && !request.aiSummary.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(UiKit.text(this, "Kısa özet", 12, UiKit.PRIMARY, Typeface.BOLD));
      summary.addView(UiKit.text(this, request.aiSummary, 13, UiKit.TEXT, Typeface.NORMAL));
    }
    page.addView(summary);

    page.addView(UiKit.sectionTitle(this, "İletişim"));
    LinearLayout contact = UiKit.row(this);
    UiKit.addAction(contact, UiKit.outlineButton(this, "Ara", view -> openDialer(request.customerPhone)), this);
    if (AndroidUiRules.canUseWhatsApp(data) && data.hasPermission("customer.respond")) {
      UiKit.addAction(contact, UiKit.button(this, "WhatsApp", UiKit.PRIMARY, view -> openWhatsApp(request.customerPhone, request.readyMessage())), this);
    }
    page.addView(contact);

    String readyMessage = request.readyMessage();
    if (!readyMessage.isEmpty()
        && AndroidUiRules.canUseWhatsApp(data)
        && data.hasPermission("customer.respond")) {
      Button ready = UiKit.outlineButton(this, "Hazır Cevabı Göster", view -> showPreparedReply(request.customerName, readyMessage));
      LinearLayout.LayoutParams readyParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
      readyParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      ready.setLayoutParams(readyParams);
      page.addView(ready);
    }

    boolean canConvert = AndroidUiRules.canConvertRequest(data, request);
    boolean canRespond = data.hasPermission("customer.respond");
    boolean canReject = data.hasPermission("customer.reject");
    boolean canMarkAnswered = data.hasPermission("customer.mark_answered");
    if (canConvert || canRespond || canReject || canMarkAnswered) {
      page.addView(UiKit.sectionTitle(this, "Hızlı karar"));
    }
    if (canConvert) {
      Button convert = UiKit.button(this, "Rezervasyona Çevir", UiKit.PRIMARY, view -> {
        sendAction("customer_request_convert_to_reservation", payload("request_id", request.id, "expected_updated_at", request.updatedAt), "Talep rezervasyona çevrilmek üzere gönderildi.");
        dialog.dismiss();
      });
      convert.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46)));
      page.addView(convert);
    }

    if (canRespond || canReject) {
      LinearLayout decisions = UiKit.row(this);
      LinearLayout.LayoutParams decisionParams = new LinearLayout.LayoutParams(-1, -2);
      decisionParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      decisions.setLayoutParams(decisionParams);
      if (canRespond) {
        UiKit.addAction(decisions, UiKit.outlineButton(this, "Onayla", view -> {
          sendAction("customer_request_approve", payload("request_id", request.id, "expected_updated_at", request.updatedAt), "Talep onayı gönderildi.");
          dialog.dismiss();
        }), this);
      }
      if (canReject) {
        UiKit.addAction(decisions, UiKit.dangerButton(this, "Reddet", view -> confirm("Talebi reddet", request.customerName + " talebi reddedilsin mi?", () -> {
          sendAction("customer_request_reject", payload("request_id", request.id, "expected_updated_at", request.updatedAt), "Talep reddi gönderildi.");
          dialog.dismiss();
        })), this);
      }
      page.addView(decisions);
    }

    if (canMarkAnswered || canRespond) {
      LinearLayout response = UiKit.row(this);
      LinearLayout.LayoutParams responseParams = new LinearLayout.LayoutParams(-1, -2);
      responseParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      response.setLayoutParams(responseParams);
      if (canMarkAnswered) {
        UiKit.addAction(response, UiKit.button(this, "Cevaplandı", UiKit.ACCENT, view -> {
          sendAction("customer_request_mark_answered", payload("request_id", request.id, "expected_updated_at", request.updatedAt), "Talep cevaplandı olarak gönderildi.");
          dialog.dismiss();
        }), this);
      }
      if (canRespond) {
        UiKit.addAction(response, UiKit.outlineButton(this, "Yeniden Aç", view -> {
          sendAction("customer_request_reopen", payload("request_id", request.id, "expected_updated_at", request.updatedAt), "Talep yeniden açılmak üzere gönderildi.");
          dialog.dismiss();
        }), this);
      }
      page.addView(response);
    }

    if (AndroidUiRules.canDelete(data, "request.delete")) {
      page.addView(sectionLabel("Yönetici işlemi"));
      Button delete = UiKit.dangerButton(this, "Talebi Sil", view -> confirm(
          "Talebi sil",
          request.customerName + " talebi ve bu talebe bağlı hazır mesaj silinsin mi?",
          () -> {
            sendAction(
                "customer_request_delete",
                payload("request_id", request.id, "expected_updated_at", request.updatedAt),
                "Talep silinmek üzere gönderildi."
            );
            dialog.dismiss();
          }
      ));
      delete.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46)));
      page.addView(delete);
    }

    ScrollView scroll = UiKit.scroll(this, page);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);
    dialog.setContentView(shell);
    dialog.show();
    configureFullDialog(dialog);
  }

  private void showReservationDetail(OperationData.ReservationRecord reservation) {
    if (!AndroidUiRules.reservationAllowed(data, reservation)
        || !data.hasPermission("reservation.view")) {
      showError("Bu rezervasyon alanı işletmede etkin değil.");
      return;
    }
    Dialog dialog = new Dialog(this);
    LinearLayout shell = UiKit.column(this);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(this, 16), UiKit.dp(this, 14), UiKit.dp(this, 16), UiKit.dp(this, 20));

    LinearLayout header = UiKit.row(this);
    LinearLayout heading = UiKit.column(this);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(this, "REZERVASYON DETAYI"));
    heading.addView(UiKit.title(this, reservation.customerName.isEmpty() ? reservation.title : reservation.customerName));
    header.addView(heading);
    addDetailHeaderActions(header, dialog, () -> showReservationDetail(reservation));
    shell.addView(header);

    LinearLayout page = UiKit.column(this);
    LinearLayout summary = UiKit.card(this);
    summary.addView(detailLine("Durum", formatReservationStatus(reservation.status)));
    summary.addView(UiKit.divider(this));
    summary.addView(detailLine("Tarih", joinDateRange(reservation.startDate, reservation.endDate)));
    if (!reservation.time.isEmpty() || reservation.guestCount > 0) {
      summary.addView(UiKit.divider(this));
      summary.addView(detailLine("Saat / kişi", joinNonEmpty(" · ", reservation.time,
          reservation.guestCount > 0 ? reservation.guestCount + " kişi" : "")));
    }
    if (!reservation.roomIds.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(detailLine("Oda", namesForRooms(reservation.roomIds)));
    }
    if (!reservation.tableIds.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(detailLine("Masa", namesForTables(reservation.tableIds)));
    }
    if (!reservation.notes.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(UiKit.text(this, reservation.notes, 13, UiKit.TEXT, Typeface.NORMAL));
    }
    page.addView(summary);

    page.addView(sectionLabel("İletişim"));
    LinearLayout contact = UiKit.row(this);
    UiKit.addAction(contact, UiKit.outlineButton(this, "Ara", view -> openDialer(reservation.customerPhone)), this);
    if (AndroidUiRules.canUseWhatsApp(data) && data.hasPermission("customer.respond")) {
      UiKit.addAction(contact, UiKit.button(this, "WhatsApp", UiKit.PRIMARY,
          view -> openWhatsApp(reservation.customerPhone, reservationMessage(reservation))), this);
    }
    page.addView(contact);

    ReservationEditorDialog.Kind editKind = reservationEditorKind(reservation);
    if (editKind != null
        && data.hasPermission("reservation.update")
        && ("pending".equals(reservation.status) || "approved".equals(reservation.status))) {
      page.addView(sectionLabel("Düzenleme"));
      Button edit = UiKit.outlineButton(this, "Rezervasyonu Düzenle", view -> {
        dialog.dismiss();
        showReservationEditor(editKind, reservation);
      });
      edit.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46)));
      page.addView(edit);
    }

    if ("pending".equals(reservation.status)
        && (data.hasPermission("reservation.approve") || data.hasPermission("reservation.reject"))) {
      page.addView(sectionLabel("Karar"));
      LinearLayout decisions = UiKit.row(this);
      if (data.hasPermission("reservation.approve")) {
        UiKit.addAction(decisions, UiKit.button(this, "Onayla", UiKit.PRIMARY, view -> {
          sendReservationAction(reservation, "reservation_approve", "Rezervasyon onayı gönderildi.");
          dialog.dismiss();
        }), this);
      }
      if (data.hasPermission("reservation.reject")) {
        UiKit.addAction(decisions, UiKit.dangerButton(this, "Reddet", view -> confirm(
            "Rezervasyonu reddet",
            reservation.customerName + " rezervasyonu reddedilsin mi?",
            () -> {
              sendReservationAction(reservation, "reservation_reject", "Rezervasyon reddi gönderildi.");
              dialog.dismiss();
            }
        )), this);
      }
      page.addView(decisions);
    } else if ("approved".equals(reservation.status) && data.hasPermission("reservation.cancel")) {
      page.addView(sectionLabel("Rezervasyon işlemi"));
      Button cancel = UiKit.dangerButton(this, "Rezervasyonu İptal Et", view -> confirm(
          "Rezervasyonu iptal et",
          "Bu rezervasyon iptal edilsin mi?",
          () -> {
            sendReservationAction(reservation, "reservation_cancel", "Rezervasyon iptali gönderildi.");
            dialog.dismiss();
          }
      ));
      cancel.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46)));
      page.addView(cancel);
    }

    ScrollView scroll = UiKit.scroll(this, page);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);
    dialog.setContentView(shell);
    dialog.show();
    configureFullDialog(dialog);
  }

  private void showMessageDetail(OperationData.MessageRecord message) {
    Dialog dialog = new Dialog(this);
    LinearLayout shell = UiKit.column(this);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(this, 16), UiKit.dp(this, 14), UiKit.dp(this, 16), UiKit.dp(this, 20));

    LinearLayout header = UiKit.row(this);
    LinearLayout heading = UiKit.column(this);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(this, "MESAJ DETAYI"));
    heading.addView(UiKit.title(this, message.customerName));
    header.addView(heading);
    addDetailHeaderActions(header, dialog, () -> showMessageDetail(message));
    shell.addView(header);

    LinearLayout page = UiKit.column(this);
    LinearLayout messageCard = UiKit.card(this);
    messageCard.addView(statusBadge(message.message.isEmpty() ? "Cevap bekleniyor" : "Hazır", message.message.isEmpty() ? UiKit.WARNING : UiKit.PRIMARY));
    TextView body = UiKit.text(this,
        message.message.isEmpty() ? "Bu talep için henüz hazır mesaj bulunmuyor." : message.message,
        14,
        message.message.isEmpty() ? UiKit.MUTED : UiKit.TEXT,
        Typeface.NORMAL
    );
    LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(-1, -2);
    bodyParams.setMargins(0, UiKit.dp(this, 10), 0, 0);
    body.setLayoutParams(bodyParams);
    messageCard.addView(body);
    page.addView(messageCard);

    if (AndroidUiRules.canUseWhatsApp(data)
        && data.hasPermission("customer.respond")
        && !message.message.isEmpty()) {
      LinearLayout responseActions = UiKit.row(this);
      UiKit.addAction(responseActions, UiKit.outlineButton(this, "Kopyala", view -> copyText(message.message)), this);
      UiKit.addAction(responseActions, UiKit.button(this, "WhatsApp'ta Aç", UiKit.PRIMARY,
          view -> openWhatsApp(message.customerPhone, message.message)), this);
      page.addView(responseActions);
    }
    if (!message.customerPhone.isEmpty() || (!message.requestId.isEmpty() && data.hasPermission("customer.mark_answered"))) {
      LinearLayout followUp = UiKit.row(this);
      LinearLayout.LayoutParams followUpParams = new LinearLayout.LayoutParams(-1, -2);
      followUpParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      followUp.setLayoutParams(followUpParams);
      if (!message.customerPhone.isEmpty()) {
        UiKit.addAction(followUp, UiKit.outlineButton(this, "Ara", view -> openDialer(message.customerPhone)), this);
      }
      if (!message.requestId.isEmpty() && data.hasPermission("customer.mark_answered")) {
        OperationData.RequestRecord request = data.requestById(message.requestId);
        String expectedUpdatedAt = request == null ? "" : request.updatedAt;
        UiKit.addAction(followUp, UiKit.button(this, "Cevaplandı", UiKit.ACCENT, view -> {
          sendAction("customer_request_mark_answered", payload(
              "request_id", message.requestId,
              "message_id", message.id,
              "expected_updated_at", expectedUpdatedAt
          ), "Talep cevaplandı olarak gönderildi.");
          dialog.dismiss();
        }), this);
      }
      page.addView(followUp);
    }

    if (AndroidUiRules.canDelete(data, "message.delete")) {
      page.addView(sectionLabel("Yönetici işlemi"));
      Button delete = UiKit.dangerButton(this, "Mesajı Sil", view -> confirm(
          "Hazır mesajı sil",
          "Bu hazır mesaj silinsin mi? Talep kaydı korunur.",
          () -> {
            sendAction(
                "message_delete",
                payload(
                    "message_id", message.id,
                    "request_id", message.requestId,
                    "expected_updated_at", message.updatedAt
                ),
                "Hazır mesaj silinmek üzere gönderildi."
            );
            dialog.dismiss();
          }
      ));
      delete.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46)));
      page.addView(delete);
    }

    ScrollView scroll = UiKit.scroll(this, page);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);
    dialog.setContentView(shell);
    dialog.show();
    configureFullDialog(dialog);
  }

  private View detailLine(String label, String value) {
    LinearLayout row = UiKit.row(this);
    TextView labelView = UiKit.text(this, label, 12, UiKit.MUTED, Typeface.BOLD);
    labelView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 0.38f));
    row.addView(labelView);
    TextView valueView = UiKit.text(this, value, 13, UiKit.TEXT, Typeface.BOLD);
    valueView.setGravity(Gravity.END);
    valueView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 0.62f));
    row.addView(valueView);
    return row;
  }

  private void showPreparedReply(String customerName, String message) {
    OperationData.MessageRecord prepared = new OperationData.MessageRecord();
    prepared.customerName = customerName;
    prepared.message = message;
    showMessageDetail(prepared);
  }

  private void showTableOrder(OperationData.TableRecord table) {
    if (!data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS)
        || !data.hasPermission("table_order.view")) {
      showError("Bu işletmede masa siparişi kullanılamıyor.");
      return;
    }

    new TableOrderDialog(
        this,
        data,
        table,
        new TableOrderDialog.Listener() {
          @Override
          public void addHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen) {
            addDetailHeaderActions(header, dialog, reopen);
          }

          @Override
          public void configureFullDialog(Dialog dialog) {
            MainActivity.this.configureFullDialog(dialog);
          }

          @Override
          public void onOpenOrder(OperationData.TableRecord selectedTable) {
            sendAction(
                "table_order_open",
                payload(
                    "table_id",
                    selectedTable.id,
                    "expected_table_updated_at",
                    selectedTable.updatedAt
                ),
                "Masa siparişi açılmak üzere gönderildi."
            );
          }

          @Override
          public void onAddItem(
              OperationData.TableRecord selectedTable,
              OperationData.TableOrder order,
              OperationData.MenuItem item
          ) {
            addOrderItem(selectedTable, order, item);
          }

          @Override
          public void onUpdateItemQuantity(OperationData.TableOrderItem item, int quantity) {
            sendAction(
                "table_order_update_item_quantity",
                payload(
                    "item_id",
                    item.id,
                    "quantity",
                    quantity,
                    "expected_item_updated_at",
                    item.updatedAt
                ),
                quantity < item.quantity
                    ? "Ürün adedi azaltılmak üzere gönderildi."
                    : "Ürün adedi artırılmak üzere gönderildi."
            );
          }

          @Override
          public void onRemoveItem(OperationData.TableOrderItem item) {
            sendAction(
                "table_order_remove_item",
                payload("item_id", item.id, "expected_item_updated_at", item.updatedAt),
                "Ürün silinmek üzere gönderildi."
            );
          }

          @Override
          public void onSetOrderStatus(OperationData.TableOrder order, String status) {
            sendOrderStatus(order, status);
          }

          @Override
          public void onCloseOrder(OperationData.TableOrder order, String status) {
            closeOrder(order, status);
          }

          @Override
          public void onConfirm(String title, String message, Runnable action) {
            confirm(title, message, action);
          }
        }
    ).show();
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

  private ReservationEditorDialog.Kind reservationEditorKind(OperationData.ReservationRecord reservation) {
    if (reservation == null) {
      return null;
    }
    if ("room".equals(reservation.type)) {
      return ReservationEditorDialog.Kind.ROOM;
    }
    if (AndroidUiRules.isRestaurantOnlyReservation(reservation)) {
      return ReservationEditorDialog.Kind.TABLE;
    }
    return null;
  }

  private void showReservationEditor(
      ReservationEditorDialog.Kind kind,
      OperationData.ReservationRecord reservation
  ) {
    boolean editing = reservation != null;
    String requiredPermission = editing ? "reservation.update" : "reservation.create";
    boolean capabilityAllowed = kind == ReservationEditorDialog.Kind.ROOM
        ? data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS)
        : data.hasBusinessCapability(AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS);
    if (!capabilityAllowed || !data.hasPermission(requiredPermission)) {
      showError(editing ? "Bu cihazın rezervasyon düzenleme yetkisi yok." : "Bu cihazın rezervasyon oluşturma yetkisi yok.");
      return;
    }
    if (!editing && data.customers.isEmpty()) {
      showError("Rezervasyon eklemeden önce Müşteri ekranından müşteri kaydı oluşturun.");
      return;
    }
    ReservationEditorDialog.show(this, data, kind, reservation, actionPayload -> {
      String actionType;
      if (kind == ReservationEditorDialog.Kind.ROOM) {
        actionType = editing ? "reservation_room_update" : "reservation_room_create";
      } else {
        actionType = editing ? "reservation_table_update" : "reservation_table_create";
      }
      sendAction(
          actionType,
          actionPayload,
          editing ? "Rezervasyon güncellenmek üzere gönderildi." : "Rezervasyon oluşturulmak üzere gönderildi."
      );
    });
  }

  private void showDailyTaskEditor(DailyTaskEditorDialog.Kind kind, OperationData.TaskRecord task) {
    boolean editing = task != null;
    String requiredPermission = editing ? "daily_task.update" : "daily_task.create";
    boolean capabilityAllowed = editing
        ? AndroidUiRules.taskAllowed(data, task)
        : (kind == DailyTaskEditorDialog.Kind.RESTAURANT
            ? data.hasBusinessCapability(AndroidUiRules.CAPABILITY_TABLES)
            : data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ROOMS));
    if (!capabilityAllowed || !data.hasPermission(requiredPermission)) {
      showError(editing ? "Bu cihazın günlük iş düzenleme yetkisi yok." : "Bu cihazın günlük iş ekleme yetkisi yok.");
      return;
    }
    if (editing && !AndroidUiRules.isManualTask(task)) {
      showError("Otomatik oluşturulan günlük işler yalnız tamamla veya yeniden aç işlemiyle yönetilebilir.");
      return;
    }
    boolean canDelete = editing && AndroidUiRules.canDelete(data, "daily_task.delete");
    DailyTaskEditorDialog.show(this, kind, task, canDelete, new DailyTaskEditorDialog.Listener() {
      @Override
      public void onSave(JSONObject actionPayload) {
        sendAction(
            editing ? "daily_task_update" : "daily_task_create",
            actionPayload,
            editing ? "Günlük iş güncellenmek üzere gönderildi." : "Günlük iş eklenmek üzere gönderildi."
        );
      }

      @Override
      public void onDelete() {
        if (!editing) {
          return;
        }
        sendAction(
            "daily_task_delete",
            payload("task_id", task.id, "task_type", task.type, "expected_updated_at", task.updatedAt),
            "Günlük iş silinmek üzere gönderildi."
        );
      }
    });
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

    String baseUrl = readSettingsInputs && connectionSettingsPanel != null
        ? connectionSettingsPanel.webModuleValue()
        : ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = readSettingsInputs && connectionSettingsPanel != null
        ? connectionSettingsPanel.syncSecretValue()
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
    updateErrorBanner();
  }

  private void clearError() {
    currentError = "";
    updateErrorBanner();
  }

  private void updateErrorBanner() {
    if (errorBanner == null) {
      return;
    }
    errorBanner.setText(currentError);
    errorBanner.setTextColor(UiKit.DANGER);
    errorBanner.setBackground(UiKit.rounded(
        this,
        UiKit.withAlpha(UiKit.DANGER, 26),
        UiKit.withAlpha(UiKit.DANGER, 100),
        11
    ));
    errorBanner.setVisibility(currentError.isEmpty() ? View.GONE : View.VISIBLE);
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

  private OperationData.ActionRecord latestFailedAction() {
    for (OperationData.ActionRecord action : data.actions) {
      if ("failed".equals(action.status)) {
        return action;
      }
    }
    return null;
  }




  private void confirm(String title, String message, Runnable action) {
    AlertDialog dialog = alertDialogBuilder()
        .setTitle(title)
        .setMessage(message)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton("Devam Et", (value, which) -> action.run())
        .create();
    dialog.setOnShowListener(value -> {
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(UiKit.PRIMARY);
      dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(UiKit.MUTED);
    });
    dialog.show();
  }

  private AlertDialog.Builder alertDialogBuilder() {
    int dialogTheme = themeMode == AppTheme.Mode.DAY
        ? android.R.style.Theme_Material_Light_Dialog_Alert
        : android.R.style.Theme_Material_Dialog_Alert;
    return new AlertDialog.Builder(this, dialogTheme);
  }

  private void configureFullDialog(Dialog dialog) {
    Window window = dialog.getWindow();
    if (window != null) {
      window.setBackgroundDrawable(new ColorDrawable(UiKit.BG));
      window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }
  }

  private void configureBottomDialog(Dialog dialog) {
    Window window = dialog.getWindow();
    if (window != null) {
      window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
      window.setGravity(Gravity.BOTTOM);
      window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }
  }

  private void openDialer(String phone) {
    if (phone == null || phone.trim().isEmpty()) {
      Toast.makeText(this, "Telefon numarası bulunamadı.", Toast.LENGTH_SHORT).show();
      return;
    }
    openIntent(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(phone.trim()))), "Arama uygulaması açılamadı.");
  }

  private void openWhatsApp(String phone, String message) {
    if (!AndroidUiRules.canUseWhatsApp(data) || !data.hasPermission("customer.respond")) {
      Toast.makeText(this, "WhatsApp bu işletmede etkin değil.", Toast.LENGTH_SHORT).show();
      return;
    }
    String normalizedPhone = AndroidPhoneRules.normalizeWhatsAppPhone(phone);
    if (normalizedPhone.isEmpty()) {
      Toast.makeText(this, "WhatsApp için telefon numarası bulunamadı.", Toast.LENGTH_SHORT).show();
      return;
    }
    try {
      String url = "https://wa.me/" + normalizedPhone;
      if (message != null && !message.trim().isEmpty()) {
        url += "?text=" + URLEncoder.encode(message.trim(), "UTF-8");
      }
      openIntent(new Intent(Intent.ACTION_VIEW, Uri.parse(url)), "WhatsApp bağlantısı açılamadı.");
    } catch (Exception error) {
      Toast.makeText(this, "WhatsApp mesajı hazırlanamadı.", Toast.LENGTH_SHORT).show();
    }
  }

  private void openIntent(Intent intent, String fallback) {
    try {
      startActivity(intent);
    } catch (ActivityNotFoundException error) {
      Toast.makeText(this, fallback, Toast.LENGTH_SHORT).show();
    }
  }

  private void copyText(String value) {
    ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
    if (clipboard == null) {
      Toast.makeText(this, "Kopyalama kullanılamıyor.", Toast.LENGTH_SHORT).show();
      return;
    }
    clipboard.setPrimaryClip(ClipData.newPlainText("Yardımcı Asistan hazır mesaj", value));
    Toast.makeText(this, "Hazır mesaj kopyalandı.", Toast.LENGTH_SHORT).show();
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

  private int countStockByStatus(String status) {
    int count = 0;
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      if (status.equals(item.stockStatus)) {
        count += 1;
      }
    }
    return count;
  }

  private int countPensionReservations(String status) {
    int count = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (status.equals(reservation.status)
          && isPensionReservation(reservation)
          && AndroidUiRules.reservationAllowed(data, reservation)) {
        count += 1;
      }
    }
    return count;
  }

  private int countRestaurantOnlyReservations(String status) {
    int count = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (status.equals(reservation.status)
          && AndroidUiRules.isRestaurantReservation(data, reservation)
          && !AndroidUiRules.isPensionReservation(data, reservation)
          && AndroidUiRules.reservationAllowed(data, reservation)) {
        count += 1;
      }
    }
    return count;
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

  private boolean hasPaymentOrderForTable(String tableId) {
    for (OperationData.TableOrder order : data.tableOrders) {
      if (tableId.equals(order.tableId) && "payment".equals(order.status) && order.isActive()) {
        return true;
      }
    }
    return false;
  }


  private int countWaitingRequests() {
    int count = 0;
    for (OperationData.RequestRecord request : data.requests) {
      if (request.waitingForResponse()) {
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







  private boolean canManageCustomerRoomStays() {
    return data.isAdmin()
        && data.hasPermission("customer.manage")
        && data.hasPermission("room.assign_customer");
  }












  private String textValue(EditText input) {
    return input == null ? "" : input.getText().toString().trim();
  }

  private String selectedChoiceValue(Spinner spinner) {
    Object selected = spinner == null ? null : spinner.getSelectedItem();
    return selected instanceof ChoiceItem ? ((ChoiceItem) selected).value : "";
  }



  private String namesForRooms(List<String> roomIds) {
    ArrayList<String> names = new ArrayList<>();
    for (String roomId : roomIds) {
      for (OperationData.RoomRecord room : data.rooms) {
        if (roomId.equals(room.id)) {
          names.add(room.name);
          break;
        }
      }
    }
    return names.isEmpty() ? "Atama bekliyor" : joinNonEmpty(", ", names.toArray(new String[0]));
  }

  private String namesForTables(List<String> tableIds) {
    ArrayList<String> names = new ArrayList<>();
    for (String tableId : tableIds) {
      for (OperationData.TableRecord table : data.tables) {
        if (tableId.equals(table.id)) {
          names.add(table.name);
          break;
        }
      }
    }
    return names.isEmpty() ? "Atama bekliyor" : joinNonEmpty(", ", names.toArray(new String[0]));
  }

  private OperationData.TableRecord tableById(String tableId) {
    for (OperationData.TableRecord table : data.tables) {
      if (tableId.equals(table.id)) {
        return table;
      }
    }
    return null;
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

  private interface StatusSelection {
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



  private static final class StockImageReviewLine {
    final String rawText;
    String menuItemId;
    String quantityText;
    final String confidence;
    final String reason;
    boolean ignored;

    StockImageReviewLine(
        String rawText,
        String menuItemId,
        String quantityText,
        String confidence,
        String reason
    ) {
      this.rawText = rawText;
      this.menuItemId = menuItemId;
      this.quantityText = quantityText;
      this.confidence = confidence;
      this.reason = reason;
    }

    int quantity() {
      try {
        int value = Integer.parseInt(quantityText.trim());
        return value > 0 && value <= 100000 ? value : 0;
      } catch (Exception ignored) {
        return 0;
      }
    }
  }
}

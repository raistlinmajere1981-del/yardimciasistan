package com.yardimciasistan.android;

import android.Manifest;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.net.URLEncoder;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends ComponentActivity {
  private static final String TAB_TODAY = AndroidUiRules.TAB_TODAY;
  private static final String TAB_CUSTOMERS = AndroidUiRules.TAB_CUSTOMERS;
  private static final String TAB_PENSION = AndroidUiRules.TAB_PENSION;
  private static final String TAB_RESTAURANT = AndroidUiRules.TAB_RESTAURANT;
  private static final String TAB_MESSAGES = AndroidUiRules.TAB_MESSAGES;
  private static final long FOREGROUND_SYNC_INTERVAL_MS = 15_000L;
  private static final int BOTTOM_NAV_HEIGHT_DP = 70;
  private static final int MAIN_CONTENT_BOTTOM_PADDING_DP = BOTTOM_NAV_HEIGHT_DP + 24;
  private static final int HEADER_ACTION_SIZE_DP = 44;
  private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 0x5941;
  private static final String KEY_NOTIFICATION_PERMISSION_REQUESTED = "notification_permission_requested_v1";

  private final HostingSyncClient syncClient = new HostingSyncClient();
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private SharedPreferences preferences;
  private AppTheme.Mode themeMode = AppTheme.Mode.NIGHT;
  private ActionOutbox actionOutbox;
  private OperationCache operationCache;
  private LocalNotificationCenter localNotifications;
  private OperationData data = new OperationData();
  private DeviceIdentity identity;
  private String activeTab = TAB_TODAY;
  private String customerFilter = AndroidUiRules.CUSTOMER_NEW;
  private String pensionMode = AndroidUiRules.PENSION_RESERVATIONS;
  private String restaurantMode = AndroidUiRules.RESTAURANT_TABLES;
  private String messageMode = AndroidUiRules.MESSAGES_PREPARED;
  private boolean settingsOpen;
  private boolean loading;
  private boolean foregroundActive;
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
  private EditText webModuleInput;
  private EditText syncSecretInput;
  private final Map<String, Integer> screenScrollPositions = new HashMap<>();
  private String renderedScreenKey = "";
  private String currentError = "";
  private ActivityResultLauncher<Uri> stockCameraLauncher;
  private ActivityResultLauncher<String[]> stockGalleryLauncher;
  private Uri pendingStockCameraUri;
  private File pendingStockCameraFile;
  private final Handler foregroundSyncHandler = new Handler(Looper.getMainLooper());
  private final Runnable foregroundSyncRunnable = new Runnable() {
    @Override
    public void run() {
      if (!foregroundActive) {
        return;
      }
      if (hasConnectionSettings() && !loading) {
        syncFromHosting(false);
      }
      foregroundSyncHandler.postDelayed(this, FOREGROUND_SYNC_INTERVAL_MS);
    }
  };

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    preferences = getSharedPreferences(ConnectionSettings.PREFS_NAME, MODE_PRIVATE);
    resetDebugAppStateIfRequested();
    themeMode = AppTheme.load(preferences);
    setTheme(themeStyleResource(themeMode));
    super.onCreate(savedInstanceState);
    registerStockImageLaunchers();
    UiKit.applyTheme(AppTheme.tokens(themeMode));
    applyWindowTheme();
    ConnectionSettings.setDebugConnectionOverrideActive(preferences, isDebugConnectionOverrideRequested());
    ConnectionSettings.ensureDefaults(preferences);
    identity = DeviceIdentity.loadOrCreate(this, preferences);
    actionOutbox = new ActionOutbox(preferences);
    operationCache = new OperationCache(preferences, identity.deviceId);
    localNotifications = new LocalNotificationCenter(this, preferences);
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
    if (hasConnectionSettings()) {
      syncFromHosting(false);
    } else {
      showError("Canlı veriyi görmek için Ayarlar'dan bağlantıyı tamamlayın.");
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    foregroundActive = true;
    foregroundSyncHandler.removeCallbacks(foregroundSyncRunnable);
    foregroundSyncHandler.postDelayed(foregroundSyncRunnable, FOREGROUND_SYNC_INTERVAL_MS);
  }

  @Override
  protected void onPause() {
    foregroundActive = false;
    foregroundSyncHandler.removeCallbacks(foregroundSyncRunnable);
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    foregroundSyncHandler.removeCallbacks(foregroundSyncRunnable);
    executor.shutdownNow();
    deletePendingStockCameraFile();
    super.onDestroy();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    applyNotificationIntent(intent);
    render();
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE && localNotifications != null) {
      localNotifications.refreshCurrentSnapshot(data);
    }
  }

  private void registerStockImageLaunchers() {
    stockCameraLauncher = registerForActivityResult(new ActivityResultContracts.TakePicture() {
      @Override
      public Intent createIntent(Context context, Uri input) {
        Intent intent = super.createIntent(context, input);
        PackageManager packageManager = context.getPackageManager();
        if (intent.resolveActivity(packageManager) != null) {
          return intent;
        }

        // Android 11+ may restrict an implicit capture intent to preinstalled
        // camera apps. Some privacy-focused ROMs ship without one even though
        // the user has installed a compatible camera. Keep TakePicture's URI
        // grants, but explicitly select the first visible, enabled handler.
        for (ApplicationInfo application : packageManager.getInstalledApplications(PackageManager.MATCH_ALL)) {
          Intent packageIntent = new Intent(intent).setPackage(application.packageName);
          List<ResolveInfo> handlers = packageManager.queryIntentActivities(
              packageIntent,
              PackageManager.MATCH_DEFAULT_ONLY
          );
          if (handlers.isEmpty()) {
            continue;
          }
          ResolveInfo handler = handlers.get(0);
          if (handler.activityInfo == null || !handler.activityInfo.enabled || !handler.activityInfo.exported) {
            continue;
          }
          intent.setComponent(new ComponentName(handler.activityInfo.packageName, handler.activityInfo.name));
          return intent;
        }
        return intent;
      }
    }, success -> {
      Uri resultUri = pendingStockCameraUri;
      if (Boolean.TRUE.equals(success) && resultUri != null) {
        showStockImagePreviewDialog(resultUri);
      } else {
        deletePendingStockCameraFile();
        Toast.makeText(this, "Fotoğraf çekimi tamamlanmadı.", Toast.LENGTH_SHORT).show();
      }
      pendingStockCameraUri = null;
    });
    stockGalleryLauncher = registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
      if (uri == null) {
        return;
      }
      try {
        getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
      } catch (SecurityException ignored) {
        // The picker grant remains valid for the immediate analysis flow.
      }
      showStockImagePreviewDialog(uri);
    });
  }

  private void launchStockCamera() {
    if (!data.hasPermission("menu.stock_update")) {
      showError("Bu cihazın stok güncelleme yetkisi yok.");
      return;
    }
    try {
      deletePendingStockCameraFile();
      File directory = new File(getCacheDir(), "stock-images");
      if ((!directory.isDirectory() && !directory.mkdirs()) || !directory.isDirectory()) {
        throw new IllegalStateException("cache_missing");
      }
      pendingStockCameraFile = File.createTempFile("camera-", ".jpg", directory);
      pendingStockCameraUri = FileProvider.getUriForFile(
          this,
          getPackageName() + ".fileprovider",
          pendingStockCameraFile
      );
      stockCameraLauncher.launch(pendingStockCameraUri);
    } catch (ActivityNotFoundException error) {
      deletePendingStockCameraFile();
      showError("Sistem kamera uygulaması bulunamadı. Galeriden görsel seçebilirsiniz.");
    } catch (Exception error) {
      deletePendingStockCameraFile();
      showError("Kamera için güvenli geçici dosya hazırlanamadı.");
    }
  }

  private void launchStockGallery() {
    if (!data.hasPermission("menu.stock_update")) {
      showError("Bu cihazın stok güncelleme yetkisi yok.");
      return;
    }
    try {
      stockGalleryLauncher.launch(new String[] {"image/jpeg", "image/png", "image/webp"});
    } catch (ActivityNotFoundException error) {
      showError("Sistem fotoğraf seçicisi açılamadı.");
    }
  }

  private void deletePendingStockCameraFile() {
    if (pendingStockCameraFile != null && pendingStockCameraFile.isFile()) {
      pendingStockCameraFile.delete();
    }
    pendingStockCameraFile = null;
  }

  private void showStockImagePreviewDialog(Uri sourceUri) {
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
      executor.execute(() -> {
        StockImageFile.PreparedImage upload = null;
        try {
          upload = StockImageFile.rotatedCopy(this, baseImage, rotation[0]);
          HostingSyncClient.StockImageAnalysisResult result = syncClient.analyzeStockImage(
              baseUrl,
              syncSecret,
              identity,
              importId,
              upload,
              candidates
          );
          boolean duplicate = data.appliedStockImageHashes.contains(result.imageHash);
          runOnUiThread(() -> {
            if (!dialog.isShowing()) {
              return;
            }
            dialog.dismiss();
            showStockImageReviewDialog(result, duplicate);
          });
        } catch (HostingSyncClient.SyncException | StockImageFile.StockImageException error) {
          runOnUiThread(() -> {
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
            status.setText(error.getMessage());
            status.setTextColor(UiKit.DANGER);
          });
        } finally {
          if (upload != null && upload != baseImage) {
            upload.release();
          }
        }
      });
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

    executor.execute(() -> {
      try {
        StockImageFile.PreparedImage ready = StockImageFile.prepare(this, sourceUri);
        deletePendingStockCameraFile();
        runOnUiThread(() -> {
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
        });
      } catch (StockImageFile.StockImageException error) {
        deletePendingStockCameraFile();
        runOnUiThread(() -> {
          if (!dialog.isShowing()) {
            return;
          }
          status.setText(error.getMessage());
          status.setTextColor(UiKit.DANGER);
          retake.setEnabled(true);
          reselect.setEnabled(true);
        });
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

  @Override
  public void onBackPressed() {
    if (settingsOpen) {
      settingsOpen = false;
      render();
      return;
    }
    super.onBackPressed();
  }

  private void applyConnectionExtras() {
    String extraUrl = getIntent().getStringExtra("ya_web_module_url");
    String extraSecret = getIntent().getStringExtra("ya_sync_secret");
    boolean debugOverride = isDebugConnectionOverrideRequested();
    if (ConnectionSettings.isEmbeddedConnectionLocked() && !debugOverride) {
      return;
    }
    if (data.permissionsResolved && !data.hasPermission("settings.edit") && !debugOverride) {
      return;
    }
    if (extraUrl != null && extraSecret != null
        && !extraUrl.trim().isEmpty() && !extraSecret.trim().isEmpty()) {
      try {
        for (ActionOutbox.PendingAction pending : actionOutbox.load()) {
          if (!pending.matchesTarget(extraUrl.trim(), extraSecret.trim())) {
            connectionState = "Önceki bağlantıya ait bekleyen işlem korunuyor";
            return;
          }
        }
      } catch (ActionOutbox.OutboxException error) {
        connectionState = error.getMessage();
        return;
      }
      preferences.edit()
          .putString(ConnectionSettings.KEY_WEB_MODULE_URL, extraUrl.trim())
          .putString(ConnectionSettings.KEY_SYNC_SECRET, extraSecret.trim())
          .apply();
    }
  }

  private boolean isDebugConnectionOverrideRequested() {
    return isDebuggable()
        && getIntent().getBooleanExtra("ya_allow_debug_connection_override", false);
  }

  private void resetDebugAppStateIfRequested() {
    if (isDebuggable() && getIntent().getBooleanExtra("ya_reset_debug_app_state", false)) {
      DeviceIdentity.clearAppStateKeepingIdentity(preferences);
    }
  }

  private boolean isDebuggable() {
    return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
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
    root = UiKit.column(this);
    root.setBackgroundColor(UiKit.BG);

    LinearLayout header = UiKit.row(this);
    header.setPadding(UiKit.dp(this, 14), UiKit.dp(this, 8), UiKit.dp(this, 10), UiKit.dp(this, 8));
    header.setBackgroundColor(UiKit.BG);
    header.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 72)));

    LinearLayout titleGroup = UiKit.column(this);
    titleGroup.setGravity(Gravity.CENTER_VERTICAL);
    headerTitle = UiKit.text(this, "Bugün", 20, UiKit.TEXT, Typeface.BOLD);
    titleGroup.addView(headerTitle);
    headerMeta = UiKit.text(this, "Personel · Henüz sync yok", 11, UiKit.MUTED, Typeface.NORMAL);
    titleGroup.addView(headerMeta);
    titleGroup.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    header.addView(titleGroup);

    LinearLayout headerActions = UiKit.row(this);
    refreshButton = UiKit.iconButton(this, "↻", "Yenile", false, view -> syncFromHosting(false));
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
    content.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    root.addView(content);

    bottomNavigation = UiKit.row(this);
    bottomNavigation.setPadding(UiKit.dp(this, 5), UiKit.dp(this, 6), UiKit.dp(this, 5), UiKit.dp(this, 7));
    bottomNavigation.setBackground(UiKit.rounded(this, UiKit.BOTTOM_NAV_BACKGROUND, UiKit.BORDER, 0));
    bottomNavigation.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, BOTTOM_NAV_HEIGHT_DP)));
    root.addView(bottomNavigation);
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
    bottomNavigation.setVisibility(settingsOpen || inactiveDevice ? View.GONE : View.VISIBLE);
    renderBottomNavigation();
    content.removeAllViews();
    View screen;
    if (inactiveDevice) {
      headerTitle.setText("Cihaz Pasif");
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
    } else if (TAB_MESSAGES.equals(activeTab)) {
      headerTitle.setText("Mesajlar");
      screen = messagesScreen();
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
    if (TAB_MESSAGES.equals(activeTab)) {
      return TAB_MESSAGES + ":" + messageMode;
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
    if (canOpenTab(TAB_MESSAGES)) {
      addNavButton("Mesajlar", TAB_MESSAGES);
    }
  }

  private boolean canOpenTab(String tab) {
    return AndroidUiRules.canOpenTab(data, tab);
  }

  private View inactiveDeviceScreen() {
    LinearLayout page = UiKit.column(this);
    page.addView(screenIntro("ERİŞİM DURUMU", "Bu cihaz pasifleştirildi", "Cihaz masaüstünde pasifleştirilmiş. Yeniden etkinleştirmek için masaüstü yöneticinize başvurun.", false));
    LinearLayout card = UiKit.card(this);
    card.addView(settingLine("Telefon kimliği", compactDeviceId(), UiKit.MUTED));
    card.addView(UiKit.divider(this));
    card.addView(settingLine("Rol", data.deviceRoleLabel(), UiKit.WARNING));
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
    button.setBackground(UiKit.rounded(this, selected ? UiKit.SURFACE_ALT : Color.TRANSPARENT, Color.TRANSPARENT, 11));
    button.setOnClickListener(view -> {
      activeTab = tab;
      settingsOpen = false;
      render();
    });
    button.setLayoutParams(new LinearLayout.LayoutParams(0, -1, 1f));
    bottomNavigation.addView(button);
  }

  private View todayScreen() {
    LinearLayout page = UiKit.column(this);
    boolean canViewCustomers = data.hasPermission("customer.view");
    boolean canViewReservations = data.hasPermission("reservation.view");
    boolean canViewRooms = data.hasPermission("room.view");
    boolean canViewTasks = data.hasPermission("daily_task.view");
    boolean canViewTables = data.hasPermission("table.view");
    boolean canViewOrders = data.hasPermission("table_order.view");
    boolean canViewStock = data.hasPermission("menu.stock_view");

    ArrayList<CounterValue> counters = new ArrayList<>();
    if (canViewCustomers) {
      counters.add(new CounterValue("Yeni", data.newRequests, UiKit.INFO, "customers:new"));
      counters.add(new CounterValue("Cevap", data.waitingResponses > 0 ? data.waitingResponses : countWaitingRequests(), UiKit.DANGER, "customers:waiting"));
    }
    if (canViewReservations) {
      counters.add(new CounterValue("Rez.", data.pendingReservations, UiKit.WARNING, "pension:reservations"));
    }
    if (canViewTasks) {
      counters.add(new CounterValue("İş", data.todayTasks > 0 ? data.todayTasks : data.pendingDailyTasks, UiKit.ACCENT, "pension:tasks"));
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
    if (canViewCustomers) {
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
        if (!"pending".equals(reservation.status) || categoryShown >= 2 || shown >= 8) {
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
        if (!isPriorityTask(task) || categoryShown >= 2 || shown >= 8) {
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
    LinearLayout page = UiKit.column(this);
    if (!data.hasPermission("customer.view")) {
      page.addView(permissionDeniedCard());
      return mainScreenScroll(page);
    }
    page.addView(filterBar(new String[][] {
        {AndroidUiRules.CUSTOMER_NEW, "Yeni Talepler"},
        {AndroidUiRules.CUSTOMER_LIST, "Müşteriler"},
        {AndroidUiRules.CUSTOMER_WAITING, "Cevap Bekleyenler"}
    }, customerFilter, value -> {
      customerFilter = value;
      render();
    }));

    if (AndroidUiRules.CUSTOMER_LIST.equals(customerFilter)) {
      if (data.customers.isEmpty()) {
        page.addView(emptyCard("Müşteri listesi boş", "Masaüstü güncel snapshot yayınladığında müşteriler burada görünür."));
      }
      for (OperationData.CustomerRecord customer : data.customers) {
        page.addView(customerCard(customer));
      }
    } else {
      boolean waitingOnly = AndroidUiRules.CUSTOMER_WAITING.equals(customerFilter);
      int shown = 0;
      for (OperationData.RequestRecord request : data.requests) {
        boolean visible = waitingOnly ? request.waitingForResponse() : "new".equals(request.status);
        if (!visible) {
          continue;
        }
        page.addView(requestCard(request));
        shown += 1;
      }
      if (shown == 0) {
        page.addView(emptyCard(waitingOnly ? "Cevap bekleyen müşteri yok" : "Açık talep yok", "Yeni talepler geldiğinde bu liste güncellenir."));
      }
    }
    return mainScreenScroll(page);
  }

  private View pensionScreen() {
    LinearLayout page = UiKit.column(this);
    ArrayList<String[]> options = new ArrayList<>();
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_RESERVATIONS)) {
      options.add(new String[] {AndroidUiRules.PENSION_RESERVATIONS, "Rezervasyonlar"});
    }
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_ROOMS)) {
      options.add(new String[] {AndroidUiRules.PENSION_ROOMS, "Odalar"});
    }
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_TASKS)) {
      options.add(new String[] {AndroidUiRules.PENSION_TASKS, "İşler"});
    }
    if (options.isEmpty()) {
      page.addView(permissionDeniedCard());
      return mainScreenScroll(page);
    }
    page.addView(filterBar(options.toArray(new String[0][]), pensionMode, value -> {
      pensionMode = value;
      render();
    }));

    if (AndroidUiRules.PENSION_RESERVATIONS.equals(pensionMode)) {
      page.addView(statusStrip(new CounterValue[] {
          new CounterValue("Bekleyen", countPensionReservations("pending"), UiKit.WARNING, ""),
          new CounterValue("Giriş", countPensionDate(true), UiKit.INFO, ""),
          new CounterValue("Çıkış", countPensionDate(false), UiKit.ACCENT, "")
      }));
      int reservationCount = 0;
      for (OperationData.ReservationRecord reservation : data.reservations) {
        if (!isPensionReservation(reservation)) {
          continue;
        }
        page.addView(reservationCard(reservation, false));
        reservationCount += 1;
      }
      if (reservationCount == 0) {
        page.addView(emptyCard("Konaklama rezervasyonu yok", "Yeni rezervasyonlar burada listelenir."));
      }
    } else if (AndroidUiRules.PENSION_ROOMS.equals(pensionMode)) {
      page.addView(statusStrip(new CounterValue[] {
          new CounterValue("Boş", countRoomsByStatus("available"), UiKit.SUCCESS, ""),
          new CounterValue("Dolu", countRoomsByStatus("occupied"), UiKit.INFO, ""),
          new CounterValue("Temizlik", countRoomsByStatus("cleaning"), UiKit.WARNING, ""),
          new CounterValue("Bakım", countRoomsByStatus("maintenance"), UiKit.DANGER, "")
      }));
      if (data.rooms.isEmpty()) {
        page.addView(emptyCard("Oda verisi yayınlanmamış", "Masaüstünden Android özetini yayınlayın."));
      }
      for (OperationData.RoomRecord room : data.rooms) {
        page.addView(roomCard(room));
      }
    } else {
      page.addView(statusStrip(new CounterValue[] {
          new CounterValue("Bekleyen", countPensionTasks(false), UiKit.WARNING, ""),
          new CounterValue("Tamam", countPensionTasks(true), UiKit.SUCCESS, "")
      }));
      int taskCount = 0;
      for (OperationData.TaskRecord task : data.tasks) {
        page.addView(taskCard(task, false));
        taskCount += 1;
      }
      if (taskCount == 0) {
        page.addView(emptyCard("Günlük iş yok", "Günlük işler sakin görünüyor."));
      }
    }
    return mainScreenScroll(page);
  }

  private View restaurantScreen() {
    LinearLayout page = UiKit.column(this);
    ArrayList<String[]> options = new ArrayList<>();
    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_TABLES)) {
      options.add(new String[] {AndroidUiRules.RESTAURANT_TABLES, "Masalar"});
    }
    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_ORDERS)) {
      options.add(new String[] {AndroidUiRules.RESTAURANT_ORDERS, "Açık Adisyon"});
    }
    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_STOCK)) {
      options.add(new String[] {AndroidUiRules.RESTAURANT_STOCK, "Stok"});
    }
    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_MENU)) {
      options.add(new String[] {AndroidUiRules.RESTAURANT_MENU, "Menü"});
    }
    if (options.isEmpty()) {
      page.addView(permissionDeniedCard());
      return mainScreenScroll(page);
    }
    page.addView(filterBar(options.toArray(new String[0][]), restaurantMode, value -> {
      restaurantMode = value;
      render();
    }));

    if (AndroidUiRules.RESTAURANT_TABLES.equals(restaurantMode)) {
      page.addView(statusStrip(new CounterValue[] {
          new CounterValue("Boş", countTablesByStatus("available"), UiKit.SUCCESS, ""),
          new CounterValue("Dolu", countTablesByStatus("occupied"), UiKit.INFO, ""),
          new CounterValue("Hesap", countPaymentWaitingTables(), UiKit.WARNING, ""),
          new CounterValue("Açık", countActiveOrders(), UiKit.ACCENT, "restaurant:orders")
      }));
      if (data.tables.isEmpty()) {
        page.addView(emptyCard("Masa verisi yayınlanmamış", "Masaüstünden Android özetini yayınlayın."));
      }
      for (OperationData.TableRecord table : data.tables) {
        page.addView(tableCard(table));
      }
    } else if (AndroidUiRules.RESTAURANT_ORDERS.equals(restaurantMode)) {
      int activeOrders = countActiveOrders();
      page.addView(statusStrip(new CounterValue[] {
          new CounterValue("Açık", countOrdersByStatus("open"), UiKit.INFO, ""),
          new CounterValue("Hazırl.", countOrdersByStatus("preparing"), UiKit.ACCENT, ""),
          new CounterValue("Servis", countOrdersByStatus("served"), UiKit.SUCCESS, ""),
          new CounterValue("Hesap", countOrdersByStatus("payment"), UiKit.WARNING, "")
      }));
      if (activeOrders == 0) {
        page.addView(emptyCard("Aktif adisyon yok", "Sipariş açılan masalar burada ayrıca görünür."));
      }
      for (OperationData.TableOrder order : data.tableOrders) {
        if (order.isActive()) {
          page.addView(activeOrderCard(order));
        }
      }
    } else if (AndroidUiRules.RESTAURANT_STOCK.equals(restaurantMode)) {
      if (data.hasPermission("menu.stock_update")) {
        page.addView(stockImageImportCard());
      }
      page.addView(statusStrip(new CounterValue[] {
          new CounterValue("Stok yok", countStockByStatus("out_of_stock"), UiKit.DANGER, ""),
          new CounterValue("Az stok", countStockByStatus("low_stock"), UiKit.WARNING, ""),
          new CounterValue("Takip", data.trackedStockItems.size(), UiKit.INFO, "")
      }));
      page.addView(sectionLabel("Stokta yok"));
      int outOfStockCount = 0;
      for (OperationData.TrackedStockItem item : data.trackedStockItems) {
        if ("out_of_stock".equals(item.stockStatus)) {
          page.addView(stockCard(item));
          outOfStockCount += 1;
        }
      }
      if (outOfStockCount == 0) {
        page.addView(emptyCard("Stokta olmayan ürün yok", "Takip edilen ürünlerde tükenen stok bulunmuyor."));
      }

      page.addView(sectionLabel("Az stok"));
      int lowStockCount = 0;
      for (OperationData.TrackedStockItem item : data.trackedStockItems) {
        if ("low_stock".equals(item.stockStatus)) {
          page.addView(stockCard(item));
          lowStockCount += 1;
        }
      }
      if (lowStockCount == 0) {
        page.addView(emptyCard("Azalan stok yok", "Minimum stok seviyesine yaklaşan ürün bulunmuyor."));
      }

      page.addView(sectionLabel("Tüm takip edilen ürünler"));
      if (data.trackedStockItems.isEmpty()) {
        page.addView(emptyCard("Stok takibi yapılmıyor", "Masaüstünde stok adedi girilen ürünler burada görünür."));
      }
      for (OperationData.TrackedStockItem item : data.trackedStockItems) {
        page.addView(stockCard(item));
      }
    } else {
      page.addView(statusStrip(new CounterValue[] {
          new CounterValue("Kategori", data.adminCategories.size(), UiKit.INFO, ""),
          new CounterValue("Ürün", data.adminMenuItems.size(), UiKit.ACCENT, "")
      }));
      page.addView(emptyCard(
          "Yönetici silme alanı",
          "Kategori silmek o kategoriye bağlı tüm ürünleri de siler. Her işlem ayrıca onay ister."
      ));
      page.addView(sectionLabel("Kategoriler"));
      if (data.adminCategories.isEmpty()) {
        page.addView(emptyCard("Kategori yok", "Silinebilecek menü kategorisi bulunmuyor."));
      }
      for (OperationData.MenuCategory category : data.adminCategories) {
        page.addView(adminMenuCategoryCard(category));
      }
      page.addView(sectionLabel("Ürünler"));
      if (data.adminMenuItems.isEmpty()) {
        page.addView(emptyCard("Ürün yok", "Silinebilecek menü ürünü bulunmuyor."));
      }
      for (OperationData.MenuItem item : data.adminMenuItems) {
        page.addView(adminMenuItemCard(item));
      }
    }
    return mainScreenScroll(page);
  }

  private View messagesScreen() {
    LinearLayout page = UiKit.column(this);
    if (!data.hasPermission("customer.view")) {
      page.addView(permissionDeniedCard());
      return mainScreenScroll(page);
    }
    page.addView(filterBar(new String[][] {
        {AndroidUiRules.MESSAGES_PREPARED, "Hazır Mesajlar"},
        {AndroidUiRules.MESSAGES_WAITING, "Cevap Bekleyenler"}
    }, messageMode, value -> {
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

  private View settingsScreen() {
    LinearLayout page = UiKit.column(this);
    boolean canViewTechnicalSettings = !data.permissionsResolved || data.hasPermission("settings.view");
    page.addView(sectionLabel("Görünüm"));
    LinearLayout appearance = UiKit.card(this);
    appearance.addView(settingLine("Tema", themeMode.label, UiKit.PRIMARY));
    page.addView(appearance);
    page.addView(sectionLabel("Bildirim tercihleri"));
    LinearLayout notificationPreferences = UiKit.card(this);
    boolean hasNotificationPreference = false;
    if (!data.permissionsResolved || data.hasPermission("customer.view") || data.hasPermission("reservation.view")) {
      notificationPreferences.addView(notificationToggle(
          "Müşteri / Rezervasyon",
          "Yeni talepler ve onay bekleyen rezervasyonlar",
          NotificationEvent.CATEGORY_CUSTOMER
      ));
      hasNotificationPreference = true;
    }
    if (!data.permissionsResolved || data.hasPermission("table.view") || data.hasPermission("table_order.view")) {
      if (hasNotificationPreference) notificationPreferences.addView(UiKit.divider(this));
      notificationPreferences.addView(notificationToggle(
          "Restoran / Masa",
          "Masa siparişi ve hesap bekleyen adisyonlar",
          NotificationEvent.CATEGORY_RESTAURANT
      ));
      hasNotificationPreference = true;
    }
    if (!data.permissionsResolved || data.hasPermission("room.view") || data.hasPermission("daily_task.view")) {
      if (hasNotificationPreference) notificationPreferences.addView(UiKit.divider(this));
      notificationPreferences.addView(notificationToggle(
          "Oda / Günlük İş",
          "Temizlik, bakım ve bekleyen günlük işler",
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

    if (!canViewTechnicalSettings) {
      return UiKit.scroll(this, page);
    }

    webModuleInput = null;
    syncSecretInput = null;
    boolean embeddedConnectionLocked = ConnectionSettings.isEmbeddedConnectionLocked();
    boolean canEditSettings = !embeddedConnectionLocked
        && (!data.permissionsResolved || data.hasPermission("settings.edit"));
    if (canEditSettings) {
      LinearLayout connection = UiKit.card(this);
      connection.addView(UiKit.text(this, "Web modül adresi", 12, UiKit.MUTED, Typeface.BOLD));
      webModuleInput = UiKit.input(this, "https://firma.example/yardimci-asistan");
      webModuleInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
      webModuleInput.setText(ConnectionSettings.webModuleUrl(preferences));
      LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 50));
      inputParams.setMargins(0, UiKit.dp(this, 6), 0, UiKit.dp(this, 12));
      webModuleInput.setLayoutParams(inputParams);
      connection.addView(webModuleInput);

      connection.addView(UiKit.text(this, "Güvenlik anahtarı", 12, UiKit.MUTED, Typeface.BOLD));
      syncSecretInput = UiKit.input(this, "Uzun güvenlik anahtarı");
      syncSecretInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
      syncSecretInput.setText(ConnectionSettings.syncSecret(preferences));
      LinearLayout.LayoutParams secretParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 50));
      secretParams.setMargins(0, UiKit.dp(this, 6), 0, UiKit.dp(this, 12));
      syncSecretInput.setLayoutParams(secretParams);
      connection.addView(syncSecretInput);

      Button refresh = UiKit.button(this, loading ? "Bağlanıyor..." : "Canlı Veriyi Çek", UiKit.PRIMARY, view -> syncFromHosting(true));
      refresh.setEnabled(!loading);
      refresh.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 48)));
      connection.addView(refresh);
      page.addView(connection);
    } else {
      LinearLayout readOnly = UiKit.card(this);
      readOnly.addView(UiKit.text(this, embeddedConnectionLocked ? "Bağlantı bilgileri APK içinde hazır" : "Bağlantı ayarları salt okunur", 14, UiKit.TEXT, Typeface.BOLD));
      readOnly.addView(UiKit.text(this, embeddedConnectionLocked
          ? "Tasarım süresince web bağlantısı bu APK'ya sabitlendi ve uygulama güncellendiğinde otomatik olarak korunur."
          : "Web modül adresi ve güvenlik anahtarı yalnız ayar düzenleme yetkisi olan cihazlarda değiştirilebilir.", 12, UiKit.SECONDARY, Typeface.NORMAL));
      page.addView(readOnly);
    }

    page.addView(UiKit.sectionTitle(this, "Bağlantı özeti"));
    LinearLayout state = UiKit.card(this);
    state.addView(settingLine("Bağlantı durumu", connectionState, connectionTone()));
    state.addView(UiKit.divider(this));
    state.addView(settingLine("Son senkron", data.pulledAt.isEmpty() ? "Henüz yok" : shortTimestamp(data.pulledAt), UiKit.INFO));
    state.addView(UiKit.divider(this));
    int visiblePendingActions = data.pendingActions + localPendingActionCount();
    state.addView(settingLine("Bekleyen işlem", String.valueOf(visiblePendingActions), visiblePendingActions > 0 ? UiKit.WARNING : UiKit.SUCCESS));
    state.addView(UiKit.divider(this));
    state.addView(settingLine("Telefon kimliği", compactDeviceId(), UiKit.MUTED));
    state.addView(UiKit.divider(this));
    state.addView(settingLine("Cihaz adı", identity.deviceName, UiKit.MUTED));
    state.addView(UiKit.divider(this));
    state.addView(settingLine("Yetki profili", data.deviceRoleLabel(), data.deviceActive ? UiKit.SUCCESS : UiKit.DANGER));
    page.addView(state);

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
      Button refresh = UiKit.chip(this, loading ? "Bekleyin" : "Yenile", false, view -> syncFromHosting(false));
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
    return UiKit.scroll(this, page, MAIN_CONTENT_BOTTOM_PADDING_DP);
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
    if (data.hasPermission("customer.respond")) {
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
        : (!request.aiSummary.isEmpty() ? request.aiSummary : request.message);
    return messageCard(message, "Cevap bekliyor", UiKit.WARNING, preview);
  }

  private View customerCard(OperationData.CustomerRecord customer) {
    LinearLayout card = UiKit.card(this);
    card.setOnClickListener(view -> showCustomerDetail(customer));
    card.addView(UiKit.text(this, customer.fullName, 16, UiKit.TEXT, Typeface.BOLD));
    String counts = customer.requestCount + " talep · " + customer.reservationCount + " rezervasyon";
    card.addView(UiKit.text(this, counts, 12, UiKit.MUTED, Typeface.NORMAL));
    if (!customer.notes.isEmpty()) {
      TextView note = UiKit.text(this, ellipsize(customer.notes, 130), 13, UiKit.TEXT, Typeface.NORMAL);
      note.setMaxLines(3);
      note.setEllipsize(android.text.TextUtils.TruncateAt.END);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, UiKit.dp(this, 7), 0, UiKit.dp(this, 9));
      note.setLayoutParams(params);
      card.addView(note);
    }
    LinearLayout actions = UiKit.row(this);
    UiKit.addAction(actions, UiKit.outlineButton(this, "Ara", view -> openDialer(customer.phone)), this);
    if (data.hasPermission("customer.respond")) {
      UiKit.addAction(actions, UiKit.outlineButton(this, "WhatsApp", view -> openWhatsApp(customer.phone, "")), this);
    }
    UiKit.addAction(actions, UiKit.button(this, "Aç", UiKit.PRIMARY, view -> showCustomerDetail(customer)), this);
    card.addView(actions);
    return card;
  }

  private View reservationCard(OperationData.ReservationRecord reservation, boolean compact) {
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
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout name = UiKit.column(this);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    name.addView(UiKit.text(this, room.name, 15, UiKit.TEXT, Typeface.BOLD));
    name.addView(UiKit.text(this, (room.number.isEmpty() ? "" : room.number + " · ") + room.capacity + " kişi", 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(name);
    top.addView(statusBadge(formatRoomStatus(room.status), resourceTone(room.status)));
    card.addView(top);
    if (!room.activeReservation.isEmpty()) {
      card.addView(UiKit.text(this, room.activeReservation, 12, UiKit.INFO, Typeface.BOLD));
    }
    if (data.hasPermission("room.update_status")) {
      Button status = UiKit.outlineButton(this, "Durumu Değiştir", view -> showRoomStatusDialog(room));
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 44));
      params.setMargins(0, UiKit.dp(this, 8), 0, 0);
      status.setLayoutParams(params);
      card.addView(status);
    }
    return card;
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
    boolean canReopen = ("done".equals(task.status) || "cancelled".equals(task.status)) && data.hasPermission("daily_task.reopen");
    boolean canComplete = !"done".equals(task.status) && !"cancelled".equals(task.status) && data.hasPermission("daily_task.complete");
    if (canReopen || canComplete) {
      LinearLayout actions = UiKit.row(this);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, UiKit.dp(this, 9), 0, 0);
      actions.setLayoutParams(params);
      if (canReopen) {
        UiKit.addAction(actions, UiKit.button(this, "Yeniden Aç", UiKit.PRIMARY, view -> sendAction("daily_task_reopen", payload("task_id", task.id, "expected_updated_at", task.updatedAt), "Günlük iş yeniden açılmak üzere gönderildi.")), this);
      } else {
        UiKit.addAction(actions, UiKit.button(this, "Tamamla", UiKit.PRIMARY, view -> sendAction("daily_task_complete", payload("task_id", task.id, "expected_updated_at", task.updatedAt), "Günlük iş tamamlanmak üzere gönderildi.")), this);
      }
      card.addView(actions);
    }
    return card;
  }

  private View tableCard(OperationData.TableRecord table) {
    OperationData.TableOrder order = data.activeOrderForTable(table.id);
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout identity = UiKit.column(this);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(this, table.name, 16, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(this,
        formatTableStatus(table.status) + " · " + (order == null ? "Adisyon yok" : formatOrderStatus(order.status)),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(identity);
    top.addView(statusBadge(formatTableStatus(table.status), resourceTone(table.status)));
    card.addView(top);

    if (order != null) {
      TextView total = UiKit.text(this, order.itemCount + " ürün · " + money(order.total, orderCurrency(order)), 14, UiKit.TEXT, Typeface.BOLD);
      LinearLayout.LayoutParams totalParams = new LinearLayout.LayoutParams(-1, -2);
      totalParams.setMargins(0, UiKit.dp(this, 5), 0, 0);
      total.setLayoutParams(totalParams);
      card.addView(total);
    } else if (!table.activeReservation.isEmpty()) {
      card.addView(UiKit.text(this, table.activeReservation, 12, UiKit.INFO, Typeface.BOLD));
    }

    LinearLayout primaryActions = UiKit.row(this);
    LinearLayout.LayoutParams primaryParams = new LinearLayout.LayoutParams(-1, -2);
    primaryParams.setMargins(0, UiKit.dp(this, 10), 0, 0);
    primaryActions.setLayoutParams(primaryParams);
    if (data.hasPermission("table_order.view")
        && (order != null || data.hasPermission("table_order.open"))) {
      UiKit.addAction(primaryActions, UiKit.button(this, order == null ? "Sipariş Aç" : "Siparişi Aç", UiKit.PRIMARY, view -> showTableOrder(table)), this);
    }
    if (order == null && data.hasPermission("table.update_status")) {
      UiKit.addAction(primaryActions, UiKit.outlineButton(this, "Masa Durumu", view -> showTableStatusDialog(table)), this);
    } else if (order != null && "payment".equals(order.status) && data.hasPermission("table_order.close_paid")) {
      UiKit.addAction(primaryActions, UiKit.button(this, "Ödendi / Kapat", UiKit.ACCENT, view -> confirm("Adisyonu kapat", table.name + " adisyonu ödendi olarak kapatılsın mı?", () -> closeOrder(order, "paid"))), this);
    } else if (order != null && data.hasPermission("table_order.set_payment_waiting")) {
      UiKit.addAction(primaryActions, UiKit.outlineButton(this, "Hesap Bekliyor", view -> sendOrderStatus(order, "payment")), this);
    } else if (order != null && data.hasPermission("table_order.close_paid")) {
      UiKit.addAction(primaryActions, UiKit.button(this, "Ödendi / Kapat", UiKit.ACCENT, view -> confirm("Adisyonu kapat", table.name + " adisyonu ödendi olarak kapatılsın mı?", () -> closeOrder(order, "paid"))), this);
    }
    if (primaryActions.getChildCount() > 0) {
      card.addView(primaryActions);
    }

    return card;
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
    showStatusSelectionDialog("Masa durumunu değiştir", table.status, new String[][] {
        {"available", "Boş"},
        {"occupied", "Dolu"},
        {"reserved", "Rezerve"},
        {"bill_waiting", "Hesap"}
    }, status -> updateTable(table, status));
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
    if (data.hasPermission("customer.respond")) {
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
    Dialog dialog = new Dialog(this);
    LinearLayout shell = UiKit.column(this);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(this, 16), UiKit.dp(this, 14), UiKit.dp(this, 16), UiKit.dp(this, 20));

    LinearLayout header = UiKit.row(this);
    LinearLayout heading = UiKit.column(this);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(this, "MÜŞTERİ DETAYI"));
    heading.addView(UiKit.title(this, customer.fullName));
    header.addView(heading);
    addDetailHeaderActions(header, dialog, () -> showCustomerDetail(customer));
    shell.addView(header);

    LinearLayout page = UiKit.column(this);
    LinearLayout summary = UiKit.card(this);
    summary.addView(detailLine("Kayıtlar", customer.requestCount + " talep · " + customer.reservationCount + " rezervasyon"));
    if (!customer.phone.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(detailLine("Telefon", customer.phone));
    }
    if (!customer.email.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(detailLine("E-posta", customer.email));
    }
    if (!customer.tags.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(detailLine("Etiketler", String.join(", ", customer.tags)));
    }
    page.addView(summary);

    if (!customer.notes.isEmpty()) {
      page.addView(sectionLabel("Notlar"));
      LinearLayout notes = UiKit.card(this);
      notes.addView(UiKit.text(this, customer.notes, 14, UiKit.TEXT, Typeface.NORMAL));
      page.addView(notes);
    }

    if (!customer.phone.isEmpty()) {
      LinearLayout contact = UiKit.row(this);
      UiKit.addAction(contact, UiKit.outlineButton(this, "Ara", view -> openDialer(customer.phone)), this);
      if (data.hasPermission("customer.respond")) {
        UiKit.addAction(contact, UiKit.button(this, "WhatsApp", UiKit.PRIMARY, view -> openWhatsApp(customer.phone, "")), this);
      }
      page.addView(contact);
    }

    if (AndroidUiRules.canDelete(data, "customer.delete")) {
      page.addView(sectionLabel("Yönetici işlemi"));
      Button delete = UiKit.dangerButton(this, "Müşteriyi Sil", view -> confirm(
          "Müşteriyi sil",
          customer.fullName + " müşteri listesinden silinsin mi? Eski talep ve rezervasyon kayıtları korunur.",
          () -> {
            sendAction(
                "customer_delete",
                payload("customer_id", customer.id, "expected_updated_at", customer.updatedAt),
                "Müşteri silinmek üzere gönderildi."
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
    if (!request.aiSummary.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(UiKit.text(this, "Kısa özet", 12, UiKit.PRIMARY, Typeface.BOLD));
      summary.addView(UiKit.text(this, request.aiSummary, 13, UiKit.TEXT, Typeface.NORMAL));
    }
    page.addView(summary);

    page.addView(UiKit.sectionTitle(this, "İletişim"));
    LinearLayout contact = UiKit.row(this);
    UiKit.addAction(contact, UiKit.outlineButton(this, "Ara", view -> openDialer(request.customerPhone)), this);
    if (data.hasPermission("customer.respond")) {
      UiKit.addAction(contact, UiKit.button(this, "WhatsApp", UiKit.PRIMARY, view -> openWhatsApp(request.customerPhone, request.readyMessage())), this);
    }
    page.addView(contact);

    String readyMessage = request.readyMessage();
    if (!readyMessage.isEmpty() && data.hasPermission("customer.respond")) {
      Button ready = UiKit.outlineButton(this, "Hazır Cevabı Göster", view -> showPreparedReply(request.customerName, readyMessage));
      LinearLayout.LayoutParams readyParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
      readyParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      ready.setLayoutParams(readyParams);
      page.addView(ready);
    }

    boolean canConvert = data.hasPermission("customer.convert_to_reservation");
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
    if (!reservation.notes.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(UiKit.text(this, reservation.notes, 13, UiKit.TEXT, Typeface.NORMAL));
    }
    page.addView(summary);

    page.addView(sectionLabel("İletişim"));
    LinearLayout contact = UiKit.row(this);
    UiKit.addAction(contact, UiKit.outlineButton(this, "Ara", view -> openDialer(reservation.customerPhone)), this);
    if (data.hasPermission("customer.respond")) {
      UiKit.addAction(contact, UiKit.button(this, "WhatsApp", UiKit.PRIMARY,
          view -> openWhatsApp(reservation.customerPhone, reservationMessage(reservation))), this);
    }
    page.addView(contact);

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

    if (data.hasPermission("customer.respond") && !message.message.isEmpty()) {
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
    OperationData.TableOrder order = data.activeOrderForTable(table.id);
    Dialog dialog = new Dialog(this);
    LinearLayout shell = UiKit.column(this);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(this, 14), UiKit.dp(this, 12), UiKit.dp(this, 14), UiKit.dp(this, 16));

    LinearLayout header = UiKit.row(this);
    LinearLayout heading = UiKit.column(this);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(this, "MASA SİPARİŞİ"));
    heading.addView(UiKit.title(this, table.name));
    String orderSummary = order == null
        ? "Adisyon yok · 0 ürün · " + money(0, "TRY")
        : formatOrderStatus(order.status) + " · " + order.itemCount + " ürün · " + money(order.total, orderCurrency(order));
    heading.addView(UiKit.text(this,
        orderSummary,
        12,
        order == null ? UiKit.WARNING : orderTone(order.status),
        Typeface.BOLD
    ));
    header.addView(heading);
    addDetailHeaderActions(header, dialog, () -> showTableOrder(table));
    shell.addView(header);

    LinearLayout page = UiKit.column(this);
    if (order == null) {
      TextView hint = UiKit.text(this, "Ürün ekleyin veya alttaki Siparişi Kaydet aksiyonuyla boş adisyon açın.", 12, UiKit.MUTED, Typeface.NORMAL);
      LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(-1, -2);
      hintParams.setMargins(0, UiKit.dp(this, 6), 0, UiKit.dp(this, 4));
      hint.setLayoutParams(hintParams);
      page.addView(hint);
    }

    if (data.hasPermission("menu.view")) {
      page.addView(sectionLabel("Ürünler"));
      final String[] category = {""};
      final String[] query = {""};
      EditText search = UiKit.input(this, "Ürün ara");
      LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 50));
      searchParams.setMargins(0, 0, 0, UiKit.dp(this, 7));
      search.setLayoutParams(searchParams);
      page.addView(search);

      LinearLayout categoryRow = UiKit.row(this);
      HorizontalScrollView categoryScroll = new HorizontalScrollView(this);
      categoryScroll.setHorizontalScrollBarEnabled(false);
      categoryScroll.addView(categoryRow);
      page.addView(categoryScroll);

      LinearLayout menuContainer = UiKit.column(this);
      LinearLayout.LayoutParams menuParams = new LinearLayout.LayoutParams(-1, -2);
      menuParams.setMargins(0, UiKit.dp(this, 7), 0, 0);
      menuContainer.setLayoutParams(menuParams);
      page.addView(menuContainer);
      final Runnable[] refreshMenu = new Runnable[1];
      refreshMenu[0] = () -> {
        categoryRow.removeAllViews();
        categoryRow.addView(UiKit.chip(this, "Tümü", category[0].isEmpty(), view -> {
          category[0] = "";
          refreshMenu[0].run();
        }));
        for (OperationData.MenuCategory menuCategory : data.categories) {
          categoryRow.addView(UiKit.chip(this, menuCategory.name, menuCategory.id.equals(category[0]), view -> {
            category[0] = menuCategory.id;
            refreshMenu[0].run();
          }));
        }
        renderOrderMenuItems(menuContainer, table, order, category[0], query[0]);
      };
      search.addTextChangedListener(new TextWatcher() {
        @Override public void beforeTextChanged(CharSequence text, int start, int count, int after) {}
        @Override public void onTextChanged(CharSequence text, int start, int before, int count) {
          query[0] = text == null ? "" : text.toString().trim();
          renderOrderMenuItems(menuContainer, table, order, category[0], query[0]);
        }
        @Override public void afterTextChanged(Editable editable) {}
      });
      refreshMenu[0].run();
    }

    page.addView(sectionLabel("Aktif adisyon satırları"));
    if (order == null || order.items.isEmpty()) {
      page.addView(emptyCard("Henüz ürün yok", "Menüden Ekle'ye dokunarak siparişi başlatın."));
    } else {
      for (OperationData.TableOrderItem item : order.items) {
        page.addView(orderItemCard(item));
      }
    }

    LinearLayout total = UiKit.card(this);
    total.addView(settingLine("Toplam", order == null ? money(0, "TRY") : money(order.total, orderCurrency(order)), UiKit.PRIMARY));
    page.addView(total);

    if (order != null && data.hasPermission("table_order.cancel")) {
      Button cancel = UiKit.dangerButton(this, "Adisyonu İptal Et", view -> confirm("Adisyonu iptal et", "Adisyon iptal edilip masa boşaltılsın mı?", () -> {
        closeOrder(order, "cancelled");
        dialog.dismiss();
      }));
      LinearLayout.LayoutParams cancelParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
      cancelParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      cancel.setLayoutParams(cancelParams);
      page.addView(cancel);
    }

    ScrollView scroll = UiKit.scroll(this, page);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);

    ArrayList<Button> stickyActions = new ArrayList<>();
    if (order == null && data.hasPermission("table_order.open")) {
      stickyActions.add(UiKit.button(this, "Siparişi Kaydet", UiKit.PRIMARY, view ->
          sendAction("table_order_open", payload("table_id", table.id, "expected_table_updated_at", table.updatedAt), "Masa siparişi açılmak üzere gönderildi.")));
    }
    if (order != null && data.hasPermission("table_order.set_preparing")) {
      stickyActions.add(UiKit.outlineButton(this, "Hazırlanıyor", view -> sendOrderStatus(order, "preparing")));
    }
    if (order != null && data.hasPermission("table_order.set_served")) {
      stickyActions.add(UiKit.outlineButton(this, "Servis Edildi", view -> sendOrderStatus(order, "served")));
    }
    if (order != null && data.hasPermission("table_order.set_payment_waiting")) {
      stickyActions.add(UiKit.button(this, "Hesap Bekliyor", UiKit.ACCENT, view -> sendOrderStatus(order, "payment")));
    }
    if (order != null && data.hasPermission("table_order.close_paid")) {
      stickyActions.add(UiKit.button(this, "Ödendi / Kapat", UiKit.PRIMARY, view -> confirm("Adisyonu kapat", "Adisyon ödendi olarak kapatılsın mı?", () -> {
        closeOrder(order, "paid");
        dialog.dismiss();
      })));
    }
    if (!stickyActions.isEmpty()) {
      shell.addView(orderActionBar(stickyActions));
    }
    dialog.setContentView(shell);
    dialog.show();
    configureFullDialog(dialog);
  }

  private View orderActionBar(List<Button> actions) {
    LinearLayout bar = UiKit.column(this);
    bar.setContentDescription("Adisyon aksiyonları");
    bar.setPadding(0, UiKit.dp(this, 8), 0, 0);
    bar.setBackground(UiKit.rounded(this, UiKit.BG, UiKit.BORDER, 0));
    int firstRowEnd = actions.size() > 2 ? 2 : actions.size();
    bar.addView(orderActionRow(actions, 0, firstRowEnd));
    if (firstRowEnd < actions.size()) {
      LinearLayout secondRow = orderActionRow(actions, firstRowEnd, actions.size());
      LinearLayout.LayoutParams secondRowParams = new LinearLayout.LayoutParams(-1, -2);
      secondRowParams.setMargins(0, UiKit.dp(this, 7), 0, 0);
      secondRow.setLayoutParams(secondRowParams);
      bar.addView(secondRow);
    }
    return bar;
  }

  private LinearLayout orderActionRow(List<Button> actions, int start, int end) {
    LinearLayout row = UiKit.row(this);
    row.setLayoutParams(new LinearLayout.LayoutParams(-1, -2));
    for (int index = start; index < end; index += 1) {
      UiKit.addAction(row, actions.get(index), this);
    }
    return row;
  }

  private void renderOrderMenuItems(
      LinearLayout container,
      OperationData.TableRecord table,
      OperationData.TableOrder order,
      String categoryId,
      String search
  ) {
    container.removeAllViews();
    String normalizedSearch = search.toLowerCase(new Locale("tr", "TR"));
    int shown = 0;
    for (OperationData.MenuItem item : data.menuItems) {
      if (!item.available || (!categoryId.isEmpty() && !categoryId.equals(item.categoryId))) {
        continue;
      }
      if (!normalizedSearch.isEmpty()
          && !item.name.toLowerCase(new Locale("tr", "TR")).contains(normalizedSearch)
          && !item.description.toLowerCase(new Locale("tr", "TR")).contains(normalizedSearch)) {
        continue;
      }
      LinearLayout card = UiKit.card(this);
      LinearLayout row = UiKit.row(this);
      LinearLayout details = UiKit.column(this);
      details.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
      details.addView(UiKit.text(this, item.name, 14, UiKit.TEXT, Typeface.BOLD));
      details.addView(UiKit.text(this, data.categoryName(item.categoryId) + " · " + money(item.price, item.currency), 12, UiKit.MUTED, Typeface.NORMAL));
      if (item.stockQuantity != null) {
        details.addView(UiKit.text(this,
            item.outOfStock() ? "Stokta yok" : "Mevcut stok: " + stockQuantity(item.stockQuantity, item.stockUnit),
            12, item.outOfStock() ? UiKit.DANGER : UiKit.INFO, Typeface.BOLD));
      }
      row.addView(details);
      boolean canAdd = data.hasPermission("table_order.add_item")
          && (order != null || data.hasPermission("table_order.open"));
      if (canAdd) {
        Button add = UiKit.button(this, item.outOfStock() ? "Stok yok" : "Ekle", UiKit.PRIMARY, view -> addOrderItem(table, order, item));
        add.setLayoutParams(new LinearLayout.LayoutParams(UiKit.dp(this, 82), UiKit.dp(this, 44)));
        add.setEnabled(!item.outOfStock());
        row.addView(add);
      }
      card.addView(row);
      container.addView(card);
      shown += 1;
    }
    if (shown == 0) {
      container.addView(emptyCard("Ürün bulunamadı", "Arama veya kategori filtresini değiştirin."));
    }
  }

  private View orderItemCard(OperationData.TableOrderItem item) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout details = UiKit.column(this);
    details.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    details.addView(UiKit.text(this, item.productName, 14, UiKit.TEXT, Typeface.BOLD));
    details.addView(UiKit.text(this, money(item.unitPrice, item.currency) + " · " + money(item.lineTotal, item.currency), 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(details);
    TextView quantity = statusBadge(String.valueOf(item.quantity), UiKit.PRIMARY);
    top.addView(quantity);
    card.addView(top);

    if (data.hasPermission("table_order.update_item") || data.hasPermission("table_order.remove_item")) {
      LinearLayout actions = UiKit.row(this);
      LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(-1, -2);
      actionParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      actions.setLayoutParams(actionParams);
      if (data.hasPermission("table_order.update_item")) {
        Button minus = UiKit.outlineButton(this, "−", view -> {
          if (item.quantity > 1) {
            sendAction("table_order_update_item_quantity", payload("item_id", item.id, "quantity", item.quantity - 1, "expected_item_updated_at", item.updatedAt), "Ürün adedi azaltılmak üzere gönderildi.");
          }
        });
        minus.setEnabled(item.quantity > 1);
        UiKit.addAction(actions, minus, this);
        Button plus = UiKit.outlineButton(this, "+", view -> sendAction("table_order_update_item_quantity", payload("item_id", item.id, "quantity", item.quantity + 1, "expected_item_updated_at", item.updatedAt), "Ürün adedi artırılmak üzere gönderildi."));
        OperationData.MenuItem currentMenuItem = data.menuItemById(item.menuItemId);
        plus.setEnabled(currentMenuItem == null || !currentMenuItem.outOfStock());
        UiKit.addAction(actions, plus, this);
      }
      if (data.hasPermission("table_order.remove_item")) {
        UiKit.addAction(actions, UiKit.dangerButton(this, "Sil", view -> confirm("Ürünü sil", item.productName + " adisyondan kaldırılsın mı?", () -> sendAction("table_order_remove_item", payload("item_id", item.id, "expected_item_updated_at", item.updatedAt), "Ürün silinmek üzere gönderildi."))), this);
      }
      card.addView(actions);
    }
    return card;
  }

  private void addOrderItem(OperationData.TableRecord table, OperationData.TableOrder order, OperationData.MenuItem item) {
    if (item.outOfStock()) {
      String message = "Stokta yeterli ürün yok";
      showError(message);
      Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
      return;
    }
    if (order == null) {
      ArrayList<ActionSpec> actions = new ArrayList<>();
      ActionSpec openAction = new ActionSpec("table_order_open", payload(
          "table_id", table.id,
          "expected_table_updated_at", table.updatedAt
      ));
      actions.add(openAction);
      actions.add(new ActionSpec("table_order_add_item", payload(
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

  private void sendReservationAction(OperationData.ReservationRecord reservation, String actionType, String message) {
    sendAction(actionType, payload("reservation_id", reservation.id, "expected_updated_at", reservation.updatedAt), message);
  }

  private void syncFromHosting(boolean readSettingsInputs) {
    if (loading) {
      return;
    }
    if (readSettingsInputs && data.permissionsResolved && !data.hasPermission("settings.edit")) {
      showError("Bu cihazın bağlantı ayarlarını değiştirme yetkisi yok.");
      return;
    }
    String baseUrl = readSettingsInputs && webModuleInput != null
        ? webModuleInput.getText().toString().trim()
        : ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = readSettingsInputs && syncSecretInput != null
        ? syncSecretInput.getText().toString().trim()
        : ConnectionSettings.syncSecret(preferences);
    if (baseUrl.isEmpty()) {
      showError("Web modül adresi gerekli.");
      return;
    }
    if (syncSecret.isEmpty()) {
      showError("Güvenlik anahtarı gerekli.");
      return;
    }

    final List<ActionOutbox.PendingAction> pendingToRetry;
    try {
      pendingToRetry = actionOutbox.load();
      for (ActionOutbox.PendingAction pending : pendingToRetry) {
        if (!pending.matchesTarget(baseUrl, syncSecret)) {
          showError("Telefonda önceki bağlantıya ait bekleyen işlem var. Önce eski bağlantı bilgileriyle işlemi gönderin.");
          return;
        }
      }
    } catch (ActionOutbox.OutboxException error) {
      showError(error.getMessage());
      return;
    }

    preferences.edit()
        .putString(ConnectionSettings.KEY_WEB_MODULE_URL, baseUrl)
        .putString(ConnectionSettings.KEY_SYNC_SECRET, syncSecret)
        .apply();
    loading = true;
    connectionState = pendingToRetry.isEmpty() ? "Canlı veri çekiliyor" : "Bekleyen işlemler yeniden gönderiliyor";
    clearError();
    final OperationData previousData = operationCache.load();
    final OperationData fallbackData = data;
    executor.execute(() -> {
      try {
        for (ActionOutbox.PendingAction pending : pendingToRetry) {
          syncClient.enqueueAction(baseUrl, syncSecret, identity, pending.id, pending.type, pending.payload);
          actionOutbox.remove(pending.id);
        }
        HostingSyncClient.FetchResult fetched = syncClient.fetchOperations(baseUrl, syncSecret, identity, data.serverRevision);
        final OperationData nextData;
        if (!fetched.notModified && fetched.data != null) {
          operationCache.save(fetched.payload);
          OperationData cachedData = operationCache.load();
          nextData = cachedData == null ? fetched.data : cachedData;
        } else {
          nextData = previousData == null ? fallbackData : previousData;
          nextData.pulledAt = fetched.payload.optString("pulled_at", nextData.pulledAt);
          nextData.pendingActions = Math.max(0, fetched.payload.optInt("pending_action_count", nextData.pendingActions));
        }
        if (!fetched.notModified) {
          localNotifications.processSnapshot(previousData, nextData);
        }
        localNotifications.recordSyncSuccess();
        runOnUiThread(() -> {
          data = nextData;
          loading = false;
          connectionState = "Bağlantı hazır";
          clearError();
          if (!fetched.notModified || !pendingToRetry.isEmpty()) {
            render();
          }
        });
      } catch (HostingSyncClient.SyncException | ActionOutbox.OutboxException | OperationCache.CacheException error) {
        localNotifications.recordSyncFailure(previousData, error.getMessage());
        runOnUiThread(() -> {
          loading = false;
          connectionState = error.getMessage();
          showError(error.getMessage());
        });
      }
    });
  }

  private void sendAction(String actionType, JSONObject actionPayload, String successMessage) {
    ArrayList<ActionSpec> actions = new ArrayList<>();
    actions.add(new ActionSpec(actionType, actionPayload));
    sendActions(actions, successMessage);
  }

  private void sendActions(List<ActionSpec> actions, String successMessage) {
    if (loading) {
      Toast.makeText(this, "Devam eden bağlantı işleminin bitmesini bekleyin.", Toast.LENGTH_SHORT).show();
      return;
    }
    if (data.permissionsResolved && !data.deviceActive) {
      showError("Cihaz masaüstünde pasifleştirilmiş.");
      return;
    }
    for (ActionSpec action : actions) {
      if (isAdminOnlyDeletionAction(action.type) && !data.isAdmin()) {
        String message = "Silme işlemleri yalnız yönetici cihazlarda kullanılabilir.";
        showError(message);
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
        return;
      }
      String requiredPermission = requiredPermissionForAction(action.type, action.payload);
      if (requiredPermission == null || !data.hasPermission(requiredPermission)) {
        String message = "table_order.close_paid".equals(requiredPermission)
            ? "Bu cihazın hesap kapatma yetkisi yok."
            : "Bu cihazın bu işlem için yetkisi yok.";
        showError(message);
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
        return;
      }
    }
    String baseUrl = ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = ConnectionSettings.syncSecret(preferences);
    if (baseUrl.isEmpty() || syncSecret.isEmpty()) {
      showError("İşlem gönderilemedi. Ayarlar'dan bağlantıyı tamamlayın.");
      return;
    }

    try {
      if (!actionOutbox.load().isEmpty()) {
        Toast.makeText(this, "Önce telefonda bekleyen işlem yeniden gönderiliyor.", Toast.LENGTH_SHORT).show();
        syncFromHosting(false);
        return;
      }
    } catch (ActionOutbox.OutboxException error) {
      showError(error.getMessage());
      return;
    }
    if (data.pendingActions > 0) {
      showError("Önce masaüstünü bekleyen işlemleri uygulayın ve canlı veriyi yenileyin.");
      Toast.makeText(this, "Güncel sonuç alınmadan yeni işlem gönderilemez.", Toast.LENGTH_SHORT).show();
      return;
    }

    ArrayList<ActionOutbox.PendingAction> pendingActions = new ArrayList<>();
    try {
      for (ActionSpec action : actions) {
        pendingActions.add(ActionOutbox.PendingAction.create(
            action.id,
            action.type,
            action.payload,
            baseUrl,
            syncSecret
        ));
      }
      actionOutbox.appendAll(pendingActions);
    } catch (ActionOutbox.OutboxException error) {
      showError(error.getMessage());
      return;
    }

    loading = true;
    clearError();
    executor.execute(() -> {
      ArrayList<OperationData.ActionRecord> queued = new ArrayList<>();
      try {
        for (ActionOutbox.PendingAction action : pendingActions) {
          OperationData.ActionRecord accepted = syncClient.enqueueAction(baseUrl, syncSecret, identity, action.id, action.type, action.payload);
          actionOutbox.remove(action.id);
          queued.add(accepted);
        }
        runOnUiThread(() -> {
          loading = false;
          for (int index = queued.size() - 1; index >= 0; index -= 1) {
            data.actions.add(0, queued.get(index));
          }
          data.pendingActions += queued.size();
          clearError();
          render();
        });
      } catch (HostingSyncClient.SyncException | ActionOutbox.OutboxException error) {
        runOnUiThread(() -> {
          loading = false;
          if (!queued.isEmpty()) {
            for (int index = queued.size() - 1; index >= 0; index -= 1) {
              data.actions.add(0, queued.get(index));
            }
            data.pendingActions += queued.size();
          }
          showError(queued.isEmpty()
              ? "İşlem gönderilemedi. " + error.getMessage()
              : "İşlemin bir bölümü gönderildi; kalan bölüm gönderilemedi. " + error.getMessage());
          render();
        });
      }
    });
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

  private String requiredPermissionForAction(String actionType, JSONObject actionPayload) {
    switch (actionType) {
      case "customer_request_delete":
        return "request.delete";
      case "customer_delete":
        return "customer.delete";
      case "menu_category_delete":
      case "menu_item_delete":
        return "menu.delete";
      case "message_delete":
        return "message.delete";
      case "customer_request_approve":
      case "customer_request_reopen":
        return "customer.respond";
      case "customer_request_mark_answered":
        return "customer.mark_answered";
      case "customer_request_reject":
        return "customer.reject";
      case "customer_request_convert_to_reservation":
        return "customer.convert_to_reservation";
      case "reservation_approve":
        return "reservation.approve";
      case "reservation_reject":
        return "reservation.reject";
      case "reservation_cancel":
        return "reservation.cancel";
      case "room_status_update":
        return "room.update_status";
      case "daily_task_complete":
        return "daily_task.complete";
      case "daily_task_reopen":
        return "daily_task.reopen";
      case "table_status_update":
        return "table.update_status";
      case "table_order_open":
        return "table_order.open";
      case "table_order_add_item":
        return "table_order.add_item";
      case "table_order_update_item_quantity":
        return "table_order.update_item";
      case "table_order_remove_item":
        return "table_order.remove_item";
      case "table_order_set_preparing":
        return "table_order.set_preparing";
      case "table_order_set_served":
        return "table_order.set_served";
      case "table_order_set_payment_waiting":
        return "table_order.set_payment_waiting";
      case "table_order_close_paid":
        return "table_order.close_paid";
      case "table_order_cancel":
        return "table_order.cancel";
      case "menu_stock_add":
      case "menu_stock_set":
      case "menu_stock_adjust":
      case "menu_stock_image_import_apply":
        return "menu.stock_update";
      case "table_order_set_status":
        String status = actionPayload.optString("status", "");
        if ("served".equals(status)) {
          return "table_order.set_served";
        }
        if ("payment".equals(status)) {
          return "table_order.set_payment_waiting";
        }
        return "table_order.set_preparing";
      case "table_order_close":
        return "paid".equals(actionPayload.optString("status", ""))
            ? "table_order.close_paid"
            : "table_order.cancel";
      default:
        return null;
    }
  }

  private boolean isAdminOnlyDeletionAction(String actionType) {
    return "customer_request_delete".equals(actionType)
        || "customer_delete".equals(actionType)
        || "menu_category_delete".equals(actionType)
        || "menu_item_delete".equals(actionType)
        || "message_delete".equals(actionType);
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
    String normalizedPhone = normalizeWhatsAppPhone(phone);
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
      if (status.equals(reservation.status) && isPensionReservation(reservation)) {
        count += 1;
      }
    }
    return count;
  }

  private int countPensionDate(boolean checkIn) {
    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
    int count = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (!isPensionReservation(reservation) || "cancelled".equals(reservation.status)) {
        continue;
      }
      if (today.equals(checkIn ? reservation.startDate : reservation.endDate)) {
        count += 1;
      }
    }
    return count;
  }

  private int countRoomsByStatus(String status) {
    int count = 0;
    for (OperationData.RoomRecord room : data.rooms) {
      if (status.equals(room.status)) {
        count += 1;
      }
    }
    return count;
  }

  private int countPensionTasks(boolean completed) {
    int count = 0;
    for (OperationData.TaskRecord task : data.tasks) {
      if ((completed && "done".equals(task.status)) || (!completed && "pending".equals(task.status))) {
        count += 1;
      }
    }
    return count;
  }

  private int countTablesByStatus(String status) {
    int count = 0;
    for (OperationData.TableRecord table : data.tables) {
      if (status.equals(table.status)) {
        count += 1;
      }
    }
    return count;
  }

  private int countActiveOrders() {
    int count = 0;
    for (OperationData.TableOrder order : data.tableOrders) {
      if (order.isActive()) {
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

  private int countPaymentWaitingTables() {
    int count = countOrdersByStatus("payment");
    for (OperationData.TableRecord table : data.tables) {
      if (("bill_waiting".equals(table.status) || "payment".equals(table.status))
          && !hasPaymentOrderForTable(table.id)) {
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

  private boolean isPriorityTask(OperationData.TaskRecord task) {
    if (!"pending".equals(task.status)) {
      return false;
    }
    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
    return task.dueDate.isEmpty() || task.dueDate.compareTo(today) <= 0;
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
    return ConnectionSettings.isComplete(preferences);
  }

  private boolean isPensionReservation(OperationData.ReservationRecord reservation) {
    return "room".equals(reservation.type)
        || "room_and_table".equals(reservation.type)
        || (!reservation.roomIds.isEmpty() && !"table".equals(reservation.type));
  }

  private String requestDate(OperationData.RequestRecord request) {
    String dates = !request.dateText.isEmpty() ? request.dateText : joinDateRange(request.startDate, request.endDate);
    if (dates.isEmpty()) {
      dates = shortTimestamp(request.createdAt);
    }
    if (!request.time.isEmpty()) {
      dates += " · " + request.time;
    }
    return dates.isEmpty() ? "Tarih belirtilmemiş" : dates;
  }

  private String joinDateRange(String start, String end) {
    if (start == null || start.isEmpty()) {
      return end == null ? "" : end;
    }
    if (end == null || end.isEmpty() || start.equals(end)) {
      return start;
    }
    return start + " → " + end;
  }

  private String joinNonEmpty(String separator, String... values) {
    StringBuilder result = new StringBuilder();
    for (String value : values) {
      if (value == null || value.trim().isEmpty()) {
        continue;
      }
      if (result.length() > 0) {
        result.append(separator);
      }
      result.append(value.trim());
    }
    return result.toString();
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

  private OperationData.TableRecord tableById(String tableId) {
    for (OperationData.TableRecord table : data.tables) {
      if (tableId.equals(table.id)) {
        return table;
      }
    }
    return null;
  }

  private String reservationMessage(OperationData.ReservationRecord reservation) {
    return "Merhaba " + reservation.customerName + ", " + joinDateRange(reservation.startDate, reservation.endDate)
        + " tarihli rezervasyonunuz hakkında size ulaşıyoruz.";
  }

  private String normalizeWhatsAppPhone(String phone) {
    String digits = phone == null ? "" : phone.replaceAll("[^0-9]", "");
    if (digits.startsWith("0") && digits.length() == 11) {
      return "90" + digits.substring(1);
    }
    if (digits.length() == 10) {
      return "90" + digits;
    }
    return digits;
  }

  private String compactDeviceId() {
    return identity.deviceId.length() <= 20 ? identity.deviceId : identity.deviceId.substring(0, 12) + "…" + identity.deviceId.substring(identity.deviceId.length() - 5);
  }

  private String shortTimestamp(String value) {
    if (value == null || value.trim().isEmpty()) {
      return "";
    }
    String text = value.trim().replace("T", " ");
    int zone = text.indexOf('+', 10);
    if (zone > 0) {
      text = text.substring(0, zone);
    }
    if (text.endsWith("Z")) {
      text = text.substring(0, text.length() - 1);
    }
    return text.length() > 16 ? text.substring(0, 16) : text;
  }

  private String ellipsize(String value, int length) {
    if (value == null) {
      return "";
    }
    String normalized = value.trim();
    return normalized.length() <= length ? normalized : normalized.substring(0, Math.max(0, length - 1)) + "…";
  }

  private String money(double value, String currency) {
    if ("TRY".equalsIgnoreCase(currency)) {
      NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("tr", "TR"));
      return format.format(value);
    }
    return String.format(new Locale("tr", "TR"), "%.2f %s", value, currency == null ? "" : currency);
  }

  private String orderCurrency(OperationData.TableOrder order) {
    return order.items.isEmpty() ? "TRY" : order.items.get(0).currency;
  }

  private int connectionTone() {
    if ("Bağlantı hazır".equals(connectionState)) {
      return UiKit.SUCCESS;
    }
    if (connectionState.contains("çekiliyor")) {
      return UiKit.INFO;
    }
    return "Henüz bağlanmadı".equals(connectionState) ? UiKit.MUTED : UiKit.DANGER;
  }

  private String formatRequestType(String value) {
    if ("pension_reservation".equals(value)) return "Pansiyon rezervasyonu";
    if ("restaurant_reservation".equals(value)) return "Masa rezervasyonu";
    if ("breakfast_request".equals(value)) return "Kahvaltı talebi";
    if ("price_question".equals(value)) return "Fiyat sorusu";
    if ("location_question".equals(value)) return "Konum sorusu";
    if ("qr_menu_question".equals(value)) return "Menü sorusu";
    if ("general_info".equals(value)) return "Bilgi talebi";
    return "Diğer talep";
  }

  private String formatRequestStatus(String value) {
    if ("new".equals(value)) return "Yeni";
    if ("seen".equals(value)) return "Görüldü";
    if ("waiting_owner".equals(value)) return "Sizi bekliyor";
    if ("waiting_customer".equals(value)) return "Müşteri bekleniyor";
    if ("approved".equals(value)) return "Onaylandı";
    if ("rejected".equals(value)) return "Reddedildi";
    if ("answered".equals(value)) return "Cevaplandı";
    if ("converted_to_reservation".equals(value)) return "Rezervasyona çevrildi";
    if ("cancelled".equals(value)) return "İptal";
    return value == null || value.isEmpty() ? "Bekliyor" : value;
  }

  private String formatReservationStatus(String value) {
    if ("pending".equals(value)) return "Bekliyor";
    if ("approved".equals(value)) return "Onaylı";
    if ("rejected".equals(value)) return "Reddedildi";
    if ("cancelled".equals(value)) return "İptal";
    if ("completed".equals(value)) return "Tamamlandı";
    return value;
  }

  private String formatRoomStatus(String value) {
    if ("available".equals(value)) return "Boş";
    if ("occupied".equals(value)) return "Dolu";
    if ("reserved".equals(value)) return "Rezerve";
    if ("cleaning".equals(value)) return "Temizlik";
    if ("maintenance".equals(value)) return "Bakım";
    return value;
  }

  private String formatTableStatus(String value) {
    if ("available".equals(value)) return "Boş";
    if ("occupied".equals(value)) return "Dolu";
    if ("reserved".equals(value)) return "Rezerve";
    if ("bill_waiting".equals(value)) return "Hesap";
    if ("cleaning".equals(value)) return "Temizlik";
    return value;
  }

  private String formatTaskStatus(String value) {
    if ("pending".equals(value)) return "Bekliyor";
    if ("done".equals(value)) return "Tamamlandı";
    if ("cancelled".equals(value)) return "İptal";
    return value;
  }

  private String formatOrderStatus(String value) {
    if ("open".equals(value)) return "Açık";
    if ("preparing".equals(value)) return "Hazırlanıyor";
    if ("served".equals(value)) return "Servis edildi";
    if ("payment".equals(value)) return "Hesap bekliyor";
    if ("paid".equals(value)) return "Ödendi";
    if ("cancelled".equals(value)) return "İptal";
    return value;
  }

  private String formatActionStatus(String value) {
    if ("pending".equals(value)) return "Bekliyor";
    if ("applied".equals(value)) return "Uygulandı";
    if ("failed".equals(value)) return "Uygulanamadı";
    return value;
  }

  private String formatActionType(String value) {
    if (value.startsWith("customer_request")) return "Müşteri talebi";
    if (value.startsWith("reservation")) return "Rezervasyon";
    if (value.startsWith("room")) return "Oda durumu";
    if (value.startsWith("daily_task")) return "Günlük iş";
    if (value.startsWith("table_order")) return "Masa siparişi";
    if (value.startsWith("table")) return "Masa durumu";
    return "Telefon işlemi";
  }

  private int requestTone(String status) {
    if ("new".equals(status) || "seen".equals(status)) return UiKit.INFO;
    if ("waiting_owner".equals(status) || "waiting_customer".equals(status)) return UiKit.WARNING;
    if ("approved".equals(status) || "answered".equals(status) || "converted_to_reservation".equals(status)) return UiKit.SUCCESS;
    if ("rejected".equals(status) || "cancelled".equals(status)) return UiKit.DANGER;
    return UiKit.MUTED;
  }

  private int reservationTone(String status) {
    if ("pending".equals(status)) return UiKit.WARNING;
    if ("approved".equals(status) || "completed".equals(status)) return UiKit.SUCCESS;
    if ("rejected".equals(status) || "cancelled".equals(status)) return UiKit.DANGER;
    return UiKit.MUTED;
  }

  private int resourceTone(String status) {
    if ("available".equals(status)) return UiKit.SUCCESS;
    if ("occupied".equals(status)) return UiKit.INFO;
    if ("reserved".equals(status) || "bill_waiting".equals(status)) return UiKit.WARNING;
    if ("maintenance".equals(status)) return UiKit.DANGER;
    return UiKit.MUTED;
  }

  private int taskTone(String status) {
    if ("done".equals(status)) return UiKit.SUCCESS;
    if ("cancelled".equals(status)) return UiKit.DANGER;
    return UiKit.WARNING;
  }

  private int orderTone(String status) {
    if ("payment".equals(status)) return UiKit.WARNING;
    if ("served".equals(status)) return UiKit.SUCCESS;
    if ("preparing".equals(status)) return UiKit.ACCENT;
    return UiKit.INFO;
  }

  private String formatStockStatus(String status) {
    if ("out_of_stock".equals(status)) return "Stokta yok";
    if ("low_stock".equals(status)) return "Az stok";
    return "Stokta var";
  }

  private int stockTone(String status) {
    if ("out_of_stock".equals(status)) return UiKit.DANGER;
    if ("low_stock".equals(status)) return UiKit.WARNING;
    return UiKit.SUCCESS;
  }

  private String stockNumber(double value) {
    if (Math.rint(value) == value) {
      return String.valueOf((long) value);
    }
    return String.format(new Locale("tr", "TR"), "%.2f", value).replaceAll("0+$", "").replaceAll("[,\\.]$", "");
  }

  private String stockUnitLabel(String unit) {
    return "gram".equals(unit) ? "gram" : "adet";
  }

  private String stockQuantity(double value, String unit) {
    return stockNumber(value) + ("gram".equals(unit) ? " g" : " adet");
  }

  private OperationData.TrackedStockItem trackedStockItem(String menuItemId) {
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      if (item.menuItemId.equals(menuItemId)) {
        return item;
      }
    }
    return null;
  }

  private int actionTone(String status) {
    if ("applied".equals(status)) return UiKit.SUCCESS;
    if ("failed".equals(status)) return UiKit.DANGER;
    return UiKit.WARNING;
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

  private static final class ActionSpec {
    final String id;
    final String type;
    final JSONObject payload;

    ActionSpec(String type, JSONObject payload) {
      this.id = ActionOutbox.createActionId();
      this.type = type;
      this.payload = payload;
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

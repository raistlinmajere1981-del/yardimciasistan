package com.yardimciasistan.android;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.ActivityResultRegistry;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Camera permission/capture lifecycle and cash scanner feedback, without product/domain routing. */
final class MarketBarcodeFlow {
  interface Listener {
    void onBarcode(String barcode, String purpose);
    boolean onCashBarcode(String barcode, JSONObject payload);
  }
  private final Context context;
  private final ComponentActivity activity;
  private final ActivityResultLauncher<String> cameraPermissionLauncher;
  private final MarketFormUi ui;
  private final Listener listener;
  private final Runnable close;
  private final MarketUiRules.BarcodeScanCapture barcodeScanCapture =
      new MarketUiRules.BarcodeScanCapture(MarketUiRules.BARCODE_DEBOUNCE_MS);
  private String cashBarcodeLast = "";
  private String cashBarcodeStatus = "Kamera hazır";
  private TextView cashBarcodeLastView;
  private TextView cashBarcodeStatusView;
  private String pendingCameraPurpose = "";
  private boolean pendingCameraContinuous;
  private boolean cameraPermissionRequestInFlight;

  MarketBarcodeFlow(Context context, MarketFormUi ui, Listener listener, Runnable close) {
    this(context, ui, listener, close, context instanceof ComponentActivity
        ? ((ComponentActivity) context).getActivityResultRegistry() : null);
  }

  MarketBarcodeFlow(Context context, MarketFormUi ui, Listener listener, Runnable close, ActivityResultRegistry registry) {
    this.context = context; this.ui = ui; this.listener = listener; this.close = close;
    this.activity = context instanceof ComponentActivity ? (ComponentActivity) context : null;
    this.cameraPermissionLauncher = activity == null
        ? null
        : activity.registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            registry,
            granted -> {
              cameraPermissionRequestInFlight = false;
              String purpose = pendingCameraPurpose;
              boolean continuous = pendingCameraContinuous;
              pendingCameraPurpose = "";
              pendingCameraContinuous = false;
              if (Boolean.TRUE.equals(granted)) {
                launchCameraScanner(purpose, continuous);
              } else {
                Toast.makeText(
                    context,
                    "Kamera izni verilmedi. Barkodu elle girebilirsiniz.",
                    Toast.LENGTH_SHORT
                ).show();
                showManualBarcodeEntry(purpose);
              }
            }
        );
  }
  LinearLayout cashBarcodeScreen() {
    LinearLayout page = UiKit.column(context);
    page.addView(UiKit.eyebrow(context, "KASA BARKOD MODU"));
    TextView title = UiKit.title(context, "Telefon barkod okuyucu");
    LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-1, -2);
    titleParams.setMargins(0, ui.dp(3), 0, ui.dp(5));
    title.setLayoutParams(titleParams);
    page.addView(title);
    TextView description = UiKit.text(
        context,
        "Kamera barkodu gördüğünde tarama otomatik olarak masaüstü Hızlı Satış ekranına gönderilir.",
        13,
        UiKit.SECONDARY,
        Typeface.NORMAL
    );
    LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(-1, -2);
    descriptionParams.setMargins(0, 0, 0, ui.dp(12));
    description.setLayoutParams(descriptionParams);
    page.addView(description);

    LinearLayout statusCard = UiKit.card(context);
    statusCard.addView(UiKit.text(context, "Son taranan", 11, UiKit.MUTED, Typeface.BOLD));
    cashBarcodeLastView = UiKit.text(
        context,
        cashBarcodeLast.isEmpty() ? "Henüz barkod okutulmadı" : cashBarcodeLast,
        19,
        UiKit.TEXT,
        Typeface.BOLD
    );
    statusCard.addView(cashBarcodeLastView);
    cashBarcodeStatusView = UiKit.text(context, cashBarcodeStatus, 13, UiKit.SUCCESS, Typeface.BOLD);
    statusCard.addView(cashBarcodeStatusView);
    page.addView(statusCard);

    Button camera = UiKit.button(context, "Kamerayı Aç", UiKit.PRIMARY,
        view -> requestCameraScanner(MarketWorkspace.PURPOSE_CASH, true));
    ui.sizeButton(camera, 52, 12, 8);
    page.addView(camera);

    Button manual = UiKit.outlineButton(context, "Barkodu Elle Gir",
        view -> showManualBarcodeEntry(MarketWorkspace.PURPOSE_CASH));
    ui.sizeButton(manual, 48, 0, 12);
    page.addView(manual);

    TextView transport = UiKit.text(
        context,
        "Tarama otomatik gönderilir; ürün ve ödeme masaüstünde çözülür. Aynı barkod kamerada tutulduğunda tekrar eklenmez; yeniden okutmak için barkodu kadrajdan çıkarıp tekrar gösterin.",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    );
    LinearLayout.LayoutParams transportParams = new LinearLayout.LayoutParams(-1, -2);
    transportParams.setMargins(0, 0, 0, ui.dp(14));
    transport.setLayoutParams(transportParams);
    page.addView(transport);

    Button close = UiKit.outlineButton(context, "Modu Kapat", view -> {
      this.close.run();
    });
    ui.sizeButton(close, 50, 0, 0);
    page.addView(close);
    return page;
  }

  void captureCashBarcode(String rawBarcode) {
    String barcode = MarketUiRules.normalizeBarcodeIdentity(rawBarcode);
    try {
      JSONObject payload = barcodeScanCapture.capture(
          barcode,
          System.currentTimeMillis(),
          isoTimestamp()
      );
      if (payload == null) {
        cashBarcodeStatus = "Aynı barkod kısa süre önce okundu.";
        updateCashBarcodeViews();
        return;
      }
      cashBarcodeLast = payload.optString("barcode", barcode);
      cashBarcodeStatus = "Gönderiliyor";
      updateCashBarcodeViews();
      boolean persisted = listener.onCashBarcode(cashBarcodeLast, payload);
      if (!persisted) {
        cashBarcodeStatus = "Gönderilemedi";
        updateCashBarcodeViews();
      }
    } catch (MarketUiRules.ValidationException error) {
      cashBarcodeStatus = error.getMessage();
      updateCashBarcodeViews();
    }
  }

  private void updateCashBarcodeViews() {
    if (cashBarcodeLastView != null) {
      cashBarcodeLastView.setText(cashBarcodeLast.isEmpty() ? "Henüz barkod okutulmadı" : cashBarcodeLast);
    }
    if (cashBarcodeStatusView != null) cashBarcodeStatusView.setText(cashBarcodeStatus);
  }

  private String isoTimestamp() {
    SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
    format.setTimeZone(TimeZone.getTimeZone("UTC"));
    return format.format(new Date());
  }

  void requestCameraScanner(String purpose, boolean continuous) {
    if (activity == null || cameraPermissionLauncher == null) {
      showManualBarcodeEntry(purpose);
      return;
    }
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
        == PackageManager.PERMISSION_GRANTED) {
      launchCameraScanner(purpose, continuous);
      return;
    }
    if (cameraPermissionRequestInFlight) return;
    pendingCameraPurpose = purpose;
    pendingCameraContinuous = continuous;
    cameraPermissionRequestInFlight = true;
    cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
  }

  private void launchCameraScanner(String purpose, boolean continuous) {
    if (activity == null || purpose == null || purpose.isEmpty()) return;
    String title = MarketWorkspace.PURPOSE_CASH.equals(purpose)
        ? "Kasa Barkod Okuyucu"
        : MarketWorkspace.PURPOSE_PRODUCT_CREATE.equals(purpose)
          ? "Yeni ürün barkodu"
          : "Barkod Tara";
    BarcodeCameraScanner.show(activity, title, continuous, new BarcodeCameraScanner.Listener() {
      @Override
      public void onBarcode(String barcode) {
        listener.onBarcode(barcode, purpose);
      }

      @Override
      public void onManualEntry() {
        showManualBarcodeEntry(purpose);
      }

      @Override
      public void onError(String message) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show();
      }
    });
  }

  void showManualBarcodeEntry(String purpose) {
    boolean directCreate = MarketWorkspace.PURPOSE_PRODUCT_CREATE.equals(purpose);
    boolean cashMode = MarketWorkspace.PURPOSE_CASH.equals(purpose);
    LinearLayout form = ui.dialogForm();
    TextView help = UiKit.text(
        context,
        cashMode
            ? "Kamera yerine barkodu elle girip masaüstüne gönderebilirsiniz."
            : directCreate
              ? "Yeni ürünün barkodunu elle girin."
              : "Barkodu elle girin.",
        12,
        UiKit.SECONDARY,
        Typeface.NORMAL
    );
    form.addView(help);
    EditText barcode = UiKit.labeledInput(context, form, "Barkod", "Barkodu girin");
    barcode.setInputType(InputType.TYPE_CLASS_TEXT);
    barcode.addTextChangedListener(ui.watcher(value -> {
      String normalized = MarketUiRules.normalizeBarcodeIdentity(value);
      if (!normalized.equals(value)) {
        barcode.setText(normalized);
        barcode.setSelection(normalized.length());
      }
    }));
    TextView status = ui.statusText();
    form.addView(status);
    AlertDialog dialog = new AlertDialog.Builder(context)
        .setTitle(cashMode ? "Kasa barkodu" : directCreate ? "Yeni ürün barkodu" : "Barkod Gir")
        .setView(form)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton(cashMode ? "Gönder" : directCreate ? "Devam Et" : "Bul", null)
        .create();
    dialog.setOnShowListener(ignored -> {
      Button positive = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
      Runnable submit = () -> {
        String raw = MarketUiRules.normalizeBarcodeIdentity(ui.value(barcode));
        if (raw.length() < 3) {
          status.setText(R.string.barcode_invalid);
          return;
        }
        dialog.dismiss();
        listener.onBarcode(raw, purpose);
      };
      positive.setOnClickListener(view -> submit.run());
      barcode.setOnEditorActionListener((view, actionId, event) -> {
        submit.run();
        return true;
      });
      barcode.requestFocus();
    });
    dialog.show();
  }

  void onScanFeedback(String barcode, String message) {
    if (!barcode.equals(cashBarcodeLast)) return;
    cashBarcodeStatus = message;
    updateCashBarcodeViews();
  }
}

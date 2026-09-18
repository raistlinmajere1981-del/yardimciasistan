package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.graphics.Color;
import android.media.Image;
import android.os.SystemClock;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * CameraX + bundled ML Kit barcode scanner used by every Market camera entry point.
 * Detection stays on-device; only the decoded barcode string leaves this surface.
 */
final class BarcodeCameraScanner {
  interface Listener {
    void onBarcode(String barcode);
    void onManualEntry();
    void onError(String message);
  }

  private static final long CAMERA_REARM_GAP_MS = 850L;

  private final ComponentActivity activity;
  private final boolean continuous;
  private final Listener listener;
  private final PreviewView previewView;
  private final TextView statusView;
  private final ExecutorService analyzerExecutor = Executors.newSingleThreadExecutor();
  private final AtomicBoolean processingFrame = new AtomicBoolean(false);
  private final MarketUiRules.BarcodeCameraGate cameraGate =
      new MarketUiRules.BarcodeCameraGate(CAMERA_REARM_GAP_MS);
  private final BarcodeScanner barcodeScanner;
  private final AlertDialog dialog;

  private ProcessCameraProvider cameraProvider;
  private boolean closed;
  private boolean analyzerErrorReported;

  private BarcodeCameraScanner(
      ComponentActivity activity,
      String title,
      boolean continuous,
      Listener listener
  ) {
    this.activity = activity;
    this.continuous = continuous;
    this.listener = listener;

    BarcodeScannerOptions options = new BarcodeScannerOptions.Builder()
        .setBarcodeFormats(
            Barcode.FORMAT_EAN_13,
            Barcode.FORMAT_EAN_8,
            Barcode.FORMAT_UPC_A,
            Barcode.FORMAT_UPC_E,
            Barcode.FORMAT_CODE_128,
            Barcode.FORMAT_CODE_39,
            Barcode.FORMAT_CODE_93,
            Barcode.FORMAT_ITF,
            Barcode.FORMAT_CODABAR
        )
        .build();
    barcodeScanner = BarcodeScanning.getClient(options);

    LinearLayout root = UiKit.column(activity);
    root.setPadding(UiKit.dp(activity, 12), UiKit.dp(activity, 8), UiKit.dp(activity, 12), UiKit.dp(activity, 4));

    FrameLayout cameraFrame = new FrameLayout(activity);
    cameraFrame.setBackgroundColor(Color.BLACK);
    LinearLayout.LayoutParams cameraParams = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        UiKit.dp(activity, 360)
    );
    cameraParams.setMargins(0, 0, 0, UiKit.dp(activity, 10));
    cameraFrame.setLayoutParams(cameraParams);

    previewView = new PreviewView(activity);
    previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
    previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
    cameraFrame.addView(previewView, new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
    ));

    View guide = new View(activity);
    guide.setBackground(UiKit.rounded(
        activity,
        UiKit.withAlpha(Color.TRANSPARENT, 0),
        UiKit.withAlpha(UiKit.SUCCESS, 210),
        12
    ));
    FrameLayout.LayoutParams guideParams = new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        UiKit.dp(activity, 110)
    );
    guideParams.setMargins(
        UiKit.dp(activity, 26),
        UiKit.dp(activity, 125),
        UiKit.dp(activity, 26),
        0
    );
    cameraFrame.addView(guide, guideParams);
    root.addView(cameraFrame);

    statusView = UiKit.text(
        activity,
        continuous
            ? "Kamerayı ürün barkoduna doğrultun. Okunan ürünler masaüstüne otomatik gönderilir."
            : "Kamerayı barkoda doğrultun. Barkod algılandığında otomatik devam edilir.",
        12,
        UiKit.SECONDARY,
        android.graphics.Typeface.NORMAL
    );
    root.addView(statusView);

    dialog = new AlertDialog.Builder(activity)
        .setTitle(title)
        .setView(root)
        .setNeutralButton("Elle Gir", null)
        .setNegativeButton("Kapat", null)
        .create();

    dialog.setOnShowListener(ignored -> {
      dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(view -> {
        close();
        listener.onManualEntry();
      });
      startCamera();
    });
    dialog.setOnDismissListener(ignored -> closeResources());
  }

  static void show(
      ComponentActivity activity,
      String title,
      boolean continuous,
      Listener listener
  ) {
    BarcodeCameraScanner scanner = new BarcodeCameraScanner(activity, title, continuous, listener);
    scanner.dialog.show();
  }

  private void startCamera() {
    ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(activity);
    future.addListener(() -> {
      if (closed) return;
      try {
        cameraProvider = future.get();
        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        ImageAnalysis analysis = new ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build();
        analysis.setAnalyzer(analyzerExecutor, this::analyzeFrame);

        cameraProvider.unbindAll();
        cameraProvider.bindToLifecycle(
            activity,
            CameraSelector.DEFAULT_BACK_CAMERA,
            preview,
            analysis
        );
      } catch (Exception error) {
        reportError("Kamera başlatılamadı. Barkodu elle girebilirsiniz.");
      }
    }, ContextCompat.getMainExecutor(activity));
  }

  @ExperimentalGetImage
  private void analyzeFrame(ImageProxy imageProxy) {
    if (closed || !processingFrame.compareAndSet(false, true)) {
      imageProxy.close();
      return;
    }

    Image mediaImage = imageProxy.getImage();
    if (mediaImage == null) {
      processingFrame.set(false);
      imageProxy.close();
      return;
    }

    InputImage image = InputImage.fromMediaImage(
        mediaImage,
        imageProxy.getImageInfo().getRotationDegrees()
    );

    barcodeScanner.process(image)
        .addOnSuccessListener(this::handleBarcodes)
        .addOnFailureListener(error -> {
          if (!analyzerErrorReported) {
            analyzerErrorReported = true;
            reportError("Barkod kamerası görüntüyü okuyamadı.");
          }
        })
        .addOnCompleteListener(task -> {
          processingFrame.set(false);
          imageProxy.close();
        });
  }

  private void handleBarcodes(List<Barcode> barcodes) {
    if (closed) return;
    String observed = "";
    for (Barcode barcode : barcodes) {
      String value = barcode.getRawValue();
      if (value == null) continue;
      value = value.trim();
      if (value.length() >= 3) {
        observed = value;
        break;
      }
    }

    String emitted = cameraGate.observe(observed, SystemClock.elapsedRealtime());
    if (emitted.isEmpty()) return;

    activity.runOnUiThread(() -> {
      if (closed) return;
      statusView.setText(continuous
          ? "Okundu: " + emitted + " · sonraki ürün için kamerayı yeni barkoda doğrultun."
          : "Okundu: " + emitted);
      previewView.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
      listener.onBarcode(emitted);
      if (!continuous) {
        dialog.dismiss();
      }
    });
  }

  private void reportError(String message) {
    activity.runOnUiThread(() -> {
      if (closed) return;
      statusView.setText(message);
      listener.onError(message);
    });
  }

  private void close() {
    if (!dialog.isShowing()) {
      closeResources();
      return;
    }
    dialog.dismiss();
  }

  private void closeResources() {
    if (closed) return;
    closed = true;
    if (cameraProvider != null) {
      cameraProvider.unbindAll();
    }
    barcodeScanner.close();
    analyzerExecutor.shutdownNow();
  }
}

package com.yardimciasistan.android;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

import java.util.concurrent.ExecutorService;

/** User-initiated secure QR onboarding; v3 supplies endpoint and pinned identity. */
final class AndroidLocalPairingController {
  interface Listener {
    void onStarted();
    void onPaired(boolean approvalRequired);
    void onError(String message);
  }

  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final DeviceIdentity identity;
  private final LocalCompanionDiscovery discovery;
  private final ExecutorService executor;
  private final Listener listener;
  private final ActivityResultLauncher<String> cameraPermission;
  private String pendingQr = "";
  private boolean destroyed;

  AndroidLocalPairingController(ComponentActivity activity, SharedPreferences preferences,
      DeviceIdentity identity, LocalCompanionDiscovery discovery, ExecutorService executor, Listener listener) {
    this.activity = activity;
    this.preferences = preferences;
    this.identity = identity;
    this.discovery = discovery;
    this.executor = executor;
    this.listener = listener;
    cameraPermission = activity.registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
      if (granted) showScanner();
      else listener.onError("QR okutmak için kamera izni gerekli. İzin reddedildiyse telefonun uygulama ayarlarından açın.");
    });
  }

  void scan() {
    discovery.start();
    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
      showScanner();
    } else {
      cameraPermission.launch(Manifest.permission.CAMERA);
    }
  }

  private void showScanner() {
    BarcodeCameraScanner.showQr(activity, new BarcodeCameraScanner.Listener() {
      @Override public void onBarcode(String payload) {
        try {
          LocalPairingQr qr = LocalPairingQr.parse(payload);
          LocalCompanionPairingClient.assertTargetAvailable(preferences, identity,
              CompanionConnectionIdentity.localActionTargetKey(qr.desktopId));
          pendingQr = payload;
          listener.onStarted();
          // The QR supplies both endpoint and trust. Never persist an unverified
          // discovery/QR address over the currently paired reconnect endpoint.
          pairScannedQr();
        } catch (LocalCompanionPairingClient.PairingException error) {
          listener.onError(error.getMessage());
        }
      }
      @Override public void onManualEntry() { /* QR mode has no manual-secret surface. */ }
      @Override public void onError(String message) { listener.onError(message); }
    });
  }

  private void pairScannedQr() {
    if (destroyed || pendingQr.isEmpty()) return;
    String payload = pendingQr;
    pendingQr = "";
    executor.execute(() -> {
      try {
        LocalCompanionPairingClient.PairResult result = new LocalCompanionPairingClient()
            .pairWithQr(preferences, identity, payload);
        activity.runOnUiThread(() -> { if (!destroyed) listener.onPaired(result.approvalRequired); });
      } catch (LocalCompanionPairingClient.PairingException error) {
        activity.runOnUiThread(() -> { if (!destroyed) listener.onError(error.getMessage()); });
      }
    });
  }

  void destroy() {
    destroyed = true;
    pendingQr = "";
  }
}

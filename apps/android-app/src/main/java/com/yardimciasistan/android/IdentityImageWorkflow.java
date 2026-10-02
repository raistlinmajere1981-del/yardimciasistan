package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.Toast;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

final class IdentityImageWorkflow {
  interface Listener {
    OperationData currentData();
    void showError(String message);
  }

  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final DeviceIdentity identity;
  private final AndroidImageCaptureController imageCaptureController;
  private final IdentityImageAnalysisController analysisController;
  private final Listener listener;

  private CustomerFormDialog activeFormDialog;

  IdentityImageWorkflow(
      ComponentActivity activity,
      SharedPreferences preferences,
      DeviceIdentity identity,
      AndroidImageCaptureController imageCaptureController,
      IdentityImageAnalysisController analysisController,
      Listener listener
  ) {
    this.activity = activity;
    this.preferences = preferences;
    this.identity = identity;
    this.imageCaptureController = imageCaptureController;
    this.analysisController = analysisController;
    this.listener = listener;
  }

  void attachForm(CustomerFormDialog formDialog) {
    activeFormDialog = formDialog;
  }

  void onFormDismiss(CustomerFormDialog closedDialog) {
    if (activeFormDialog == closedDialog) {
      activeFormDialog = null;
    }
    cleanupPendingCameraFile();
  }

  void showSourceDialog() {
    OperationData data = listener.currentData();
    if (!data.isAdmin()
        || !data.hasPermission("customer.manage")
        || !AndroidUiRules.canUseAi(data)) {
      listener.showError("Kimlik görseli analizi yalnız yönetici cihazlarda kullanılabilir.");
      return;
    }

    new AlertDialog.Builder(activity)
        .setTitle("Kimlik görselinden doldur")
        .setMessage("Kimliğin ön veya arka yüzünü çekebilir ya da galeriden seçebilirsiniz. Görsel kalıcı saklanmaz.")
        .setNegativeButton("Vazgeç", null)
        .setNeutralButton("Galeriden Seç", (dialog, which) -> launchGallery())
        .setPositiveButton("Fotoğraf Çek", (dialog, which) -> launchCamera())
        .show();
  }

  void onImageSelected(Uri sourceUri) {
    CustomerFormDialog formDialog = activeFormDialog;
    if (formDialog == null || !formDialog.isShowing()) {
      cleanupPendingCameraFile();
      return;
    }

    OperationData data = listener.currentData();
    if (!AndroidUiRules.canUseAi(data)) {
      cleanupPendingCameraFile();
      formDialog.setStatus(
          "AI capability kapalı olduğu için kimlik analizi kullanılamıyor.",
          UiKit.DANGER
      );
      return;
    }

    String baseUrl = ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = ConnectionSettings.syncSecret(preferences);
    if (baseUrl.isEmpty() || syncSecret.isEmpty()) {
      cleanupPendingCameraFile();
      formDialog.setStatus(
          "Kimlik analizi için bağlantı ayarlarını tamamlayın.",
          UiKit.DANGER
      );
      return;
    }

    formDialog.setLoading(true);
    formDialog.setStatus("Kimlik görseli hazırlanıyor ve AI ile okunuyor…", UiKit.INFO);
    analysisController.analyze(
        sourceUri,
        baseUrl,
        syncSecret,
        identity,
        new IdentityImageAnalysisController.Listener() {
          @Override
          public void onSuccess(JSONObject analysis, String message) {
            if (activeFormDialog != formDialog || !formDialog.isShowing()) {
              return;
            }
            formDialog.applyIdentityAnalysis(analysis);
            formDialog.setLoading(false);
            formDialog.setStatus(message, UiKit.SUCCESS);
            Toast.makeText(
                activity,
                "Okunan alanları kaydetmeden önce kontrol edin.",
                Toast.LENGTH_LONG
            ).show();
          }

          @Override
          public void onError(String message) {
            if (activeFormDialog != formDialog || !formDialog.isShowing()) {
              return;
            }
            formDialog.setLoading(false);
            formDialog.setStatus(message, UiKit.DANGER);
          }

          @Override
          public void onFinished() {
            cleanupPendingCameraFile();
          }
        }
    );
  }

  private void launchCamera() {
    if (activeFormDialog != null && activeFormDialog.isShowing()) {
      imageCaptureController.launchIdentityCamera();
    }
  }

  private void launchGallery() {
    if (activeFormDialog != null && activeFormDialog.isShowing()) {
      imageCaptureController.launchIdentityGallery();
    }
  }

  private void cleanupPendingCameraFile() {
    imageCaptureController.cleanupIdentityCameraFile();
  }
}

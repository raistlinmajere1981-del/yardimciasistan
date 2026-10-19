package com.yardimciasistan.android;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.util.List;

final class AndroidImageCaptureController {
  interface Listener {
    void onStockImageSelected(Uri uri);
    void onIdentityImageSelected(Uri uri);
    void onError(String message);
  }

  private static final String[] IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"};

  private final ComponentActivity activity;
  private final Listener listener;
  private final ActivityResultLauncher<Uri> stockCameraLauncher;
  private final ActivityResultLauncher<String[]> stockGalleryLauncher;
  private final ActivityResultLauncher<Uri> identityCameraLauncher;
  private final ActivityResultLauncher<String[]> identityGalleryLauncher;
  private final ActivityResultLauncher<String> cameraPermissionLauncher;

  private Uri pendingStockCameraUri;
  private File pendingStockCameraFile;
  private Uri pendingIdentityCameraUri;
  private File pendingIdentityCameraFile;
  private String pendingCameraAction = "";

  AndroidImageCaptureController(ComponentActivity activity, Listener listener) {
    this.activity = activity;
    this.listener = listener;

    stockCameraLauncher = activity.registerForActivityResult(new VisibleCameraTakePicture(), success -> {
      Uri resultUri = pendingStockCameraUri;
      pendingStockCameraUri = null;
      if (Boolean.TRUE.equals(success) && resultUri != null) {
        listener.onStockImageSelected(resultUri);
      } else {
        cleanupStockCameraFile();
        Toast.makeText(activity, "Fotoğraf çekimi tamamlanmadı.", Toast.LENGTH_SHORT).show();
      }
    });

    stockGalleryLauncher = activity.registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
      if (uri == null) return;
      try {
        activity.getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
      } catch (SecurityException ignored) {
        // The picker grant remains valid for the immediate analysis flow.
      }
      listener.onStockImageSelected(uri);
    });

    identityCameraLauncher = activity.registerForActivityResult(new ActivityResultContracts.TakePicture(), success -> {
      Uri resultUri = pendingIdentityCameraUri;
      pendingIdentityCameraUri = null;
      if (Boolean.TRUE.equals(success) && resultUri != null) {
        listener.onIdentityImageSelected(resultUri);
      } else {
        cleanupIdentityCameraFile();
        Toast.makeText(activity, "Kimlik fotoğrafı çekimi tamamlanmadı.", Toast.LENGTH_SHORT).show();
      }
    });

    identityGalleryLauncher = activity.registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
      if (uri != null) listener.onIdentityImageSelected(uri);
    });

    cameraPermissionLauncher = activity.registerForActivityResult(
        new ActivityResultContracts.RequestPermission(),
        granted -> {
          String action = pendingCameraAction;
          pendingCameraAction = "";
          if (!Boolean.TRUE.equals(granted)) {
            listener.onError("Kamera izni verilmedi. Galeriden görsel seçebilirsiniz.");
            return;
          }
          if ("stock".equals(action)) {
            launchStockCameraGranted();
          } else if ("identity".equals(action)) {
            launchIdentityCameraGranted();
          }
        }
    );
  }

  void launchStockCamera() {
    if (!ensureCameraPermission("stock")) return;
    launchStockCameraGranted();
  }

  private void launchStockCameraGranted() {
    try {
      cleanupStockCameraFile();
      pendingStockCameraFile = createCameraFile("camera-");
      pendingStockCameraUri = fileUri(pendingStockCameraFile);
      stockCameraLauncher.launch(pendingStockCameraUri);
    } catch (android.content.ActivityNotFoundException error) {
      cleanupStockCameraFile();
      listener.onError("Sistem kamera uygulaması bulunamadı. Galeriden görsel seçebilirsiniz.");
    } catch (Exception error) {
      cleanupStockCameraFile();
      listener.onError("Kamera için güvenli geçici dosya hazırlanamadı.");
    }
  }

  void launchStockGallery() {
    try {
      stockGalleryLauncher.launch(IMAGE_MIME_TYPES);
    } catch (android.content.ActivityNotFoundException error) {
      listener.onError("Sistem fotoğraf seçicisi açılamadı.");
    }
  }

  void launchIdentityCamera() {
    if (!ensureCameraPermission("identity")) return;
    launchIdentityCameraGranted();
  }

  private void launchIdentityCameraGranted() {
    try {
      cleanupIdentityCameraFile();
      pendingIdentityCameraFile = createCameraFile("identity-camera-");
      pendingIdentityCameraUri = fileUri(pendingIdentityCameraFile);
      identityCameraLauncher.launch(pendingIdentityCameraUri);
    } catch (android.content.ActivityNotFoundException error) {
      cleanupIdentityCameraFile();
      listener.onError("Sistem kamera uygulaması bulunamadı. Galeriden görsel seçebilirsiniz.");
    } catch (Exception error) {
      cleanupIdentityCameraFile();
      listener.onError("Kimlik kamerası için güvenli geçici dosya hazırlanamadı.");
    }
  }

  void launchIdentityGallery() {
    try {
      identityGalleryLauncher.launch(IMAGE_MIME_TYPES);
    } catch (android.content.ActivityNotFoundException error) {
      listener.onError("Sistem fotoğraf seçicisi açılamadı.");
    }
  }

  private boolean ensureCameraPermission(String action) {
    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA)
        == PackageManager.PERMISSION_GRANTED) {
      return true;
    }
    pendingCameraAction = action;
    cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
    return false;
  }

  void cleanupStockCameraFile() {
    if (pendingStockCameraFile != null && pendingStockCameraFile.isFile()) {
      pendingStockCameraFile.delete();
    }
    pendingStockCameraFile = null;
  }

  void cleanupIdentityCameraFile() {
    if (pendingIdentityCameraFile != null && pendingIdentityCameraFile.isFile()) {
      pendingIdentityCameraFile.delete();
    }
    pendingIdentityCameraFile = null;
  }

  void destroy() {
    cleanupStockCameraFile();
    cleanupIdentityCameraFile();
    pendingStockCameraUri = null;
    pendingIdentityCameraUri = null;
    pendingCameraAction = "";
  }

  private File createCameraFile(String prefix) throws Exception {
    File directory = new File(activity.getCacheDir(), "stock-images");
    if ((!directory.isDirectory() && !directory.mkdirs()) || !directory.isDirectory()) {
      throw new IllegalStateException("cache_missing");
    }
    return File.createTempFile(prefix, ".jpg", directory);
  }

  private Uri fileUri(File file) {
    return FileProvider.getUriForFile(
        activity,
        activity.getPackageName() + ".fileprovider",
        file
    );
  }

  static final class VisibleCameraTakePicture extends ActivityResultContracts.TakePicture {
    @Override
    public Intent createIntent(Context context, Uri input) {
      Intent intent = super.createIntent(context, input);
      PackageManager packageManager = context.getPackageManager();
      if (intent.resolveActivity(packageManager) != null) {
        return intent;
      }

      // The manifest declares this IMAGE_CAPTURE intent in <queries>, including
      // on Android 11+. Enumerating installed apps cannot bypass visibility.
      // Keep the explicit-handler fallback, scoped to compatible camera apps.
      List<ResolveInfo> handlers = packageManager.queryIntentActivities(
          intent, PackageManager.MATCH_DEFAULT_ONLY);
      for (ResolveInfo handler : handlers) {
        if (handler.activityInfo == null || !handler.activityInfo.enabled || !handler.activityInfo.exported) {
          continue;
        }
        intent.setComponent(new ComponentName(handler.activityInfo.packageName, handler.activityInfo.name));
        return intent;
      }
      return intent;
    }
  }
}

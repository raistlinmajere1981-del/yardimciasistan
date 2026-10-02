package com.yardimciasistan.android;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
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

  private Uri pendingStockCameraUri;
  private File pendingStockCameraFile;
  private Uri pendingIdentityCameraUri;
  private File pendingIdentityCameraFile;

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
  }

  void launchStockCamera() {
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

  private static final class VisibleCameraTakePicture extends ActivityResultContracts.TakePicture {
    @Override
    public Intent createIntent(Context context, Uri input) {
      Intent intent = super.createIntent(context, input);
      PackageManager packageManager = context.getPackageManager();
      if (intent.resolveActivity(packageManager) != null) {
        return intent;
      }

      // Android 11+ can hide compatible camera handlers from an implicit query.
      for (ApplicationInfo application : packageManager.getInstalledApplications(PackageManager.MATCH_ALL)) {
        Intent packageIntent = new Intent(intent).setPackage(application.packageName);
        List<ResolveInfo> handlers = packageManager.queryIntentActivities(
            packageIntent,
            PackageManager.MATCH_DEFAULT_ONLY
        );
        if (handlers.isEmpty()) continue;
        ResolveInfo handler = handlers.get(0);
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

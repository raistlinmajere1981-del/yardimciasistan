package com.yardimciasistan.dealer;

import android.graphics.Bitmap;
import android.os.Bundle;
import androidx.activity.ComponentActivity;
import java.io.File;
import java.io.FileOutputStream;
import org.json.JSONObject;

/** Debug-only, non-exported device harness. Does not read dealer accounts/catalog/orders. */
public final class InspectorHarnessActivity extends ComponentActivity {
  DealerPhotoViewer viewer;
  DealerImages images;
  File fixture;
  @Override public void onCreate(Bundle saved) {
    super.onCreate(saved);
    getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        | android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
        | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
    try {
      images = new DealerImages(this);
      viewer = new DealerPhotoViewer(this, images, this::finish, saved);
      String url = "https://inspector-fixture.example/device-v2.png";
      fixture = images.cacheFile(url);
      Bitmap image = Bitmap.createBitmap(800, 600, Bitmap.Config.ARGB_8888);
      int[] pixels = new int[800 * 600];
      for (int y = 0; y < 600; y++) for (int x = 0; x < 800; x++) pixels[y * 800 + x] = 0xff000000 | ((x % 256) << 16) | ((y % 256) << 8) | ((x + y) % 256);
      image.setPixels(pixels, 0, 800, 0, 0, 800, 600);
      try (FileOutputStream out = new FileOutputStream(fixture)) { image.compress(Bitmap.CompressFormat.PNG, 100, out); }
      image.recycle();
      viewer.open(new JSONObject().put("name", "Cihaz testi").put("image_url", url));
    } catch (Exception error) { throw new IllegalStateException(error); }
  }
  @Override public void onSaveInstanceState(Bundle out) { if (viewer != null) viewer.save(out); super.onSaveInstanceState(out); }
  @Override public void onDestroy() {
    if (viewer != null) viewer.destroy(false);
    if (images != null) images.close();
    if (fixture != null) fixture.delete();
    super.onDestroy();
  }
}

package com.yardimciasistan.android;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.MotionEvent;
import androidx.core.content.FileProvider;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;

/** Resource/intent/disk contracts in the disposable fixture package; never contacts Hosting. */
final class LintBehaviorFixture {
  static void exercise(Activity activity) {
    require(activity.getPackageName().endsWith(".uifamily"), "isolated package required");
    Locale previous = Locale.getDefault();
    try {
      Locale.setDefault(Locale.US);
      Configuration config = new Configuration(activity.getResources().getConfiguration());
      config.setLocale(Locale.forLanguageTag("tr-TR"));
      Context turkish = activity.createConfigurationContext(config);
      require(turkish.getString(R.string.speech_range_value, "Hız", 1.25f).equals("Hız · 1,25"),
          "decimal formatting follows UI locale, not process default");
      require(turkish.getString(R.string.stock_image_review_summary,
          turkish.getResources().getQuantityString(R.plurals.stock_image_row_count, 2, 2), "1,5 kg",
          turkish.getResources().getQuantityString(R.plurals.stock_image_review_count, 1, 1))
          .equals("2 satır · 1,5 kg · 1 kontrol gerekli"), "stock summary placeholders");
      require(turkish.getString(R.string.task_confirm_delete_hint)
          .equals("Bu günlük işi silmek için 'Silmeyi Onayla' seçin."), "resource apostrophes preserved");
      require(turkish.getString(R.string.reservation_labeled_value, "Barkod", "0012345678905")
          .equals("Barkod\n0012345678905"), "opaque values preserve leading zeros and line break");
      config.setLocale(Locale.US);
      require(activity.createConfigurationContext(config).getString(R.string.speech_range_value, "Hız", 1.25f)
          .equals("Hız · 1.25"), "decimal formatting follows changed UI locale");
    } finally {
      Locale.setDefault(previous);
    }

    // The former unqualified PNG was treated as mdpi. Adaptive icon layers fill
    // their bounds: nodpi must render identically despite the intrinsic density change.
    Bitmap original = BitmapFactory.decodeResource(activity.getResources(), R.drawable.ic_launcher_foreground);
    original.setDensity(160);
    Drawable baseline = new AdaptiveIconDrawable(new ColorDrawable(Color.TRANSPARENT),
        new BitmapDrawable(activity.getResources(), original));
    Drawable current = activity.getDrawable(R.mipmap.ic_launcher);
    for (int size : new int[] {48, 96, 144, 192}) {
      Bitmap before = render(baseline, size), after = render(current, size);
      require(before.sameAs(after), "launcher appearance preserved at " + size + "px");
      before.recycle(); after.recycle();
    }
    original.recycle();

    File image = null;
    String preferenceName = "lint_behavior_fixture";
    SharedPreferences preferences = activity.getSharedPreferences(preferenceName, Context.MODE_PRIVATE);
    require(preferences.edit().clear().commit(), "clean fixture storage");
    try {
      File directory = new File(activity.getCacheDir(), "stock-images");
      require(directory.isDirectory() || directory.mkdirs(), "camera cache directory");
      image = File.createTempFile("lint-camera-", ".jpg", directory);
      Uri output = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", image);
      Intent capture = new AndroidImageCaptureController.VisibleCameraTakePicture().createIntent(activity, output);
      require(MediaStore.ACTION_IMAGE_CAPTURE.equals(capture.getAction()), "external camera action preserved");
      require(output.equals(capture.getParcelableExtra(MediaStore.EXTRA_OUTPUT)), "FileProvider output URI preserved");
      require("content".equals(output.getScheme()), "camera never receives a file URI");

      String target = "companion:https://fixture.invalid";
      ConnectionSettings.markHostingActionBarrier(preferences, target);
      require(ConnectionSettings.hasHostingActionBarrier(preferences, target), "same-target barrier active");
      require(!ConnectionSettings.hasHostingActionBarrier(preferences, target + "/other"), "barrier stays target scoped");
      require(disk(activity, preferenceName).contains(ConnectionSettings.KEY_HOSTING_ACTION_BARRIER_TARGET),
          "barrier is on disk when mark returns");
      ConnectionSettings.clearHostingActionBarrier(preferences, target + "/other");
      require(ConnectionSettings.hasHostingActionBarrier(preferences, target), "other target cannot clear barrier");
      ConnectionSettings.clearHostingActionBarrier(preferences, target);
      require(!disk(activity, preferenceName).contains(ConnectionSettings.KEY_HOSTING_ACTION_BARRIER_TARGET),
          "barrier removal is on disk when clear returns");

      OperationData data = new OperationData();
      data.deviceActive = true; data.permissionsResolved = true; data.capabilitiesResolved = true;
      data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ANDROID);
      data.businessCapabilities.add(AndroidUiRules.CAPABILITY_CUSTOMERS);
      data.businessCapabilities.add(AndroidUiRules.CAPABILITY_NOTIFICATIONS);
      data.permissions.add("customer.view");
      OperationData.RequestRecord request = new OperationData.RequestRecord();
      request.id = "lint-fixture-request"; request.status = "new"; data.requests.add(request);
      new LocalNotificationCenter(activity, preferences).processSnapshot(null, data);
      String ledger = preferences.getString("notification_event_ledger_v1", "");
      require(ledger.contains("request:lint-fixture-request:new"), "initial notification baseline recorded");
      require(disk(activity, preferenceName).contains("request:lint-fixture-request:new"),
          "notification baseline persisted on disk");
      new LocalNotificationCenter(activity, preferences).processSnapshot(data, data);
      require(ledger.equals(preferences.getString("notification_event_ledger_v1", "")),
          "recreated notification center preserves baseline without duplicate event");

      int[] navigations = {0};
      AndroidRootSwipeLayout root = new AndroidRootSwipeLayout(activity, new AndroidRootSwipeLayout.Listener() {
        public boolean canSwipeRoot() { return true; }
        public void onRootSwipe(int direction) { navigations[0]++; }
      });
      require(!root.isClickable(), "swipe container has no fake click semantics");
      MotionEvent tap = MotionEvent.obtain(0, 0, MotionEvent.ACTION_DOWN, 100, 100, 0);
      try { require(!root.onTouchEvent(tap), "unclaimed tap remains available to normal navigation"); }
      finally { tap.recycle(); }
      require(navigations[0] == 0, "tap cannot cause directional navigation");
    } catch (Exception error) {
      throw new AssertionError("Lint behavior fixture failed", error);
    } finally {
      if (image != null) image.delete();
      require(preferences.edit().clear().commit(), "clear fixture storage only");
    }
  }

  private static String disk(Context context, String name) throws Exception {
    return new String(Files.readAllBytes(new File(context.getApplicationInfo().dataDir,
        "shared_prefs/" + name + ".xml").toPath()), StandardCharsets.UTF_8);
  }

  private static Bitmap render(Drawable drawable, int size) {
    Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
    drawable.setBounds(0, 0, size, size);
    drawable.draw(new Canvas(bitmap));
    return bitmap;
  }

  private static void require(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }
}

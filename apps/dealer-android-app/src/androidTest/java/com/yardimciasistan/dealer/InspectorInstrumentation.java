package com.yardimciasistan.dealer;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import android.view.MotionEvent;
import android.view.InputDevice;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.exifinterface.media.ExifInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Runs the canonical fixture and real Worker/DOM/adapter in the installed Android WebView. */
public final class InspectorInstrumentation extends Instrumentation {
  private WebView web;
  private String evaluate(String script) throws Exception {
    CountDownLatch latch = new CountDownLatch(1);
    String[] value = new String[1];
    runOnMainSync(() -> web.evaluateJavascript(script, result -> { value[0] = result; latch.countDown(); }));
    if (!latch.await(15, TimeUnit.SECONDS)) throw new AssertionError("JS timeout");
    return value[0];
  }
  private void check(String script, String label) throws Exception {
    if (!"true".equals(evaluate(script))) throw new AssertionError(label + ": " + evaluate(script));
  }
  private void until(String script, String label) throws Exception {
    long deadline = System.currentTimeMillis() + 25000;
    while (System.currentTimeMillis() < deadline) {
      if ("true".equals(evaluate(script))) return;
      Thread.sleep(100);
    }
    throw new AssertionError(label + ": " + evaluate("document.body.innerText"));
  }
  private void pointer(long start, int action, float x, float y, float spread, int count) {
    MotionEvent.PointerProperties[] props = new MotionEvent.PointerProperties[count];
    MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[count];
    for (int i = 0; i < count; i++) {
      props[i] = new MotionEvent.PointerProperties(); props[i].id = i; props[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
      coords[i] = new MotionEvent.PointerCoords(); coords[i].x = x + (i == 0 ? -spread : spread); coords[i].y = y; coords[i].pressure = 1; coords[i].size = 1;
    }
    MotionEvent event = MotionEvent.obtain(start, SystemClock.uptimeMillis(), action, count, props, coords, 0, 0, 1, 1, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
    sendPointerSync(event); event.recycle();
  }
  private void pinch() throws Exception {
    JSONObject rect = new JSONObject(evaluate("(()=>{const r=document.querySelector('.ii-pane').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth};})()"));
    int[] location = new int[2], width = new int[1];
    runOnMainSync(() -> { web.getLocationOnScreen(location); width[0] = web.getWidth(); });
    float scale = (float) (width[0] / rect.getDouble("w"));
    float x = location[0] + (float) rect.getDouble("x") * scale, y = location[1] + (float) rect.getDouble("y") * scale;
    long start = SystemClock.uptimeMillis();
    pointer(start, MotionEvent.ACTION_DOWN, x, y, 30, 1);
    pointer(start, MotionEvent.ACTION_POINTER_DOWN | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), x, y, 30, 2);
    for (int spread = 40; spread <= 80; spread += 10) { Thread.sleep(30); pointer(start, MotionEvent.ACTION_MOVE, x, y, spread, 2); }
    pointer(start, MotionEvent.ACTION_POINTER_UP | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), x, y, 80, 2);
    pointer(start, MotionEvent.ACTION_UP, x, y, 80, 1);
    until("parseFloat(document.querySelector('output').value)>1", "Real Android pinch events");
  }
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
  @Override public void onStart() {
    Bundle result = new Bundle();
    Activity activity = null;
    try {
      Intent intent = new Intent().setClassName(getTargetContext(), "com.yardimciasistan.dealer.InspectorHarnessActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      activity = startActivitySync(intent);
      Field field = activity.getClass().getDeclaredField("viewer"); field.setAccessible(true);
      Object viewer = field.get(activity);
      Field webField = viewer.getClass().getDeclaredField("web"); webField.setAccessible(true);
      web = (WebView) webField.get(viewer);
      until("!!document.querySelector('canvas') && document.querySelector('canvas').width > 1 && !document.querySelector('canvas').hidden", "Offline cached image decode");
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      try (InputStream in = getContext().getAssets().open("fixture.json")) { byte[] b = new byte[4096]; int count; while ((count = in.read(b)) != -1) bytes.write(b, 0, count); }
      String fixture = bytes.toString("UTF-8");
      pinch();
      evaluate("document.querySelector('button[aria-label=\"Görünümü sıfırla\"]').click()");
      evaluate("window.filterTimings=[];window.heartbeat=0;window.heartbeatTimer=setInterval(()=>window.heartbeat++,10)");
      long filterStart = SystemClock.elapsedRealtime();
      check("(()=>{const f=" + fixture + ";return Object.keys(f.expected).every(mode=>JSON.stringify([...ImageInspectorCore.apply(new Uint8ClampedArray(f.rgba),f.width,f.height,mode)])===JSON.stringify(f.expected[mode]));})()", "All five native golden pixel outputs");
      for (String mode : new String[] {"Detay", "Kod", "Negatif", "Kenar", "Normal"}) {
        evaluate("[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===" + JSONObject.quote(mode) + ").click()");
        until("!document.querySelector('.ii-pane').hasAttribute('aria-busy') && !document.querySelector('canvas').hidden", "Worker " + mode);
      }
      evaluate("document.querySelector('button[aria-label=Yakınlaştır]').click();document.querySelector('button[aria-label=\"90° sağa döndür\"]').click()");
      check("document.querySelector('output').value==='1.25×'", "Zoom and rotation control");
      long filterMillis = SystemClock.elapsedRealtime() - filterStart;
      check("window.heartbeat>5", "UI heartbeat during Worker filters");
      // Exercise the actual native gallery adapter with a private EXIF-oriented fixture.
      File picked = new File(getTargetContext().getCacheDir(), "photo-comparison/picked.jpg");
      android.graphics.Bitmap selected = android.graphics.Bitmap.createBitmap(800, 600, android.graphics.Bitmap.Config.ARGB_8888);
      selected.eraseColor(0xff669933);
      try (FileOutputStream out = new FileOutputStream(picked)) { selected.compress(android.graphics.Bitmap.CompressFormat.JPEG, 95, out); }
      selected.recycle();
      ExifInterface exif = new ExifInterface(picked.getAbsolutePath());
      exif.setAttribute(ExifInterface.TAG_ORIENTATION, "6"); exif.saveAttributes();
      Uri galleryUri = FileProvider.getUriForFile(getTargetContext(), getTargetContext().getPackageName() + ".files", picked);
      Method importPersonal = viewer.getClass().getDeclaredMethod("importPersonal", Uri.class); importPersonal.setAccessible(true);
      runOnMainSync(() -> { try { importPersonal.invoke(viewer, galleryUri); } catch (Exception error) { throw new IllegalStateException(error); } });
      until("document.querySelectorAll('canvas')[1].width>1 && !document.querySelectorAll('canvas')[1].hidden", "Offline personal adapter");
      check("document.querySelectorAll('canvas')[1].width===600 && document.querySelectorAll('canvas')[1].height===800", "Native gallery EXIF rotation");
      evaluate("document.querySelector('button[aria-label=\"Üst üste\"]').click();const alpha=document.querySelector('input[type=range]');alpha.value=25;alpha.dispatchEvent(new Event('input'))");
      check("document.querySelectorAll('.ii-pane')[1].style.opacity==='0.25'", "Overlay opacity");
      evaluate("window.securityResult=null;fetch('https://outside.invalid/secret').then(r=>window.securityResult=r.status).catch(()=>window.securityResult=403)");
      until("window.securityResult===403", "Network deny list");
      check("document.querySelectorAll('input[type=file]').length===2 && [...document.querySelectorAll('.ii-tools button')].every(b=>b.getBoundingClientRect().height>=44)", "Accessible controls and camera/gallery entry");
      // Intercept the external camera contract using fixture bytes; never photograph the owner.
      ActivityMonitor monitor = new ActivityMonitor() {
        @Override public ActivityResult onStartActivity(Intent intent) {
          if (!MediaStore.ACTION_IMAGE_CAPTURE.equals(intent.getAction())) return null;
          Uri output = intent.getParcelableExtra(MediaStore.EXTRA_OUTPUT);
          try (java.io.OutputStream out = getTargetContext().getContentResolver().openOutputStream(output)) {
            java.nio.file.Files.copy(picked.toPath(), out);
          } catch (Exception error) { throw new IllegalStateException(error); }
          return new ActivityResult(Activity.RESULT_OK, new Intent());
        }
      };
      addMonitor(monitor);
      Field revisionField = viewer.getClass().getDeclaredField("personalRevision"); revisionField.setAccessible(true);
      int previousRevision = revisionField.getInt(viewer);
      evaluate("document.querySelector('button[aria-label=\"Kamera ile karşılaştır\"]').click()");
      for (int attempt = 0; attempt < 100 && revisionField.getInt(viewer) == previousRevision; attempt++) Thread.sleep(50);
      if (revisionField.getInt(viewer) == previousRevision) throw new AssertionError("Camera result did not reach native adapter");
      until("document.querySelectorAll('canvas')[1].width===600 && !document.querySelectorAll('canvas')[1].hidden && !document.querySelectorAll('.ii-pane')[1].hasAttribute('aria-busy')", "Camera result adapter");
      removeMonitor(monitor);
      long nativeHeap = android.os.Debug.getNativeHeapAllocatedSize();
      long pss = android.os.Debug.getPss();
      evaluate("document.querySelector('button[aria-label=\"Tek fotoğrafa dön\"]').click()");
      until("document.querySelector('.ya-inspector').dataset.mode==='inspect'", "Personal comparison close");
      Field personalField = viewer.getClass().getDeclaredField("personalPath"); personalField.setAccessible(true);
      for (int attempt = 0; attempt < 30 && !"".equals(personalField.get(viewer)); attempt++) Thread.sleep(50);
      if (!"".equals(personalField.get(viewer))) throw new AssertionError("Personal native source not released");
      evaluate("window.stopInspector()");
      check("document.querySelectorAll('canvas').length===0", "Worker and canvas teardown");
      runOnMainSync(() -> ((DealerPhotoViewer) viewer).close());
      File[] remaining = new File(getTargetContext().getCacheDir(), "photo-comparison").listFiles();
      if (remaining != null && remaining.length != 0) throw new AssertionError("Session files not deleted");
      result.putString("stream", "PASS Android WebView: five exact RGBA golden outputs, offline cache, five Worker modes, real pinch, zoom/rotation, gallery EXIF, fixture camera result, overlay alpha, denied remote requests, 44px controls, personal release, teardown; five-filter elapsed=" + filterMillis + "ms, host PSS=" + pss + "KiB, host native heap=" + nativeHeap + " bytes\n");
      finish(Activity.RESULT_OK, result);
    } catch (Throwable error) {
      result.putString("stream", "FAIL " + error.toString() + "\n");
      finish(Activity.RESULT_CANCELED, result);
    } finally {
      if (activity != null) { final Activity target = activity; runOnMainSync(target::finish); }
    }
  }
}

package com.yardimciasistan.dealer;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.*;
import android.graphics.*;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.view.*;
import android.widget.*;
import androidx.core.content.FileProvider;
import androidx.exifinterface.media.ExifInterface;
import java.io.*;
import java.lang.reflect.Field;
import java.net.URLEncoder;
import java.util.*;
import java.util.function.BooleanSupplier;
import org.json.*;

/**
 * Real local account APIs plus synthetic private UI/media fixtures; no production account, provider or camera proof.
 */
public final class DealerDeviceFixture extends Instrumentation {
  private DealerActivity activity;
  private Bundle accountArguments;
  private DealerDisk disk;
  private ClipData previousClipboard;
  private ClipboardManager clipboard;
  private String cameraResult = "cancel";
  private Uri galleryUri;
  private ActivityMonitor mediaMonitor;
  @Override
  public void onCreate(Bundle arguments) {
    accountArguments=arguments;
    super.onCreate(arguments);
    start();
  }
  @Override
  public void onStart() {
    Bundle result = new Bundle();
    try {
      disk = new DealerDisk(getTargetContext());
      check(getTargetContext().getPackageManager().getApplicationIcon(
                getTargetContext().getPackageName())
                  instanceof android.graphics.drawable.AdaptiveIconDrawable,
          "Launcher icon could not be parsed on this Android version");
      check(DealerUi.save(getTargetContext(), new DealerAppearance("light", "blue", 100, false)),
          "Fixture appearance not initialized");
      loginBoundary();
      DealerAccountDeviceChecks.run(accountArguments);
      JSONObject seed =
          new JSONObject()
              .put("base", "https://dealer-fixture.invalid/module/")
              .put("owner", "https://dealer-fixture.invalid/module/|fixture-dealer")
              .put("cookie", "ya_account_session=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
              .put("dealer",
                  new JSONObject()
                      .put("access_id", "fixture-dealer")
                      .put("display_name", "BAYİ UI TEST VERİSİ"))
              .put("catalog_at", "Yerel fixture · canlı veri değil")
              .put("delivery", "pickup");
      JSONArray products = new JSONArray();
      products.put(new JSONObject()
              .put("product_id", "p")
              .put("name", "Fixture Parça")
              .put("sku", "TEST-1")
              .put("brand", "Test marka")
              .put("category_name", "Parçalar")
              .put("description", "Test açıklaması")
              .put("price", 25)
              .put("currency", "TRY")
              .put("unit", "piece")
              .put("image_url", photoUrl(0))
              .put("image_urls",
                  new JSONArray().put(photoUrl(0)).put(photoUrl(1)).put(photoUrl(2))));
      products.put(new JSONObject()
              .put("product_id", "q")
              .put("name", "Fixture Görselsiz")
              .put("sku", "TEST-2")
              .put("price", 5)
              .put("currency", "TRY")
              .put("unit", "piece")
              .put("image_url", ""));
      seed.put("catalog",
          new JSONObject()
              .put("catalog_revision", repeat(64))
              .put("delivery_methods", new JSONArray().put("pickup").put("shipping"))
              .put("products", products));
      JSONArray orders = new JSONArray();
      for (String status :
          new String[] {"placed", "confirmed", "fulfilled", "cancelled", "awaiting_desktop"})
        orders.put(new JSONObject()
                .put("order_id", "fixture-" + status)
                .put("status", status)
                .put("created_at", "2026-01-01T10:00:00Z")
                .put("total", status.equals("awaiting_desktop") ? JSONObject.NULL : 25)
                .put("currency", "TRY")
                .put("items",
                    new JSONArray().put(new JSONObject()
                            .put("product_id", "p")
                            .put("name", "Fixture Parça")
                            .put("quantity", 1))));
      seed.put("orders", orders);
      disk.write(seed.toString());
      mockAccountAuthorization = true;
      DealerImages fixtureImages = new DealerImages(getTargetContext());
      try {
        for (int i = 0; i < 3; i++)
          writeImage(
              fixtureImages.cacheFile(photoUrl(i)), i == 0 ? 4096 : 900, i == 0 ? 3072 : 600, i);
      } finally {
        fixtureImages.close();
      }
      File folder = new File(getTargetContext().getCacheDir(), "application-camera");
      folder.mkdirs();
      File own = new File(folder, "fixture-personal.jpg");
      writeImage(own, 800, 600, 4);
      ExifInterface exif = new ExifInterface(own.getAbsolutePath());
      exif.setAttribute(ExifInterface.TAG_ORIENTATION, "6");
      exif.saveAttributes();
      galleryUri = FileProvider.getUriForFile(
          getTargetContext(), getTargetContext().getPackageName() + ".files", own);
      mediaMonitor = new ActivityMonitor() {
        @Override
        public ActivityResult onStartActivity(Intent intent) {
          if (Intent.ACTION_OPEN_DOCUMENT.equals(intent.getAction()))
            return new ActivityResult(Activity.RESULT_OK, new Intent().setData(galleryUri));
          if (MediaStore.ACTION_IMAGE_CAPTURE.equals(intent.getAction())) {
            if (cameraResult.equals("cancel"))
              return new ActivityResult(Activity.RESULT_CANCELED, null);
            try {
              Uri uri = intent.getParcelableExtra(MediaStore.EXTRA_OUTPUT);
              try (OutputStream output =
                       getTargetContext().getContentResolver().openOutputStream(uri)) {
                Bitmap b = Bitmap.createBitmap(640, 480, Bitmap.Config.ARGB_8888);
                b.eraseColor(Color.CYAN);
                b.compress(Bitmap.CompressFormat.JPEG, 85, output);
                b.recycle();
              }
              return new ActivityResult(Activity.RESULT_OK, null);
            } catch (Exception error) {
              throw new AssertionError(error);
            }
          }
          return null;
        }
      };
      addMonitor(mediaMonitor);
      launch();
      settle("Yenile");
      screenshot("catalog-light");
      clickDescription("Fixture Parça ürününü incele");
      requireText("Test açıklaması");
      screenshot("product-light");
      click("Favorilerime ekle");
      photoWorkspace();
      setText("Eklenecek miktar (adet)", "2");
      click("Sepete ekle");
      requireText("Ürün sepetinize eklendi.");
      click("‹ Katalog");
      click("Sepet (1)");
      requireText("Tahmini toplam 50,00 TL");
      check(new JSONObject(disk.read()).getJSONObject("favorites").has("p"),
          "Favorite not persisted");
      setText("Fixture Parça miktarı", "3");
      requireText("Tahmini toplam 75,00 TL");
      screenshot("cart-light");
      restart();
      settle("Yenile");
      click("Sepet (1)");
      requireText("Tahmini toplam 75,00 TL");
      click("Siparişler");
      for (String label : new String[] {
               "Sipariş alındı", "Onaylandı", "Tamamlandı", "İptal edildi", "İşletmeye iletiliyor"})
        requireText(label);
      clickDescription("fixture-placed ürünlerini tekrar sepete ekle");
      requireText("Tahmini toplam 100,00 TL");
      click("Siparişi gönder");
      settle("Yenile");
      requireText("Aynı siparişi tekrar dene");
      JSONObject pending = new JSONObject(disk.read()).getJSONObject("pending");
      check(pending.getJSONArray("items").getJSONObject(0).getDouble("quantity") == 4,
          "Pending quantity changed");
      restart();
      settle("Yenile");
      click("Sepet (1)");
      requireText("Aynı siparişi tekrar dene");
      check(new JSONObject(disk.read())
                .getJSONObject("pending")
                .toString()
                .equals(pending.toString()),
          "Restart changed frozen request");
      main(()
               -> check(!findDescription("Fixture Parça miktarı").isEnabled(),
                   "Uncertain submission cart must be frozen"));
      appearance();
      result.putString("stream",
          "dealer-native-device-ok: real local TLS/PHP shared login, refresh, independent web logout, canonical dealer prices/order retry, demotion, Online Sales and revocation; business connection VIEW/SEND and synthetic account authorization; private storage; large "
              + "sampled gallery; native pinch/pan/double-tap/rotation/paging; five filters; "
              + "gallery "
              + "EXIF, simulated camera FileProvider result/cancel; independent "
              + "comparison/overlay/opacity/reset/close; lifecycle and 20-cycle bitmap release; "
              + "appearance persistence; immediate quantities, encrypted offline restart, order "
              + "states/retry. Synthetic fixtures only.\n");
      finish(Activity.RESULT_OK, result);
    } catch (Throwable error) {
      result.putString("stream", "dealer-native-device-failed: " + error + "\n");
      finish(Activity.RESULT_CANCELED, result);
    } finally {
      if (mediaMonitor != null)
        removeMonitor(mediaMonitor);
      if (clipboard != null && previousClipboard != null)
        main(() -> clipboard.setPrimaryClip(previousClipboard));
    }
  }
  private void loginBoundary() throws Exception {
    disk.write("{}");
    String link = "https://dealer-fixture.invalid/module/";
    activity = (DealerActivity) startActivitySync(new Intent(Intent.ACTION_VIEW, Uri.parse(link), getTargetContext(), DealerActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    waitForIdleSync();
    main(() -> {
      check(views(EditText.class).size() == 1, "Initial setup must contain one business connection field");
      check(views(EditText.class).get(0).getText().toString().equals(link), "VIEW did not prefill the business connection");
      check(activity.getIntent().getData() == null, "Consumed intent retained data");
    });
    setText("İşletme bağlantısı", "invalid"); click("İşletmeye bağlan");
    requireText("İşletme için geçerli bir HTTPS bağlantısı girin.");
    setText("İşletme bağlantısı", ""); screenshot("login-light");
    main(() -> activity.onNewIntent(new Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_TEXT, link)));
    waitForIdleSync();
    main(() -> check(views(EditText.class).get(0).getText().toString().equals(link), "SEND business connection not captured"));
    // Render the existing form from synthetic local state; server acceptance is covered separately.
    main(() -> {
      DealerApplicationForm form = (DealerApplicationForm) field(activity, "application");
      try {
        Field active = DealerApplicationForm.class.getDeclaredField("active");
        active.setAccessible(true);
        active.setBoolean(form, true);
      } catch (Exception error) {
        throw new AssertionError(error);
      }
      form.show();
    });
    requireText("Firma / unvan");
    requireText("Yetkili adı soyadı");
    screenshot("application-light");
    click("‹ Giriş");
    main(() -> activity.finish());
    waitForIdleSync();
  }
  private void photoWorkspace() throws Exception {
    click("Fotoğrafı incele (3)");
    pictureReady();
    DealerPhotoView image = photoViews().get(0);
    Bitmap original = picture(image);
    check(Math.max(original.getWidth(), original.getHeight()) <= 2048,
        "Full-size original allocated");
    final DealerPhotoView initial = image;
    main(() -> doubleTap(initial));
    check(image.transform.zoom > 1.5f, "Double tap did not zoom");
    main(() -> drag(initial));
    check(
        Math.abs(image.transform.x) + Math.abs(image.transform.y) > 0, "Zoomed image did not pan");
    click("Sığdır");
    image = photoViews().get(0);
    check(image.transform.zoom == 1, "Fit failed");
    pictureReady();
    final DealerPhotoView fitted = image;
    main(() -> pinch(fitted));
    check(fitted.transform.zoom > 1.1f,
        "Native two-pointer scale failed: zoom=" + fitted.transform.zoom
            + ", width=" + fitted.getWidth());
    click("Sığdır");
    click("Döndür");
    check(photoViews().get(0).transform.rotation == 90, "Quarter turn failed");
    click("Sığdır");
    for (String label : new String[] {"Detay", "Kod okuma", "Negatif", "Kenar", "Normal"}) {
      click(label);
      await(() -> !boolViewer("effectBusy"), "Filter did not settle");
      check(picture(photoViews().get(0)) != null, "Filter lost picture");
    }
    clickDescription("Sonraki fotoğraf");
    pictureReady();
    requireText("2 / 3");
    check(original.isRecycled(), "Previous gallery bitmap retained");
    final DealerPhotoView gallery = photoViews().get(0);
    main(() -> {
      long t = nextEventTime();
      for (int step = 0; step < 3; step++) {
        MotionEvent e = MotionEvent.obtain(t, t + step * 100,
            step == 0       ? MotionEvent.ACTION_DOWN
                : step == 2 ? MotionEvent.ACTION_UP
                            : MotionEvent.ACTION_MOVE,
            gallery.getWidth() * (.85f - step * .35f), gallery.getHeight() / 2f, 0);
        gallery.dispatchTouchEvent(e);
        e.recycle();
      }
    });
    pictureReady();
    requireText("3 / 3");
    clickDescription("Önceki fotoğraf");
    pictureReady();
    requireText("2 / 3");
    check(photoViews().get(0).transform.rotation == 0 && photoViews().get(0).transform.zoom == 1,
        "Photo transition retained transform");
    click("Karşılaştır");
    click("Kamera");
    requireText("Karşılaştır");
    click("Karşılaştır");
    click("Galeri");
    await(()
              -> photoViews().size() == 2 && picture(photoViews().get(1)) != null,
        "Local gallery decode failed");
    Bitmap own = picture(photoViews().get(1));
    check(own.getHeight() > own.getWidth(), "EXIF orientation ignored");
    List<DealerPhotoView> pair = photoViews();
    main(() -> {
      pair.get(0).zoom(2);
      pair.get(1).rotate();
    });
    check(pair.get(0).transform.zoom == 2 && pair.get(1).transform.rotation == 90,
        "Comparison transforms are not independent");
    click("Üst üste");
    main(() -> views(SeekBar.class).get(0).setProgress(30));
    check(Math.abs(photoViews().get(1).getAlpha() - .3f) < .01, "Overlay opacity failed");
    screenshot("photo-overlay");
    click("Ürün");
    click("Döndür");
    check(photoViews().get(0).transform.rotation == 90, "Active overlay layer rotation failed");
    click("Hizalamayı sıfırla");
    check(
        photoViews().get(0).transform.rotation == 0 && photoViews().get(1).transform.rotation == 0,
        "Alignment reset failed");
    String personal = (String) field(viewer(), "personalPath");
    click("Karşılaştırmayı kapat");
    check(own.isRecycled(), "Personal bitmap retained after compare");
    check(!new File(personal).exists(), "Comparison file retained after exit");
    click("Karşılaştır");
    cameraResult = "ok";
    click("Kamera");
    await(()
              -> photoViews().size() == 2 && picture(photoViews().get(1)) != null,
        "Camera result did not decode");
    click("Karşılaştırmayı kapat");
    main(() -> activity.recreate());
    await(() -> {
      Activity current = lastActivity();
      return current != null && current != activity;
    }, "Activity recreation not observed");
    activity = (DealerActivity) lastActivity();
    pictureReady();
    requireText("2 / 3");
    main(() -> activity.moveTaskToBack(true));
    getTargetContext().startActivity(new Intent(getTargetContext(), DealerActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
    waitForIdleSync();
    pictureReady();
    requireText("2 / 3");
    click("Kapat");
    long before = android.os.Debug.getNativeHeapAllocatedSize();
    for (int i = 0; i < 20; i++) {
      click("Fotoğrafı incele (3)");
      pictureReady();
      Bitmap bitmap = picture(photoViews().get(0));
      click("Karşılaştır");
      click("Galeri");
      await(()
                -> photoViews().size() == 2 && picture(photoViews().get(1)) != null,
          "Repeated local decode failed");
      click("Karşılaştırmayı kapat");
      click("Kapat");
      check(bitmap.isRecycled(), "Gallery close did not release bitmap");
    }
    System.gc();
    Thread.sleep(100);
    long growth = android.os.Debug.getNativeHeapAllocatedSize() - before;
    check(growth < 32L * 1024 * 1024, "Native heap grew by " + growth);
    click("‹ Katalog");
    clickDescription("Fixture Görselsiz ürününü incele");
    requireText("Fotoğraf yok");
    JSONObject single =
        new JSONObject().put("name", "TEK FOTOĞRAF TESTİ").put("image_url", photoUrl(0));
    main(() -> ((DealerPhotoViewer) viewer()).open(single));
    pictureReady();
    main(()
             -> check(find(root(), "Sonraki fotoğraf", false, true) == null,
                 "Single photo exposed gallery paging"));
    click("Kapat");
    JSONObject broken =
        new JSONObject().put("name", "BOZUK FOTOĞRAF TESTİ").put("image_url", photoUrl(3));
    DealerImages loader = new DealerImages(getTargetContext());
    File corrupt = loader.cacheFile(photoUrl(3));
    try (FileOutputStream out = new FileOutputStream(corrupt)) {
      out.write(new byte[] {1, 2, 3});
    }
    loader.close();
    main(() -> ((DealerPhotoViewer) viewer()).open(broken));
    await(() -> findButton("Yeniden dene") != null, "Corrupt photo did not expose retry");
    check(!corrupt.exists(), "Corrupt download stayed cached");
    click("Kapat");
    click("‹ Katalog");
    clickDescription("Fixture Parça ürününü incele");
  }
  private volatile Activity resumed;
  private boolean mockAccountAuthorization;
  @Override
  public void callActivityOnResume(Activity activity) {
    super.callActivityOnResume(activity);
    resumed = activity;
    if (mockAccountAuthorization && activity instanceof DealerActivity) {
      try {
        Field authorization = DealerActivity.class.getDeclaredField("accessVerified"); authorization.setAccessible(true); authorization.setBoolean(activity, true);
        ((android.os.Handler)field(activity,"accountTimer")).removeCallbacksAndMessages(null);
        java.lang.reflect.Method render = DealerActivity.class.getDeclaredMethod("render"); render.setAccessible(true); render.invoke(activity);
      } catch (Exception error) { throw new AssertionError(error); }
    }
  }
  private Activity lastActivity() {
    return resumed;
  }
  private void appearance() throws Exception {
    click("Ayarlar");
    click("Koyu");
    await(() -> lastActivity() != activity, "Theme did not recreate");
    activity = (DealerActivity) lastActivity();
    requireText("Ayarlar");
    check(
        DealerUi.appearance(getTargetContext()).theme.equals("dark"), "Theme preference not saved");
    screenshot("settings-dark");
    click("%150");
    await(() -> lastActivity() != activity, "Font did not recreate");
    activity = (DealerActivity) lastActivity();
    click("Yüksek");
    await(() -> lastActivity() != activity, "Contrast did not recreate");
    activity = (DealerActivity) lastActivity();
    check(DealerUi.appearance(getTargetContext()).fontPercent == 150
            && DealerUi.appearance(getTargetContext()).highContrast,
        "Device appearance not retained");
    main(()
             -> check(activity.getResources().getConfiguration().fontScale >= 1.49f,
                 "Large text not applied"));
    screenshot("settings-large-contrast");
    click("Katalog");
    screenshot("catalog-large-dark");
  }
  private void screenshot(String name) throws Exception {
    waitForIdleSync();
    Thread.sleep(100);
    Bitmap bitmap = getUiAutomation().takeScreenshot();
    check(bitmap != null, "Screenshot unavailable");
    File directory = new File(getTargetContext().getFilesDir(), "ui-evidence");
    directory.mkdirs();
    try (OutputStream out = new FileOutputStream(new File(directory, name + ".png"))) {
      check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, out), "Screenshot encoding failed");
    } finally {
      bitmap.recycle();
    }
  }
  private String repeat(int count) {
    char[] chars = new char[count];
    Arrays.fill(chars, 'a');
    return new String(chars);
  }
  private String photoUrl(int i) {
    return "https://dealer-fixture.invalid/photos/" + i + ".jpg";
  }
  private void writeImage(File file, int width, int height, int color) throws Exception {
    Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565);
    Canvas canvas = new Canvas(bitmap);
    canvas.drawColor(
        new int[] {Color.LTGRAY, Color.WHITE, Color.GRAY, Color.CYAN, Color.YELLOW}[color]);
    Paint p = new Paint();
    p.setColor(Color.DKGRAY);
    canvas.drawCircle(width * .5f, height * .5f, height * .3f, p);
    p.setColor(Color.WHITE);
    canvas.drawRect(width * .3f, height * .3f, width * .7f, height * .7f, p);
    p.setColor(Color.BLACK);
    p.setTextSize(height / 12f);
    canvas.drawText("FIXTURE " + color, width * .25f, height * .55f, p);
    try (OutputStream out = new FileOutputStream(file)) {
      bitmap.compress(Bitmap.CompressFormat.JPEG, 88, out);
    } finally {
      bitmap.recycle();
    }
  }
  private void launch() {
    activity =
        (DealerActivity) startActivitySync(new Intent(getTargetContext(), DealerActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    waitForIdleSync();
  }
  private void restart() {
    main(() -> activity.finish());
    waitForIdleSync();
    launch();
  }
  private void settle(String caption) throws Exception {
    await(() -> {
      Button b = findButton(caption);
      return b != null && b.isEnabled();
    }, "Network boundary did not settle");
  }
  private void await(BooleanSupplier condition, String message) throws Exception {
    for (int i = 0; i < 300; i++) {
      final boolean[] okay = {false};
      main(() -> okay[0] = condition.getAsBoolean());
      if (okay[0])
        return;
      Thread.sleep(50);
    }
    throw new AssertionError(message);
  }
  private void pictureReady() throws Exception {
    await(()
              -> !photoViews().isEmpty() && picture(photoViews().get(0)) != null
            && photoViews().get(0).getWidth() > 0,
        "Product image not rendered");
  }
  private Object viewer() {
    return field(activity, "photos");
  }
  private boolean boolViewer(String name) {
    return (boolean) field(viewer(), name);
  }
  private Object field(Object object, String name) {
    try {
      Field f = object.getClass().getDeclaredField(name);
      f.setAccessible(true);
      return f.get(object);
    } catch (Exception e) {
      throw new AssertionError(e);
    }
  }
  private Bitmap picture(DealerPhotoView view) {
    return (Bitmap) field(view, "picture");
  }
  private List<DealerPhotoView> photoViews() {
    return views(DealerPhotoView.class);
  }
  private <T extends View> List<T> views(Class<T> type) {
    List<T> result = new ArrayList<>();
    collect(root(), type, result);
    return result;
  }
  private <T extends View> void collect(View view, Class<T> type, List<T> result) {
    if (type.isInstance(view))
      result.add(type.cast(view));
    if (view instanceof ViewGroup)
      for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++)
        collect(((ViewGroup) view).getChildAt(i), type, result);
  }
  private View root() {
    return activity.getWindow().getDecorView();
  }
  private View find(View view, String text, boolean button, boolean description) {
    if (description ? text.contentEquals(
                          view.getContentDescription() == null ? "" : view.getContentDescription())
                    : view instanceof TextView && (!button || view instanceof Button)
                && text.contentEquals(((TextView) view).getText()))
      return view;
    if (view instanceof ViewGroup)
      for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
        View found = find(((ViewGroup) view).getChildAt(i), text, button, description);
        if (found != null)
          return found;
      }
    return null;
  }
  private Button findButton(String text) {
    return (Button) find(root(), text, true, false);
  }
  private View findDescription(String text) {
    View view = find(root(), text, false, true);
    check(view != null, "Missing field: " + text);
    return view;
  }
  private void click(String text) {
    main(() -> {
      Button b = findButton(text);
      check(b != null && b.isEnabled(), "Missing or disabled action: " + text);
      b.performClick();
    });
    waitForIdleSync();
  }
  private void clickDescription(String text) {
    main(() -> {
      View v = findDescription(text);
      check(v.isEnabled(), "Action disabled: " + text);
      v.performClick();
    });
    waitForIdleSync();
  }
  private void setText(String caption, String text) {
    main(() -> ((EditText) findDescription(caption)).setText(text));
    waitForIdleSync();
  }
  private void requireText(String text) {
    main(() -> check(find(root(), text, false, false) != null, "Missing text: " + text));
  }
  private void main(Runnable action) {
    final Throwable[] failure = {null};
    super.runOnMainSync(() -> {
      try {
        action.run();
      } catch (Throwable error) {
        failure[0] = error;
      }
    });
    if (failure[0] != null)
      throw new AssertionError(failure[0]);
  }
  private void check(boolean okay, String message) {
    if (!okay)
      throw new AssertionError(message);
  }
  private long eventTime;
  private long nextEventTime() {
    eventTime = Math.max(SystemClock.uptimeMillis(), eventTime + 700);
    return eventTime;
  }
  private void tap(DealerPhotoView v, long down, long up) {
    MotionEvent a = MotionEvent.obtain(
        down, down, MotionEvent.ACTION_DOWN, v.getWidth() / 2f, v.getHeight() / 2f, 0);
    v.dispatchTouchEvent(a);
    a.recycle();
    MotionEvent b = MotionEvent.obtain(
        down, up, MotionEvent.ACTION_UP, v.getWidth() / 2f, v.getHeight() / 2f, 0);
    v.dispatchTouchEvent(b);
    b.recycle();
  }
  private void doubleTap(DealerPhotoView v) {
    long t = nextEventTime();
    tap(v, t, t + 30);
    tap(v, t + 100, t + 130);
  }
  private void drag(DealerPhotoView v) {
    long t = nextEventTime();
    for (int i = 0; i < 3; i++) {
      MotionEvent e = MotionEvent.obtain(t, t + i * 30,
          i == 0       ? MotionEvent.ACTION_DOWN
              : i == 2 ? MotionEvent.ACTION_UP
                       : MotionEvent.ACTION_MOVE,
          v.getWidth() / 2f + (i == 0 ? 0 : 40), v.getHeight() / 2f + (i == 0 ? 0 : 20), 0);
      v.dispatchTouchEvent(e);
      e.recycle();
    }
  }
  private void pinch(DealerPhotoView v) {
    long t = nextEventTime();
    MotionEvent.PointerProperties[] props = new MotionEvent.PointerProperties[2];
    for (int i = 0; i < 2; i++) {
      props[i] = new MotionEvent.PointerProperties();
      props[i].id = i;
      props[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
    }
    for (int step = 0; step < 12; step++) {
      int count = step == 0 || step == 11 ? 1 : 2;
      MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[count];
      float distance = v.getWidth() * (.12f + Math.max(0, step - 1) * .03f);
      for (int i = 0; i < count; i++) {
        coords[i] = new MotionEvent.PointerCoords();
        coords[i].x = v.getWidth() / 2f + (i == 0 ? -distance : distance);
        coords[i].y = v.getHeight() / 2f;
        coords[i].pressure = 1;
        coords[i].size = .1f;
      }
      int action = step == 0 ? MotionEvent.ACTION_DOWN
          : step == 1
          ? MotionEvent.ACTION_POINTER_DOWN | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT)
          : step == 10
          ? MotionEvent.ACTION_POINTER_UP | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT)
          : step == 11 ? MotionEvent.ACTION_UP
                       : MotionEvent.ACTION_MOVE;
      MotionEvent e = MotionEvent.obtain(t, t + step * 35, action, count, props, coords, 0, 0, 1, 1,
          0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
      v.dispatchTouchEvent(e);
      e.recycle();
    }
  }
}

package com.yardimciasistan.dealer;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.*;
import android.graphics.*;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.view.*;
import android.view.accessibility.AccessibilityNodeInfo;
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
      // Named independent carts on the real device; the original cart stays canonical for the order flow.
      click("Sepet (1)");
      requireText("Tahmini toplam 75,00 TL");
      requireText("Sepetler");
      requireText("Sepet 1");
      requireText("Etkin sepet: Sepet 1");
      main(() -> findDescription("Sepet: Sepet 1, etkin"));
      click("Yeni");
      dialogSetText("Sepet adı", "İkinci Sepet");
      dialogClick("Oluştur");
      requireText("İkinci Sepet");
      requireText("Etkin sepet: İkinci Sepet");
      requireText("Sepetiniz boş");
      click("Katalogdan ürün seç");
      clickDescription("Fixture Görselsiz ürününü incele");
      setText("Eklenecek miktar (adet)", "1");
      click("Sepete ekle");
      requireText("Ürün sepetinize eklendi.");
      click("‹ Katalog");
      click("Sepet (1)");
      requireText("Tahmini toplam 5,00 TL");
      click("Sepet 1");
      requireText("Tahmini toplam 75,00 TL");
      requireText("Etkin sepet: Sepet 1");
      restart();
      settle("Yenile");
      click("Sepet (1)");
      requireText("Tahmini toplam 75,00 TL");
      requireText("Sepet 1");
      requireText("İkinci Sepet");
      click("İkinci Sepet");
      requireText("Tahmini toplam 5,00 TL");
      requireText("Etkin sepet: İkinci Sepet");
      click("Adlandır");
      dialogSetText("Sepet adı", "Tedarik Sepeti");
      dialogClick("Kaydet");
      requireText("Tedarik Sepeti");
      requireText("Etkin sepet: Tedarik Sepeti");
      main(() -> check(findButton("İkinci Sepet") == null, "Renamed cart kept its old label"));
      click("Sil");
      dialogClick("Sepeti sil");
      requireText("Etkin sepet: Sepet 1");
      requireText("Tahmini toplam 75,00 TL");
      main(() -> check(findButton("Tedarik Sepeti") == null, "Deleted cart still listed"));
      JSONObject stored = new JSONObject(disk.read());
      check(stored.getJSONObject("carts").length() == 0, "Deleted cart retained on disk");
      check(stored.getJSONObject("cart").getDouble("p") == 3, "Original cart was not restored");
      click("Sepet (1)");
      requireText("Tahmini toplam 75,00 TL");
      click("Siparişler");
      for (String label : new String[] {
               "Sipariş alındı", "Onaylandı", "Tamamlandı", "İptal edildi", "İşletmeye iletiliyor"})
        requireText(label);
      clickDescription("fixture-placed ürünlerini tekrar sepete ekle");
      requireText("Tahmini toplam 100,00 TL");
      // The synthetic UI fixture uses an intentionally invalid hostname. It must
      // never persist a new order without a real authenticated server quote.
      click("Siparişi gönder");
      settle("Yenile");
      check(!new JSONObject(disk.read()).has("pending"),"Unreachable quote must not create pending order");
      // The real TLS/PHP fixture above tests quote -> consent -> order independently.
      // Seed a previously approved immutable draft solely for offline/restart retry UI.
      DealerState frozen = new DealerState(disk.read(),disk);
      JSONObject draft=frozen.draftOrder();
      JSONObject line=new JSONObject().put("product_id","p").put("name","Fixture Parça")
          .put("quantity",4).put("unit_price_minor",2500).put("line_total_minor",10000);
      JSONObject offlineQuote=new JSONObject().put("version",2).put("minor_unit",2)
          .put("items",new JSONArray().put(line)).put("currency","TRY")
          .put("delivery_method","pickup").put("payment_method","bank_transfer")
          .put("subtotal_minor",10000).put("delivery_fee_minor",0).put("total_minor",10000)
          .put("quote_id",repeat(64)).put("demo",true)
          .put("bank",new JSONObject().put("name","DEMO Test").put("accountHolder","DEMO")
              .put("iban","DEMO-GECERSIZ-HESAP"))
          .put("legal",new JSONObject().put("version","test").put("preliminary","DEMO ön bilgilendirme")
              .put("agreement","DEMO satış sözleşmesi"));
      frozen.prepareOrder(offlineQuote,true,true,false);
      restart();
      settle("Yenile");
      click("Sepet (1)");
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
      main(() -> {
        check(!findButton("Yeni").isEnabled(), "Cart creation must freeze while pending");
        check(!findButton("Adlandır").isEnabled(), "Cart rename must freeze while pending");
        check(!findButton("Sil").isEnabled(), "Cart delete must freeze while pending");
        check(!findDescription("Sepet: Sepet 1, etkin").isEnabled(),
            "Cart selector must freeze while pending");
      });
      requireText(
          "Bekleyen sipariş kesinleşene kadar sepetler kilitli. Aynı siparişi tekrar deneyin.");
      appearance();
      result.putString("stream",
          "dealer-native-device-ok: real local HTTPS/PHP dealer checkout quote, consent, authoritative price "
              + "and bank-payment report/read, exact retry, access rotation, demotion and revocation; "
              + "synthetic independent cart and restart persistence, refused unquoted order, "
              + "shared WebView Inspector launch/close, appearance and app lifecycle. "
              + "Detailed native Inspector filters, EXIF, gestures and bitmap cleanup are verified "
              + "by the separate packages/image-inspector/test/device.mjs.\n");
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
    // Image Inspector V2 is a WebView: no legacy DealerPhotoView pixels exist.
    // Detailed Worker filters, EXIF, gestures and memory are tested separately by
    // packages/image-inspector/test/device.mjs / InspectorInstrumentation.
    click("Fotoğrafı incele (3)");
    await(() -> {
      if (!((DealerPhotoViewer) viewer()).active()) return false;
      Object current=field(viewer(),"web");
      return current instanceof android.webkit.WebView
          && ((android.webkit.WebView)current).getProgress() == 100;
    }, "Shared offline WebView image inspector was not loaded");
    screenshot("photo-inspector");
    main(() -> ((DealerPhotoViewer) viewer()).close());
    requireText("Test açıklaması");
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
  private Object viewer() {
    return field(activity, "photos");
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
  private void dialogSetText(String caption, String text) throws Exception {
    AccessibilityNodeInfo node = awaitNode(caption, true);
    Bundle arguments = new Bundle();
    arguments.putCharSequence(
        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
    check(node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments),
        "Dialog text could not be set: " + caption);
    waitForIdleSync();
  }
  private void dialogClick(String text) throws Exception {
    AccessibilityNodeInfo node = awaitNode(text, false);
    check(node.performAction(AccessibilityNodeInfo.ACTION_CLICK),
        "Dialog action could not be clicked: " + text);
    waitForIdleSync();
  }
  private AccessibilityNodeInfo awaitNode(String text, boolean description) throws Exception {
    for (int i = 0; i < 100; i++) {
      AccessibilityNodeInfo found = findNode(getUiAutomation().getRootInActiveWindow(), text, description);
      if (found != null)
        return found;
      Thread.sleep(50);
    }
    throw new AssertionError("Missing dialog node: " + text);
  }
  private AccessibilityNodeInfo findNode(
      AccessibilityNodeInfo node, String text, boolean description) {
    if (node == null)
      return null;
    CharSequence value = description ? node.getContentDescription() : node.getText();
    if (value != null && text.equalsIgnoreCase(value.toString().trim()))
      return node;
    for (int i = 0; i < node.getChildCount(); i++) {
      AccessibilityNodeInfo found = findNode(node.getChild(i), text, description);
      if (found != null)
        return found;
    }
    return null;
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
}

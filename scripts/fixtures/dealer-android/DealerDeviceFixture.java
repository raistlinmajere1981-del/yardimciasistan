package com.yardimciasistan.dealer;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

/** Synthetic offline cache only. No valid session, supplier, network server or provider success. */
public final class DealerDeviceFixture extends Instrumentation {
  private DealerActivity activity;
  private DealerDisk disk;
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      disk = new DealerDisk(getTargetContext());
      JSONObject seed = new JSONObject().put("base", "https://dealer-fixture.invalid/module/")
          .put("owner", "https://dealer-fixture.invalid/module/|fixture-dealer")
          .put("cookie", "ya_dealer_session=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
          .put("dealer", new JSONObject().put("access_id", "fixture-dealer").put("display_name", "BAYİ UI TEST VERİSİ"))
          .put("catalog_at", "Yerel fixture · canlı veri değil").put("delivery", "pickup");
      seed.put("catalog", new JSONObject("{\"catalog_revision\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"delivery_methods\":[\"pickup\",\"shipping\"],\"products\":[{\"product_id\":\"p\",\"name\":\"Fixture Matkap\",\"sku\":\"TEST-1\",\"brand\":\"Test marka\",\"category_name\":\"El aletleri\",\"description\":\"Test açıklaması\",\"price\":25,\"currency\":\"TRY\",\"unit\":\"piece\",\"image_url\":\"\"},{\"product_id\":\"q\",\"name\":\"Fixture Uç\",\"sku\":\"TEST-2\",\"price\":5,\"currency\":\"TRY\",\"unit\":\"piece\",\"image_url\":\"\"}]}"));
      JSONArray orders = new JSONArray();
      for (String status : new String[]{"placed", "confirmed", "fulfilled", "cancelled", "awaiting_desktop"}) orders.put(new JSONObject()
          .put("order_id", "fixture-" + status).put("status", status).put("created_at", "2026-01-01T10:00:00Z")
          .put("total", status.equals("awaiting_desktop") ? JSONObject.NULL : 25).put("currency", "TRY")
          .put("items", new JSONArray().put(new JSONObject().put("product_id", "p").put("name", "Fixture Matkap").put("quantity", 1))));
      seed.put("orders", orders); disk.write(seed.toString());
      launch(); ready();
      clickDescription("Fixture Matkap ürününü incele"); requireText("Test açıklaması"); click("Favorilerime ekle");
      runOnMainSync(() -> { EditText input = (EditText)findDescription("Eklenecek miktar (adet)"); input.setText("2"); });
      click("Sepete ekle"); click("Sepet (1)"); requireText("Tahmini toplam  50,00 TRY");
      check(new JSONObject(disk.read()).getJSONObject("favorites").has("p"), "Favorite not persisted");
      runOnMainSync(() -> ((EditText)findDescription("Fixture Matkap miktarı")).setText("3")); click("Miktarı uygula"); requireText("Tahmini toplam  75,00 TRY");
      runOnMainSync(() -> activity.finish()); waitForIdleSync(); launch(); ready(); click("Sepet (1)"); requireText("Tahmini toplam  75,00 TRY");
      click("Siparişler");
      for (String status : new String[]{"Sipariş alındı", "Onaylandı", "Tamamlandı", "İptal edildi", "Talep alındı · Masaüstüne aktarım bekleniyor"}) requireText(status);
      clickDescription("fixture-placed ürünlerini tekrar sepete ekle"); requireText("Tahmini toplam  100,00 TRY");
      click("Siparişi gönder"); ready(); requireText("Aynı siparişi tekrar dene");
      JSONObject pending = new JSONObject(disk.read()).getJSONObject("pending");
      check(pending.getJSONArray("items").getJSONObject(0).getDouble("quantity") == 4, "Pending quantity changed");
      runOnMainSync(() -> activity.finish()); waitForIdleSync(); launch(); ready(); click("Sepet (1)"); requireText("Aynı siparişi tekrar dene");
      check(new JSONObject(disk.read()).getJSONObject("pending").toString().equals(pending.toString()), "Restart changed frozen request");
      final boolean[] locked = {false}; runOnMainSync(() -> locked[0] = !findDescription("Fixture Matkap miktarı").isEnabled()); check(locked[0], "Uncertain submission cart must be frozen");
      result.putString("stream", "dealer-native-device-ok: detail, favorite, quantity, total, encrypted offline restart, canonical status labels, reorder, failed send and immutable pending retry; synthetic fixture only\n");
      finish(Activity.RESULT_OK, result);
    } catch (Throwable error) { result.putString("stream", "dealer-native-device-failed: " + error + "\n"); finish(Activity.RESULT_CANCELED, result); }
  }
  private void launch() { activity = (DealerActivity)startActivitySync(new Intent(getTargetContext(), DealerActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); waitForIdleSync(); }
  private void ready() throws Exception {
    for (int i = 0; i < 500; i++) { final boolean[] enabled = {false}; runOnMainSync(() -> { Button button = findButton("Yenile"); enabled[0] = button != null && button.isEnabled(); }); if (enabled[0]) return; Thread.sleep(50); }
    throw new AssertionError("Network boundary did not settle");
  }
  private View root() { return activity.getWindow().getDecorView(); }
  private View find(View view, String text, boolean button, boolean description) {
    if (description ? text.contentEquals(view.getContentDescription() == null ? "" : view.getContentDescription())
        : view instanceof TextView && (!button || view instanceof Button) && text.contentEquals(((TextView)view).getText())) return view;
    if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup)view).getChildCount(); i++) { View found = find(((ViewGroup)view).getChildAt(i), text, button, description); if (found != null) return found; }
    return null;
  }
  private Button findButton(String text) { return (Button)find(root(), text, true, false); }
  private View findDescription(String text) { View view = find(root(), text, false, true); check(view != null, "Missing field: " + text); return view; }
  private void click(String text) { runOnMainSync(() -> { Button button = findButton(text); check(button != null && button.isEnabled(), "Missing or disabled action: " + text); button.performClick(); }); waitForIdleSync(); }
  private void clickDescription(String description) { runOnMainSync(() -> { View view = findDescription(description); check(view.isEnabled(), "Action disabled: " + description); view.performClick(); }); waitForIdleSync(); }
  private void requireText(String text) { runOnMainSync(() -> check(find(root(), text, false, false) != null, "Missing text: " + text)); }
  private void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
}

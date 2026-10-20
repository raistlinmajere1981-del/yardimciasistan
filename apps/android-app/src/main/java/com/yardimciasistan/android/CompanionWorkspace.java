package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;

import java.util.List;

/** Small operational subviews of Today, using the existing Android UI primitives. */
final class CompanionWorkspace {
  interface Listener {
    void openRoute(String route);
    void selectSource(String source);
    void openOrder(String id);
    void backToList();
    void decide(CompanionData.Order order, String type);
    void openTracking(String url);
    void dial(String phone);
  }

  private final ComponentActivity activity;
  private final OperationData data;
  private final Listener listener;

  CompanionWorkspace(ComponentActivity activity, OperationData data, Listener listener) {
    this.activity = activity;
    this.data = data;
    this.listener = listener;
  }

  View build(String mode, String source, String orderId, boolean loading, boolean syncFailed, int pendingActions,
      List<ActionOutbox.PendingAction> localActions, String notice, int bottomPaddingDp) {
    LinearLayout page = UiKit.column(activity);
    page.addView(UiKit.outlineButton(activity, orderId.isEmpty() ? "Bugün'e dön" : "Listeye dön",
        view -> { if (orderId.isEmpty()) listener.openRoute("today"); else listener.backToList(); }));
    if (!CompanionUiRules.canOpen(data, mode)) {
      page.addView(info("Bu cihazın bu alan için yetkisi yok."));
      return UiKit.scroll(activity, page, bottomPaddingDp);
    }
    data.companion.redact(data);
    page.addView(info(CompanionUiRules.syncNotice(data, loading, syncFailed, pendingActions)));
    if (!notice.isEmpty()) page.addView(info(notice));
    if (AndroidUiRules.TODAY_MARKETING.equals(mode)) {
      marketing(page);
    } else if (!orderId.isEmpty()) {
      detail(page, data.companion.orderById(orderId), loading, localActions);
    } else {
      orders(page, source, AndroidUiRules.TODAY_SHIPMENTS.equals(mode));
    }
    return UiKit.scroll(activity, page, bottomPaddingDp);
  }

  private void orders(LinearLayout page, String source, boolean shipmentsOnly) {
    if (!data.companion.commerceAvailable) {
      page.addView(info("Ticari özet henüz alınmadı. Masaüstüyle senkronizasyonu yenileyin."));
      return;
    }
    page.addView(sourceFilters(source));
    page.addView(info(shipmentsOnly
        ? "Siparişlere bağlı en fazla 100 gönderinin durum özeti gösterilir."
        : "En fazla 100 sipariş gösterilir. Ürün ve teslimat bilgileri için ayrıntıyı açın."));
    if (!shipmentsOnly && data.hasPermission("online_sales.view") && !CompanionUiRules.DEALER.equals(source)) {
      LinearLayout catalog = UiKit.card(activity);
      catalog.addView(UiKit.text(activity, "Online katalog", 14, UiKit.TEXT, Typeface.BOLD));
      catalog.addView(UiKit.text(activity, "Yayın hedefindeki ürün: " + data.companion.desiredProductCount,
          12, UiKit.MUTED, Typeface.NORMAL));
      catalog.addView(UiKit.text(activity, data.companion.onlineCatalogPending
          ? "Yayın güncellemesi bekliyor" : "Yayın güncellemesi beklemiyor",
          12, data.companion.onlineCatalogPending ? UiKit.WARNING : UiKit.MUTED, Typeface.NORMAL));
      page.addView(catalog);
    }
    List<CompanionData.Order> orders = CompanionUiRules.orders(data, source, shipmentsOnly);
    if (orders.isEmpty()) {
      page.addView(info(shipmentsOnly ? "Bu özette gönderi yok." : "Bu özette sipariş yok."));
      return;
    }
    for (CompanionData.Order order : orders) {
      LinearLayout card = summary(CompanionPresentation.order(data.companion, order, data.hasPermission("shipment.view")));
      View detailButton = UiKit.outlineButton(activity, "Ayrıntıyı Aç", view -> listener.openOrder(order.id));
      detailButton.setContentDescription("Sipariş " + order.id + " ayrıntısını aç");
      card.addView(detailButton);
      page.addView(card);
    }
  }

  private void detail(LinearLayout page, CompanionData.Order order, boolean loading, List<ActionOutbox.PendingAction> local) {
    if (order == null) { page.addView(info("Sipariş bu eşitlemede bulunmuyor.")); return; }
    page.addView(summary(CompanionPresentation.order(data.companion, order, false)));
    String outcome = local == null ? "Telefondaki işlem kuyruğu okunamadı." : CompanionUiRules.orderActionStatus(data, order.id, local);
    if (!outcome.isEmpty()) {
      LinearLayout feedback = UiKit.card(activity);
      feedback.addView(UiKit.text(activity, outcome, 14, outcome.contains("Uygulanamadı") ? UiKit.DANGER : UiKit.WARNING, Typeface.BOLD));
      page.addView(feedback);
    }
    CompanionData.Details d = order.details;
    if (d == null) { page.addView(info("Sipariş ayrıntıları bu eşitlemede bulunmuyor. Senkronizasyonu yenileyin.")); return; }
    page.addView(UiKit.sectionTitle(activity, "Alıcı"));
    page.addView(info("Siparişteki müşteri: " + CompanionPresentation.missing(d.customerName)
        + "\nAlıcı adı: " + CompanionPresentation.missing(d.buyerName)
        + "\nTelefon: " + CompanionPresentation.missing(d.buyerPhone)
        + "\nE-posta: " + CompanionPresentation.missing(d.buyerEmail)));
    if (!d.buyerPhone.isEmpty()) page.addView(UiKit.outlineButton(activity, "Alıcıyı Ara", view -> listener.dial(d.buyerPhone)));
    if (!order.customerId.isEmpty()) {
      CompanionData.Customer customer = data.companion.customerById(order.customerId);
      page.addView(UiKit.sectionTitle(activity, "Müşteri kaydı"));
      if (customer == null) page.addView(info("Bağlı müşteri kaydı bu eşitlemede bulunmuyor."));
      else {
        page.addView(info("Ad: " + CompanionPresentation.missing(customer.name)
            + "\nTelefon: " + CompanionPresentation.missing(customer.phone) + "\nE-posta: " + CompanionPresentation.missing(customer.email)));
        if (!customer.phone.isEmpty()) page.addView(UiKit.outlineButton(activity, "Müşteriyi Ara", view -> listener.dial(customer.phone)));
      }
      CompanionData.Profile profile = data.companion.profileById(order.customerId);
      if (profile != null) {
        page.addView(UiKit.sectionTitle(activity, "Bayi ticari profili"));
        page.addView(info("Firma: " + CompanionPresentation.missing(profile.companyName)
            + "\nYetkili: " + CompanionPresentation.missing(profile.authorizedPerson)
            + "\nBayi durumu: " + dealerStatus(profile.dealerStatus) + "\nFiyat grubu: " + priceGroup(profile.priceGroup)));
      }
    }
    page.addView(UiKit.sectionTitle(activity, "Sipariş tutarı"));
    page.addView(info("Ara toplam: " + AndroidPresentation.money(d.subtotal, order.currency)
        + "\nİndirim: " + AndroidPresentation.money(d.discountTotal, order.currency)
        + "\nSipariş toplamı: " + AndroidPresentation.money(order.total, order.currency)));
    page.addView(UiKit.sectionTitle(activity, "Teslimat"));
    page.addView(info("shipping".equals(order.deliveryMethod) ? CompanionPresentation.address(d.address) : "Elden teslim"));
    if (data.hasPermission("shipment.view")) {
      page.addView(UiKit.sectionTitle(activity, "Gönderiler"));
      boolean found = false;
      for (CompanionData.Shipment shipment : data.companion.shipments) if (order.id.equals(shipment.orderId)) {
        found = true;
        LinearLayout card = summary(CompanionPresentation.shipment(shipment));
        if (!shipment.trackingUrl.isEmpty()) card.addView(UiKit.outlineButton(activity, "Takibi Aç", view -> listener.openTracking(shipment.trackingUrl)));
        else card.addView(UiKit.text(activity, "Takip bağlantısı bulunmuyor.", 12, UiKit.MUTED, Typeface.NORMAL));
        page.addView(card);
      }
      if (!found) page.addView(info("Bu özette gönderi kaydı yok."));
    }
    page.addView(UiKit.sectionTitle(activity, "Ürünler"));
    if (!d.itemsComplete) page.addView(info("Ürün listesi eksik: " + d.items.size() + " / " + d.itemCount
        + " satır. Tam ayrıntı eşitlenmeden sipariş kararı gönderilemez."));
    if (d.items.isEmpty()) page.addView(info("Bu eşitlemede ürün kalemi bulunmuyor."));
    for (CompanionData.Item item : d.items) {
      LinearLayout card = UiKit.card(activity);
      card.addView(UiKit.text(activity, CompanionPresentation.missing(item.name), 14, UiKit.TEXT, Typeface.BOLD));
      card.addView(UiKit.text(activity, CompanionPresentation.itemQuantity(item), 12, UiKit.MUTED, Typeface.NORMAL));
      card.addView(UiKit.text(activity, "Birim fiyat: " + AndroidPresentation.money(item.unitPrice, order.currency), 12, UiKit.MUTED, Typeface.NORMAL));
      card.addView(UiKit.text(activity, "Satır toplamı: " + AndroidPresentation.money(item.lineTotal, order.currency), 12, UiKit.TEXT, Typeface.BOLD));
      page.addView(card);
    }
    page.addView(UiKit.sectionTitle(activity, "Sipariş notu"));
    page.addView(info(CompanionPresentation.missing(d.note)));
    if (local == null) return;
    for (String type : new String[] { "commerce_order_confirm", "commerce_order_cancel" }) {
      if (!CompanionUiRules.canDecide(data, order, type, local)) continue;
      View button = "commerce_order_cancel".equals(type)
          ? UiKit.dangerButton(activity, "İptal Et", view -> listener.decide(order, type))
          : UiKit.button(activity, "Onayla", UiKit.PRIMARY, view -> listener.decide(order, type));
      button.setEnabled(!loading); page.addView(button);
    }
  }

  private String dealerStatus(String status) {
    return "active".equals(status) ? "Aktif" : "Pasif";
  }
  private String priceGroup(String group) {
    return "dealer_a".equals(group) ? "Bayi A" : "dealer_b".equals(group) ? "Bayi B" : "Perakende";
  }

  private View sourceFilters(String selected) {
    HorizontalScrollView scroll = new HorizontalScrollView(activity);
    scroll.setHorizontalScrollBarEnabled(false);
    LinearLayout row = UiKit.row(activity);
    row.addView(UiKit.chip(activity, "Tümü", CompanionUiRules.ALL.equals(selected),
        view -> listener.selectSource(CompanionUiRules.ALL)));
    if (CompanionUiRules.sourceFilterAvailable(data, CompanionUiRules.ONLINE)) {
      row.addView(UiKit.chip(activity, "Online satış", CompanionUiRules.ONLINE.equals(selected),
          view -> listener.selectSource(CompanionUiRules.ONLINE)));
    }
    if (CompanionUiRules.sourceFilterAvailable(data, CompanionUiRules.DEALER)) {
      row.addView(UiKit.chip(activity, "Bayi siparişleri", CompanionUiRules.DEALER.equals(selected),
          view -> listener.selectSource(CompanionUiRules.DEALER)));
    }
    scroll.addView(row);
    return scroll;
  }

  private void marketing(LinearLayout page) {
    if (!data.companion.marketingAvailable) {
      page.addView(info("Pazarlama özeti henüz alınmadı. Masaüstüyle senkronizasyonu yenileyin."));
      return;
    }
    page.addView(info("Yayın, plan ve kampanya türü başına en fazla 50 durum özeti gösterilir."));
    page.addView(UiKit.sectionTitle(activity, "Yayınlar"));
    if (data.companion.publications.isEmpty()) page.addView(info("Bu özette yayın yok."));
    for (CompanionData.Publication publication : data.companion.publications) {
      page.addView(summary(CompanionPresentation.publication(publication)));
    }
    page.addView(UiKit.sectionTitle(activity, "Planlar"));
    if (data.companion.schedules.isEmpty()) page.addView(info("Bu özette plan yok."));
    for (CompanionData.Schedule schedule : data.companion.schedules) {
      page.addView(summary(CompanionPresentation.schedule(schedule)));
    }
    if (data.hasBusinessCapability("messaging.campaigns") && data.hasBusinessCapability("core.customers")) {
      page.addView(UiKit.sectionTitle(activity, "Kampanyalar"));
      if (data.companion.campaigns.isEmpty()) page.addView(info("Bu özette kampanya yok."));
      for (CompanionData.Campaign campaign : data.companion.campaigns) {
        page.addView(summary(CompanionPresentation.campaign(campaign)));
      }
    }
  }

  private LinearLayout summary(CompanionPresentation.Summary summary) {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.text(activity, summary.title, 14, UiKit.TEXT, Typeface.BOLD));
    int tone = summary.failed ? UiKit.DANGER : summary.pending ? UiKit.WARNING : UiKit.INFO;
    card.addView(UiKit.badge(activity, summary.status, tone));
    for (String line : summary.lines) {
      card.addView(UiKit.text(activity, line, 12, summary.failed ? UiKit.DANGER : UiKit.MUTED, Typeface.NORMAL));
    }
    return card;
  }

  private View info(String text) {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.text(activity, text, 12, UiKit.MUTED, Typeface.NORMAL));
    return card;
  }
}

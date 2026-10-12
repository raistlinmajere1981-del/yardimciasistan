package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;

import java.util.List;

/** Small read-only subviews of Today, using the existing Android UI primitives. */
final class CompanionWorkspace {
  interface Listener {
    void openRoute(String route);
    void selectSource(String source);
  }

  private final ComponentActivity activity;
  private final OperationData data;
  private final Listener listener;

  CompanionWorkspace(ComponentActivity activity, OperationData data, Listener listener) {
    this.activity = activity;
    this.data = data;
    this.listener = listener;
  }

  View build(String mode, String source, boolean loading, boolean syncFailed, int pendingActions, int bottomPaddingDp) {
    LinearLayout page = UiKit.column(activity);
    page.addView(UiKit.outlineButton(activity, "Bugün'e dön", view -> listener.openRoute("today")));
    if (!CompanionUiRules.canOpen(data, mode)) {
      page.addView(info("Bu cihazın bu alan için yetkisi yok."));
      return UiKit.scroll(activity, page, bottomPaddingDp);
    }
    data.companion.redact(data);
    page.addView(info(CompanionUiRules.syncNotice(data, loading, syncFailed, pendingActions)));
    if (AndroidUiRules.TODAY_MARKETING.equals(mode)) {
      marketing(page);
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
        : "En fazla 100 siparişin özeti gösterilir. Siparişler yalnız görüntülenir."));
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
      page.addView(summary(CompanionPresentation.order(data.companion, order,
          data.hasPermission("shipment.view"))));
    }
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

  private View summary(CompanionPresentation.Summary summary) {
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

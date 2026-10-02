package com.yardimciasistan.android;

import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.view.View;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import java.util.concurrent.ExecutorService;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class ReportsWorkspace {
  interface Listener {
    boolean isBusy();
    void onRefreshRequested();
    void onRenderRequested();
    void onError(String message);
  }

  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final ExecutorService executor;
  private final HostingSyncClient syncClient;
  private final DeviceIdentity identity;
  private final Listener listener;

  private String preset = AndroidUiRules.REPORT_LAST_7;
  private String aiAnswer = "";
  private String aiMessage = "";
  private boolean aiLoading;
  private int aiRequestVersion;

  ReportsWorkspace(
      ComponentActivity activity,
      SharedPreferences preferences,
      ExecutorService executor,
      HostingSyncClient syncClient,
      DeviceIdentity identity,
      Listener listener
  ) {
    this.activity = activity;
    this.preferences = preferences;
    this.executor = executor;
    this.syncClient = syncClient;
    this.identity = identity;
    this.listener = listener;
  }

  String screenKey() {
    return preset;
  }

  View build(OperationData data) {
    LinearLayout page = UiKit.column(activity);
    if (!data.isAdmin()) {
      page.addView(emptyCard(
          "Bu cihazın raporlara erişim yetkisi yok",
          "Raporlar yalnız masaüstünde aktif yönetici olarak atanmış telefonlarda açılır."
      ));
      return UiKit.scroll(activity, page);
    }

    page.addView(screenIntro(
        "YÖNETİCİ RAPORU",
        "İşletmenin kısa görünümü",
        AndroidUiRules.canUseAi(data)
            ? "Tutarlar ve adetler masaüstündeki SQLite verisinden hazırlanır. AI yalnız bu hazır özeti açıklar."
            : "Tutarlar ve adetler masaüstündeki SQLite verisinden hazırlanır."
    ));
    page.addView(filterBar());

    OperationData.ReportSnapshot report = data.report(preset);
    if (report == null) {
      page.addView(emptyCard(
          "Rapor verisi henüz hazır değil",
          "Masaüstünde otomatik senkronu çalıştırın, ardından bu ekrandaki Yenile düğmesine dokunun."
      ));
      return UiKit.scroll(activity, page);
    }

    boolean ordersEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS);
    boolean customersEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_CUSTOMERS);
    boolean requestsEnabled = customersEnabled
        && data.hasBusinessCapability(AndroidUiRules.CAPABILITY_REQUESTS);
    boolean reservationsEnabled = data.hasAnyReservationCapability();
    boolean tasksEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_TASKS);
    boolean stockEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_MENU)
        && data.hasBusinessCapability(AndroidUiRules.CAPABILITY_INVENTORY);

    LinearLayout period = UiKit.card(activity);
    period.addView(settingLine(
        "Dönem",
        report.label.isEmpty() ? reportPresetLabel(preset) : report.label,
        UiKit.PRIMARY
    ));
    period.addView(UiKit.divider(activity));
    period.addView(settingLine(
        "Tarih",
        formatReportPeriod(report.startDate, report.endDate),
        UiKit.TEXT
    ));
    page.addView(period);

    page.addView(sectionLabel("Genel özet"));
    LinearLayout summary = UiKit.card(activity);
    if (ordersEnabled) {
      addMetric(summary, "Restoran cirosu", money(report.restaurantRevenue, "TRY"), UiKit.SUCCESS);
      addMetric(summary, "Kapanan hesap", String.valueOf(report.closedOrders), UiKit.INFO);
      addMetric(summary, "Ortalama hesap", money(report.averageOrder, "TRY"), UiKit.ACCENT);
    }
    if (reservationsEnabled) {
      addMetric(summary, "Onaylanan rezervasyon", String.valueOf(report.approvedReservations), UiKit.PRIMARY);
    }
    if (requestsEnabled) {
      addMetric(summary, "Yeni talep", String.valueOf(report.newRequests), UiKit.WARNING);
    }
    addMetric(
        summary,
        "Dikkat gerektiren",
        String.valueOf(report.attentionCount),
        report.attentionCount > 0 ? UiKit.DANGER : UiKit.SUCCESS
    );
    page.addView(summary);

    if (ordersEnabled) {
      page.addView(sectionLabel("Restoran"));
      LinearLayout restaurant = UiKit.card(activity);
      addMetric(restaurant, "Satılan ürün", String.valueOf(report.soldItemCount), UiKit.INFO);
      addMetric(
          restaurant,
          "İptal edilen hesap",
          String.valueOf(report.cancelledOrders),
          report.cancelledOrders > 0 ? UiKit.WARNING : UiKit.SUCCESS
      );
      page.addView(restaurant);

      page.addView(sectionLabel("En çok satılan 3 ürün"));
      if (report.topItems.isEmpty()) {
        page.addView(emptyCard(
            "Satış satırı yok",
            "Seçili dönemde kapanmış hesaplara bağlı ürün satışı bulunmuyor."
        ));
      } else {
        int rank = 1;
        for (OperationData.ReportTopItem item : report.topItems) {
          page.addView(topItemCard(item, rank++));
        }
      }
    }

    page.addView(sectionLabel("Şu an dikkat gerektirenler"));
    LinearLayout attention = UiKit.card(activity);
    if (requestsEnabled) {
      addMetric(attention, "Bekleyen müşteri talebi", String.valueOf(report.pendingRequests), UiKit.WARNING);
    }
    if (reservationsEnabled) {
      addMetric(attention, "Bekleyen rezervasyon", String.valueOf(report.pendingReservations), UiKit.WARNING);
    }
    if (ordersEnabled) {
      addMetric(attention, "Hesap bekleyen masa", String.valueOf(report.paymentWaitingTables), UiKit.DANGER);
    }
    if (tasksEnabled) {
      addMetric(
          attention,
          "Geciken / tamamlanmayan iş",
          report.overdueTasks + " / " + report.incompleteTasks,
          UiKit.ACCENT
      );
    }
    if (stockEnabled) {
      addMetric(
          attention,
          "Tükenen / az stok",
          report.outOfStockItems + " / " + report.lowStockItems,
          UiKit.DANGER
      );
    }
    page.addView(attention);

    if (report.attentionItems.isEmpty()) {
      page.addView(emptyCard(
          "Acil başlık yok",
          "Şu anda ayrıca listelenecek dikkat başlığı bulunmuyor."
      ));
    } else {
      for (OperationData.ReportAttentionItem item : report.attentionItems) {
        page.addView(attentionCard(item));
      }
    }

    if (AndroidUiRules.canUseAi(data)) {
      page.addView(sectionLabel("AI yorumu (isteğe bağlı)"));
      page.addView(UiKit.text(
          activity,
          "AI yeni hesap yapmaz; yalnız yukarıdaki hazır JSON özetini kısa ve sade biçimde açıklar.",
          12,
          UiKit.SECONDARY,
          Typeface.NORMAL
      ));
      page.addView(aiButton(data, "Bu dönemi özetle", "summary"));
      page.addView(aiButton(data, "Dikkat edilmesi gerekenler", "attention"));
      if (ordersEnabled) {
        page.addView(aiButton(data, "Satışları yorumla", "sales"));
      }
      page.addView(aiButton(data, "3 kısa öneri ver", "recommendations"));

      if (aiLoading) {
        page.addView(emptyCard(
            "AI yorumu hazırlanıyor",
            "Hazır rapor güvenli sunucu bağlantısı üzerinden yorumlanıyor."
        ));
      } else if (!aiAnswer.isEmpty()) {
        LinearLayout answer = UiKit.card(activity);
        answer.setBackground(UiKit.rounded(activity, UiKit.PRIMARY_DARK, UiKit.PRIMARY, 14));
        answer.addView(UiKit.text(activity, aiAnswer, 13, UiKit.TEXT, Typeface.NORMAL));
        page.addView(answer);
      } else if (!aiMessage.isEmpty()) {
        LinearLayout message = UiKit.card(activity);
        message.addView(UiKit.text(activity, aiMessage, 13, UiKit.WARNING, Typeface.BOLD));
        page.addView(message);
      }
    }

    return UiKit.scroll(activity, page);
  }

  private View screenIntro(String eyebrow, String title, String description) {
    LinearLayout intro = UiKit.column(activity);
    intro.setPadding(0, UiKit.dp(activity, 4), 0, UiKit.dp(activity, 8));
    intro.addView(UiKit.eyebrow(activity, eyebrow));
    LinearLayout titleRow = UiKit.row(activity);
    TextView titleView = UiKit.text(activity, title, 18, UiKit.TEXT, Typeface.BOLD);
    titleView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    titleRow.addView(titleView);
    Button refresh = UiKit.chip(
        activity,
        listener.isBusy() ? "Bekleyin" : "Yenile",
        false,
        view -> listener.onRefreshRequested()
    );
    refresh.setEnabled(!listener.isBusy());
    titleRow.addView(refresh);
    intro.addView(titleRow);
    intro.addView(UiKit.text(activity, description, 12, UiKit.SECONDARY, Typeface.NORMAL));
    return intro;
  }

  private View filterBar() {
    String[][] options = {
        {AndroidUiRules.REPORT_TODAY, "Bugün"},
        {AndroidUiRules.REPORT_YESTERDAY, "Dün"},
        {AndroidUiRules.REPORT_LAST_7, "Son 7 Gün"},
        {AndroidUiRules.REPORT_LAST_30, "Son 30 Gün"}
    };
    HorizontalScrollView scroll = new HorizontalScrollView(activity);
    scroll.setHorizontalScrollBarEnabled(false);
    LinearLayout row = UiKit.row(activity);
    row.setPadding(0, UiKit.dp(activity, 3), 0, UiKit.dp(activity, 6));
    for (String[] option : options) {
      row.addView(UiKit.chip(
          activity,
          option[1],
          option[0].equals(preset),
          view -> {
            preset = AndroidUiRules.normalizeReportPreset(option[0]);
            aiRequestVersion += 1;
            aiLoading = false;
            aiAnswer = "";
            aiMessage = "";
            listener.onRenderRequested();
          }
      ));
    }
    scroll.addView(row);
    return scroll;
  }

  private void addMetric(LinearLayout card, String label, String value, int tone) {
    if (card.getChildCount() > 0) card.addView(UiKit.divider(activity));
    card.addView(settingLine(label, value, tone));
  }

  private View topItemCard(OperationData.ReportTopItem item, int rank) {
    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    TextView name = UiKit.text(activity, rank + ". " + item.name, 14, UiKit.TEXT, Typeface.BOLD);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(name);
    top.addView(UiKit.badge(activity, money(item.revenue, "TRY"), UiKit.SUCCESS));
    card.addView(top);
    card.addView(UiKit.text(
        activity,
        "Satılan miktar: " + stockNumber(item.quantity),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    return card;
  }

  private View attentionCard(OperationData.ReportAttentionItem item) {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.text(activity, item.title, 14, UiKit.TEXT, Typeface.BOLD));
    if (!item.detail.isEmpty()) {
      card.addView(UiKit.text(activity, item.detail, 12, UiKit.SECONDARY, Typeface.NORMAL));
    }
    return card;
  }

  private View aiButton(OperationData data, String label, String mode) {
    Button button = UiKit.outlineButton(activity, label, view -> requestAi(data, mode));
    button.setEnabled(!aiLoading);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
    params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    button.setLayoutParams(params);
    return button;
  }

  private void requestAi(OperationData data, String mode) {
    if (!data.isAdmin() || !AndroidUiRules.canUseAi(data)) {
      aiMessage = "Bu cihazın raporlara erişim yetkisi yok.";
      listener.onError(aiMessage);
      listener.onRenderRequested();
      return;
    }
    if ("sales".equals(mode)
        && !data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS)) {
      aiMessage = "Restoran sipariş capability'si kapalı olduğu için satış yorumu kullanılamıyor.";
      listener.onRenderRequested();
      return;
    }
    if (data.report(preset) == null) {
      aiMessage = "Rapor verisi henüz hazır değil. Masaüstünde senkronu yenileyin.";
      listener.onRenderRequested();
      return;
    }

    String baseUrl = ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = ConnectionSettings.syncSecret(preferences);
    if (baseUrl.isEmpty() || syncSecret.isEmpty()) {
      aiMessage = "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.";
      listener.onRenderRequested();
      return;
    }

    final String requestedPreset = preset;
    final int requestVersion = ++aiRequestVersion;
    aiLoading = true;
    aiAnswer = "";
    aiMessage = "";
    listener.onRenderRequested();

    executor.execute(() -> {
      try {
        String answer = syncClient.generateReportComment(
            baseUrl,
            syncSecret,
            identity,
            mode,
            requestedPreset
        );
        activity.runOnUiThread(() -> {
          if (requestVersion != aiRequestVersion || !requestedPreset.equals(preset)) return;
          aiLoading = false;
          if (!data.isAdmin() || !AndroidUiRules.canUseAi(data)) {
            aiAnswer = "";
            aiMessage = "Bu cihazın raporlara erişim yetkisi yok.";
          } else {
            aiAnswer = answer;
            aiMessage = "";
          }
          listener.onRenderRequested();
        });
      } catch (HostingSyncClient.SyncException error) {
        activity.runOnUiThread(() -> {
          if (requestVersion != aiRequestVersion || !requestedPreset.equals(preset)) return;
          aiLoading = false;
          aiAnswer = "";
          aiMessage = "Bu cihazın raporlara erişim yetkisi yok.".equals(error.getMessage())
              ? error.getMessage()
              : "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.";
          listener.onRenderRequested();
        });
      }
    });
  }

  private View sectionLabel(String value) {
    TextView label = UiKit.text(activity, value, 16, UiKit.TEXT, Typeface.BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(activity, 7), 0, UiKit.dp(activity, 7));
    label.setLayoutParams(params);
    return label;
  }

  private View settingLine(String label, String value, int tone) {
    LinearLayout row = UiKit.row(activity);
    TextView title = UiKit.text(activity, label, 13, UiKit.MUTED, Typeface.BOLD);
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    row.addView(title);
    TextView detail = UiKit.text(activity, value, 13, tone, Typeface.BOLD);
    detail.setGravity(android.view.Gravity.END);
    detail.setMaxWidth(UiKit.dp(activity, 190));
    row.addView(detail);
    return row;
  }

  private View emptyCard(String title, String detail) {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.text(activity, title, 14, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(activity, detail, 12, UiKit.SECONDARY, Typeface.NORMAL));
    return card;
  }
}

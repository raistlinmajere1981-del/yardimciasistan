package com.yardimciasistan.android;

import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;
import android.widget.Switch;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

final class AndroidSettingsWorkspace {
  interface Listener {
    void onSyncRequested();
    void onAppearanceChanged(AppearancePreferences next);
    void refreshNotifications(OperationData data);
    int localPendingActionCount();
    View actionCard(OperationData.ActionRecord action);
  }

  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final DeviceIdentity identity;
  private final Listener listener;
  private final AndroidVoiceController voice;
  private AndroidConnectionSettingsPanel connectionPanel;

  AndroidSettingsWorkspace(
      ComponentActivity activity,
      SharedPreferences preferences,
      DeviceIdentity identity,
      AndroidVoiceController voice,
      Listener listener
  ) {
    this.activity = activity;
    this.preferences = preferences;
    this.identity = identity;
    this.voice = voice;
    this.listener = listener;
  }

  View build(
      OperationData data,
      String themeLabel,
      String connectionState,
      boolean loading
  ) {
    LinearLayout page = UiKit.column(activity);
    boolean canViewTechnicalSettings =
        !data.permissionsResolved || data.hasPermission("settings.view");

    page.addView(sectionLabel("Görünüm"));
    LinearLayout appearance = UiKit.card(activity);
    appearance.addView(settingLine("Tema", themeLabel, UiKit.PRIMARY));
    appendAppearanceControls(appearance);
    page.addView(appearance);
    page.addView(sectionLabel("Ses"));
    page.addView(voice.settingsView());

    if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_NOTIFICATIONS)) {
      appendNotificationPreferences(page, data, canViewTechnicalSettings);
    }

    if (!canViewTechnicalSettings) {
      connectionPanel = null;
      return UiKit.scroll(activity, page);
    }

    connectionPanel = new AndroidConnectionSettingsPanel(
        activity,
        preferences,
        data,
        identity,
        connectionState,
        loading,
        listener.localPendingActionCount(),
        listener::onSyncRequested
    );
    connectionPanel.appendTo(page);

    page.addView(UiKit.sectionTitle(activity, "Son telefon işlemleri"));
    if (data.actions.isEmpty()) {
      page.addView(emptyCard(
          "Gönderilmiş işlem yok",
          "Telefondan yaptığınız değişiklikler burada bekliyor, uygulandı veya hata durumuyla görünür."
      ));
    }
    for (OperationData.ActionRecord action : data.actions) {
      page.addView(listener.actionCard(action));
    }

    return UiKit.scroll(activity, page);
  }

  private void appendAppearanceControls(LinearLayout card) {
    AppearancePreferences selected = AppearancePreferences.load(preferences);

    card.addView(UiKit.divider(activity));
    card.addView(UiKit.text(activity, "Yazı boyutu", 15, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(activity,
        "Sistem yazı boyutuna eklenir; bütün ekranlar için geçerlidir.",
        12, UiKit.SECONDARY, Typeface.NORMAL));
    LinearLayout sizeChoices = UiKit.column(activity);
    int[] sizesPercent = AppearancePreferences.FONT_OPTIONS;
    LinearLayout sizeRow = null;
    for (int index = 0; index < sizesPercent.length; index++) {
      if (index % 2 == 0) {
        sizeRow = UiKit.row(activity);
        sizeChoices.addView(sizeRow);
      }
      int size = sizesPercent[index];
      String label = size == 100 ? "Normal %100" : "%" + size;
      Button button = UiKit.chip(activity, label, selected.fontPercent == size,
          view -> listener.onAppearanceChanged(selected.withFontPercent(size)));
      button.setContentDescription("Yazı boyutu " + size + " yüzde");
      button.setLayoutParams(appearanceChoiceParams());
      sizeRow.addView(button);
    }
    card.addView(sizeChoices);

    card.addView(UiKit.text(activity, "Renk tonu", 15, UiKit.TEXT, Typeface.BOLD));
    LinearLayout colorChoices = UiKit.column(activity);
    LinearLayout colorRow = null;
    AppearancePreferences.Accent[] accents = AppearancePreferences.Accent.values();
    for (int index=0; index<accents.length; index++) {
      if (index % 2 == 0) {
        colorRow = UiKit.row(activity);
        colorChoices.addView(colorRow);
      }
      AppearancePreferences.Accent accent = accents[index];
      Button button = UiKit.chip(activity, accent.label, selected.accent == accent,
          view -> listener.onAppearanceChanged(selected.withAccent(accent)));
      button.setContentDescription("Renk tonu " + accent.label);
      button.setLayoutParams(appearanceChoiceParams());
      colorRow.addView(button);
    }
    card.addView(colorChoices);

    card.addView(UiKit.text(activity, "Kontrast", 15, UiKit.TEXT, Typeface.BOLD));
    LinearLayout contrast = UiKit.row(activity);
    for (boolean high : new boolean[] {false, true}) {
      Button button = UiKit.chip(activity, high ? "Yüksek" : "Normal",
          selected.highContrast == high,
          view -> listener.onAppearanceChanged(selected.withHighContrast(high)));
      button.setContentDescription("Kontrast " + (high ? "yüksek" : "normal"));
      button.setLayoutParams(appearanceChoiceParams());
      contrast.addView(button);
    }
    card.addView(contrast);

    card.addView(UiKit.divider(activity));
    card.addView(UiKit.text(activity, "Önizleme · Başlık ve açıklama", 17, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(activity,
        "Rezervasyon hazır. Oda, masa ve ödeme bilgilerini rahatça okuyabilmelisiniz.",
        14, UiKit.SECONDARY, Typeface.NORMAL));
    card.addView(UiKit.badge(activity, "Hazır · Örnek durum", UiKit.SUCCESS));
    Button defaults = UiKit.outlineButton(activity, "Görünümü varsayılana döndür",
        view -> listener.onAppearanceChanged(AppearancePreferences.defaults()));
    defaults.setMinimumHeight(UiKit.dp(activity, 48));
    card.addView(defaults);
    card.addView(UiKit.text(activity,
        "Bu tercihler yalnızca bu cihazda saklanır; işletme yetkilerini ve masaüstü ayarlarını değiştirmez.",
        11, UiKit.MUTED, Typeface.NORMAL));
  }

  private LinearLayout.LayoutParams appearanceChoiceParams() {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        0, UiKit.dp(activity, 52), 1f);
    params.setMargins(0, UiKit.dp(activity, 4), UiKit.dp(activity, 7), UiKit.dp(activity, 8));
    return params;
  }

  String webModuleValue() {
    return connectionPanel == null
        ? ConnectionSettings.webModuleUrl(preferences)
        : connectionPanel.webModuleValue();
  }

  String syncSecretValue() {
    return connectionPanel == null
        ? ConnectionSettings.syncSecret(preferences)
        : connectionPanel.syncSecretValue();
  }

  String webModuleDraft() {
    return connectionPanel == null ? null : connectionPanel.webModuleDraft();
  }

  String syncSecretDraft() {
    return connectionPanel == null ? null : connectionPanel.syncSecretDraft();
  }

  void restoreDrafts(String webModuleDraft, String syncSecretDraft) {
    if (connectionPanel != null) {
      connectionPanel.restoreDrafts(webModuleDraft, syncSecretDraft);
    }
  }

  private void appendNotificationPreferences(
      LinearLayout page,
      OperationData data,
      boolean canViewTechnicalSettings
  ) {
    page.addView(sectionLabel("Bildirim tercihleri"));
    LinearLayout card = UiKit.card(activity);
    boolean hasPreference = false;

    boolean customerNotifications =
        data.hasBusinessCapability(AndroidUiRules.CAPABILITY_CUSTOMERS)
            && (!data.permissionsResolved || data.hasPermission("customer.view"));
    boolean reservationNotifications = data.hasAnyReservationCapability()
        && (!data.permissionsResolved || data.hasPermission("reservation.view"));

    if (customerNotifications || reservationNotifications) {
      card.addView(notificationToggle(
          data,
          customerNotifications && reservationNotifications
              ? "Müşteri / Rezervasyon"
              : (reservationNotifications ? "Rezervasyon" : "Müşteri Talepleri"),
          customerNotifications && reservationNotifications
              ? "Yeni talepler ve etkin alanlardaki onay bekleyen rezervasyonlar"
              : (reservationNotifications
                  ? "Etkin alanlardaki onay bekleyen rezervasyonlar"
                  : "Yeni ve yanıt bekleyen müşteri talepleri"),
          NotificationEvent.CATEGORY_CUSTOMER
      ));
      hasPreference = true;
    }

    boolean orderNotifications =
        data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS)
            && (!data.permissionsResolved || data.hasPermission("table_order.view"));
    if (orderNotifications) {
      if (hasPreference) card.addView(UiKit.divider(activity));
      card.addView(notificationToggle(
          data,
          "Restoran / Sipariş",
          "Masa siparişleri ve hesap bekleyen adisyonlar",
          NotificationEvent.CATEGORY_RESTAURANT
      ));
      hasPreference = true;
    }

    boolean roomNotifications =
        data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ROOMS)
            && (!data.permissionsResolved || data.hasPermission("room.view"));
    boolean taskNotifications =
        data.hasBusinessCapability(AndroidUiRules.CAPABILITY_TASKS)
            && (!data.permissionsResolved || data.hasPermission("daily_task.view"));

    if (roomNotifications || taskNotifications) {
      if (hasPreference) card.addView(UiKit.divider(activity));
      card.addView(notificationToggle(
          data,
          roomNotifications && taskNotifications
              ? "Oda / Günlük İş"
              : (roomNotifications ? "Oda" : "Günlük İşler"),
          roomNotifications && taskNotifications
              ? "Temizlik, bakım ve etkin alanlardaki bekleyen işler"
              : (roomNotifications
                  ? "Temizlik ve bakım bekleyen odalar"
                  : "Bekleyen ve geciken günlük işler"),
          NotificationEvent.CATEGORY_ROOMS
      ));
      hasPreference = true;
    }

    if (hasPreference) card.addView(UiKit.divider(activity));
    card.addView(notificationToggle(
        data,
        "İşlem hataları",
        "Telefondan gönderilen işlemler uygulanamadığında",
        NotificationEvent.CATEGORY_ACTION
    ));

    if (canViewTechnicalSettings) {
      card.addView(UiKit.divider(activity));
      card.addView(notificationToggle(
          data,
          "Sync bağlantısı",
          "Canlı veri uzun süredir yenilenemediğinde",
          NotificationEvent.CATEGORY_SYNC
      ));
    }

    card.addView(UiKit.text(
        activity,
        "Bu anahtarlar cihaz yetkilerini genişletmez; masaüstünde kapalı olan görev alanları bildirim üretemez.",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    page.addView(card);
  }

  private View notificationToggle(
      OperationData data,
      String title,
      String detail,
      String category
  ) {
    LinearLayout row = UiKit.row(activity);
    row.setGravity(Gravity.CENTER_VERTICAL);
    row.setPadding(0, UiKit.dp(activity, 7), 0, UiKit.dp(activity, 7));

    LinearLayout copy = UiKit.column(activity);
    copy.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    copy.addView(UiKit.text(activity, title, 14, UiKit.TEXT, Typeface.BOLD));
    copy.addView(UiKit.text(activity, detail, 11, UiKit.SECONDARY, Typeface.NORMAL));
    row.addView(copy);

    Switch toggle = new Switch(activity);
    UiKit.styleSwitch(toggle);
    toggle.setChecked(NotificationPreferences.isEnabled(preferences, category));
    toggle.setContentDescription(title + " bildirimleri");
    toggle.setOnCheckedChangeListener((button, checked) -> {
      NotificationPreferences.setEnabled(preferences, category, checked);
      listener.refreshNotifications(data);
    });
    row.addView(
        toggle,
        new LinearLayout.LayoutParams(-2, UiKit.dp(activity, 48))
    );
    return row;
  }

  private View sectionLabel(String value) {
    TextView label = UiKit.text(
        activity,
        value,
        16,
        UiKit.TEXT,
        Typeface.BOLD
    );
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(activity, 7), 0, UiKit.dp(activity, 7));
    label.setLayoutParams(params);
    return label;
  }

  private View settingLine(String label, String value, int tone) {
    LinearLayout row = UiKit.row(activity);
    TextView title = UiKit.text(
        activity,
        label,
        13,
        UiKit.MUTED,
        Typeface.BOLD
    );
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    row.addView(title);

    TextView detail = UiKit.text(
        activity,
        value,
        13,
        tone,
        Typeface.BOLD
    );
    detail.setGravity(Gravity.END);
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

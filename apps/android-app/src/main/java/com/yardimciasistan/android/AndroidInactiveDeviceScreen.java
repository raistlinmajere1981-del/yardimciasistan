package com.yardimciasistan.android;

import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

final class AndroidInactiveDeviceScreen {
  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final DeviceIdentity identity;

  AndroidInactiveDeviceScreen(
      ComponentActivity activity,
      SharedPreferences preferences,
      DeviceIdentity identity
  ) {
    this.activity = activity;
    this.preferences = preferences;
    this.identity = identity;
  }

  View build(OperationData data) {
    LinearLayout page = UiKit.column(activity);
    boolean androidEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ANDROID);
    page.addView(androidEnabled
        ? screenIntro(
            "ERİŞİM DURUMU",
            "Bu cihaz pasifleştirildi",
            "Cihaz masaüstünde pasifleştirilmiş. Yerel ağ bağlantısı aynı ağda otomatik hazırlanır; işletme işlemleri için masaüstünden yeniden etkinleştirilmesi gerekir."
        )
        : screenIntro(
            "ERİŞİM DURUMU",
            "Android bağlantısı kapalı",
            "İşletmenin Android hizmeti kapatıldığı için telefondaki işletme verileri temizlendi."
        ));

    ConnectionSettings.LocalConnection inactiveLocal =
        ConnectionSettings.localConnection(preferences);

    if (androidEnabled) {
      LinearLayout localCard = UiKit.card(activity);
      localCard.addView(UiKit.text(activity, "Yerel ağ", 14, UiKit.TEXT, Typeface.BOLD));
      localCard.addView(UiKit.text(
          activity,
          inactiveLocal.isComplete()
              ? "Bu telefon masaüstüyle yerel ağ için otomatik bağlandı. İşletme işlemleri için cihazı masaüstünden etkinleştirin."
              : "Masaüstü aynı ağda bulunursa yerel bağlantı otomatik hazırlanır.",
          12,
          UiKit.SECONDARY,
          Typeface.NORMAL
      ));
      localCard.addView(UiKit.divider(activity));
      localCard.addView(settingLine(
          "Yerel bağlantı",
          inactiveLocal.isComplete()
              ? "Eşleşti"
              : (inactiveLocal.hasEndpoint() ? "Masaüstü bulundu" : "Bekliyor"),
          inactiveLocal.isComplete() ? UiKit.SUCCESS : UiKit.MUTED
      ));
      page.addView(localCard);
    }

    LinearLayout card = UiKit.card(activity);
    card.addView(settingLine("Telefon kimliği", compactDeviceId(), UiKit.MUTED));
    card.addView(UiKit.divider(activity));
    card.addView(settingLine("Rol", data.deviceRoleLabel(), UiKit.WARNING));
    if (inactiveLocal.hasEndpoint()) {
      card.addView(UiKit.divider(activity));
      card.addView(settingLine("Yerel adres", inactiveLocal.baseUrl, UiKit.MUTED));
    }
    page.addView(card);
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
    intro.addView(titleRow);
    intro.addView(UiKit.text(
        activity,
        description,
        12,
        UiKit.SECONDARY,
        Typeface.NORMAL
    ));
    return intro;
  }

  private View settingLine(String label, String value, int tone) {
    LinearLayout row = UiKit.row(activity);
    TextView title = UiKit.text(activity, label, 13, UiKit.MUTED, Typeface.BOLD);
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    row.addView(title);
    TextView detail = UiKit.text(activity, value, 13, tone, Typeface.BOLD);
    detail.setGravity(Gravity.END);
    detail.setMaxWidth(UiKit.dp(activity, 190));
    row.addView(detail);
    return row;
  }

  private String compactDeviceId() {
    return identity.deviceId.length() <= 20
        ? identity.deviceId
        : identity.deviceId.substring(0, 12)
            + "…"
            + identity.deviceId.substring(identity.deviceId.length() - 5);
  }
}

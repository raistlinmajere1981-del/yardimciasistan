package com.yardimciasistan.android;

import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import static com.yardimciasistan.android.AndroidPresentation.shortTimestamp;

final class AndroidConnectionSettingsPanel {
  interface Listener {
    void onSyncRequested();
    void onPairRequested();
  }

  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final OperationData data;
  private final DeviceIdentity identity;
  private final String connectionState;
  private final boolean loading;
  private final int localPendingActionCount;
  private final Listener listener;

  private EditText webModuleInput;
  private EditText syncSecretInput;
  private Button refreshButton;
  private TextView connectionStateValue;
  private TextView lastSyncValue;
  private TextView pendingActionValue;

  AndroidConnectionSettingsPanel(
      ComponentActivity activity,
      SharedPreferences preferences,
      OperationData data,
      DeviceIdentity identity,
      String connectionState,
      boolean loading,
      int localPendingActionCount,
      Listener listener
  ) {
    this.activity = activity;
    this.preferences = preferences;
    this.data = data;
    this.identity = identity;
    this.connectionState = connectionState == null ? "" : connectionState;
    this.loading = loading;
    this.localPendingActionCount = localPendingActionCount;
    this.listener = listener;
  }

  void appendTo(LinearLayout page) {
    webModuleInput = null;
    syncSecretInput = null;

    page.addView(UiKit.sectionTitle(activity, "Bağlantı"));
    boolean embeddedConnectionLocked = ConnectionSettings.isEmbeddedConnectionLocked();
    boolean canEditSettings = !embeddedConnectionLocked
        && (!data.permissionsResolved || data.hasPermission("settings.edit"));

    LinearLayout localCard = UiKit.card(activity);
    localCard.addView(UiKit.text(activity, "Masaüstü bul ve eşleştir", 16, UiKit.TEXT, Typeface.BOLD));
    localCard.addView(UiKit.text(activity,
        "USB internet paylaşımını veya aynı Wi-Fi ağını kullanın. Masaüstünde Ayarlar → Servisler → Android bölümünden QR açın.",
        13, UiKit.SECONDARY, Typeface.NORMAL));
    Button scan = UiKit.button(activity, "QR okut", UiKit.PRIMARY, view -> listener.onPairRequested());
    scan.setEnabled(!loading && (!data.permissionsResolved || data.hasPermission("settings.edit")));
    localCard.addView(scan);
    if (ConnectionSettings.isLocalOnly(preferences)) {
      Button sync = UiKit.outlineButton(activity, "Veriyi yenile", view -> listener.onSyncRequested());
      sync.setEnabled(!loading);
      localCard.addView(sync);
    }
    page.addView(localCard);

    // Existing hosted installations keep their optional online settings. A fresh
    // local installation does not have to choose a transport or enter a Web key.
    if (!ConnectionSettings.isLocalOnly(preferences)
        && !ConnectionSettings.syncSecret(preferences).isEmpty() && canEditSettings) {
      LinearLayout connection = UiKit.card(activity);
      connection.addView(UiKit.text(
          activity,
          "Web modül adresi",
          12,
          UiKit.MUTED,
          Typeface.BOLD
      ));
      webModuleInput = UiKit.input(
          activity,
          "https://firma.example/yardimci-asistan"
      );
      webModuleInput.setInputType(
          InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI
      );
      webModuleInput.setText(ConnectionSettings.webModuleUrl(preferences));
      LinearLayout.LayoutParams inputParams =
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 50));
      inputParams.setMargins(
          0,
          UiKit.dp(activity, 6),
          0,
          UiKit.dp(activity, 12)
      );
      webModuleInput.setLayoutParams(inputParams);
      connection.addView(webModuleInput);

      connection.addView(UiKit.text(
          activity,
          "Güvenlik anahtarı",
          12,
          UiKit.MUTED,
          Typeface.BOLD
      ));
      syncSecretInput = UiKit.input(activity, "Uzun güvenlik anahtarı");
      syncSecretInput.setInputType(
          InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
      );
      syncSecretInput.setText(ConnectionSettings.syncSecret(preferences));
      LinearLayout.LayoutParams secretParams =
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 50));
      secretParams.setMargins(
          0,
          UiKit.dp(activity, 6),
          0,
          UiKit.dp(activity, 12)
      );
      syncSecretInput.setLayoutParams(secretParams);
      connection.addView(syncSecretInput);

      refreshButton = UiKit.button(
          activity,
          loading ? "Bağlanıyor..." : "Canlı Veriyi Çek",
          UiKit.PRIMARY,
          view -> listener.onSyncRequested()
      );
      refreshButton.setEnabled(!loading);
      refreshButton.setLayoutParams(
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 48))
      );
      connection.addView(refreshButton);
      page.addView(connection);
    } else if (!ConnectionSettings.isLocalOnly(preferences)
        && !ConnectionSettings.syncSecret(preferences).isEmpty()) {
      LinearLayout readOnly = UiKit.card(activity);
      readOnly.addView(UiKit.text(
          activity,
          embeddedConnectionLocked
              ? "Bağlantı bilgileri APK içinde hazır"
              : "Bağlantı ayarları salt okunur",
          14,
          UiKit.TEXT,
          Typeface.BOLD
      ));
      readOnly.addView(UiKit.text(
          activity,
          embeddedConnectionLocked
              ? "Tasarım süresince web bağlantısı bu APK'ya sabitlendi ve uygulama güncellendiğinde otomatik olarak korunur."
              : "Web modül adresi ve güvenlik anahtarı yalnız ayar düzenleme yetkisi olan cihazlarda değiştirilebilir.",
          12,
          UiKit.SECONDARY,
          Typeface.NORMAL
      ));
      page.addView(readOnly);
    }

    page.addView(UiKit.sectionTitle(activity, "Bağlantı durumu"));
    LinearLayout state = UiKit.card(activity);
    state.addView(settingLine(
        "Bağlantı durumu",
        connectionState,
        connectionTone(connectionState),
        value -> connectionStateValue = value
    ));
    state.addView(UiKit.divider(activity));

    ConnectionSettings.LocalConnection localSummary =
        ConnectionSettings.localConnection(preferences);
    state.addView(settingLine(
        "Yerel masaüstü",
        localSummary.isPaired()
            ? (localSummary.hasEndpoint()
                ? "Eşleşti · ağda bulundu"
                : "Eşleşti · ağda aranıyor")
            : (localSummary.hasEndpoint()
                ? "Bulundu · eşleştirme bekliyor"
                : "Henüz bulunmadı"),
        localSummary.isPaired() && localSummary.hasEndpoint()
            ? UiKit.SUCCESS
            : UiKit.MUTED
    ));

    if (localSummary.hasEndpoint()) {
      state.addView(UiKit.divider(activity));
      state.addView(settingLine("Yerel adres", localSummary.baseUrl, UiKit.MUTED));
    }

    state.addView(UiKit.divider(activity));
    state.addView(settingLine(
        "Son senkron",
        data.pulledAt.isEmpty() ? "Henüz yok" : shortTimestamp(data.pulledAt),
        UiKit.INFO,
        value -> lastSyncValue = value
    ));
    state.addView(UiKit.divider(activity));

    int visiblePendingActions = data.pendingActions + localPendingActionCount;
    state.addView(settingLine(
        "Bekleyen işlem",
        String.valueOf(visiblePendingActions),
        visiblePendingActions > 0 ? UiKit.WARNING : UiKit.SUCCESS,
        value -> pendingActionValue = value
    ));
    page.addView(state);

    page.addView(UiKit.sectionTitle(activity, "Cihaz"));
    LinearLayout device = UiKit.card(activity);
    device.addView(settingLine("Telefon kimliği", compactDeviceId(), UiKit.MUTED));
    device.addView(UiKit.divider(activity));
    device.addView(settingLine("Cihaz adı", identity.deviceName, UiKit.MUTED));
    device.addView(UiKit.divider(activity));
    device.addView(settingLine("Yetki profili", data.deviceRoleLabel(),
        data.deviceActive ? UiKit.SUCCESS : UiKit.DANGER));
    page.addView(device);
  }

  String webModuleValue() {
    return webModuleInput == null
        ? ConnectionSettings.webModuleUrl(preferences)
        : webModuleInput.getText().toString().trim();
  }

  String syncSecretValue() {
    return syncSecretInput == null
        ? ConnectionSettings.syncSecret(preferences)
        : syncSecretInput.getText().toString().trim();
  }

  String webModuleDraft() {
    return webModuleInput == null ? null : webModuleInput.getText().toString();
  }

  String syncSecretDraft() {
    return syncSecretInput == null ? null : syncSecretInput.getText().toString();
  }

  void restoreDrafts(String webModuleDraft, String syncSecretDraft) {
    restore(webModuleInput, webModuleDraft);
    restore(syncSecretInput, syncSecretDraft);
  }

  private void restore(EditText input, String draft) {
    if (input == null || draft == null) {
      return;
    }
    input.setText(draft);
    input.setSelection(draft.length());
  }

  void updateSyncStatus(OperationData current, String state, boolean busy, int localPendingCount) {
    if (refreshButton != null) {
      refreshButton.setEnabled(!busy);
      refreshButton.setText(busy ? "Bağlanıyor..." : "Canlı Veriyi Çek");
    }
    if (connectionStateValue != null) {
      connectionStateValue.setText(state);
      connectionStateValue.setTextColor(connectionTone(state));
    }
    if (lastSyncValue != null) lastSyncValue.setText(current.pulledAt.isEmpty() ? "Henüz yok" : shortTimestamp(current.pulledAt));
    if (pendingActionValue != null) {
      int pending = current.pendingActions + localPendingCount;
      pendingActionValue.setText(String.valueOf(pending));
      pendingActionValue.setTextColor(pending > 0 ? UiKit.WARNING : UiKit.SUCCESS);
    }
  }

  private android.view.View settingLine(String label, String value, int tone) {
    return settingLine(label, value, tone, ignored -> {});
  }

  private android.view.View settingLine(
      String label,
      String value,
      int tone,
      java.util.function.Consumer<TextView> captureValue
  ) {
    LinearLayout row = UiKit.row(activity);
    android.widget.TextView title = UiKit.text(
        activity,
        label,
        13,
        UiKit.MUTED,
        Typeface.BOLD
    );
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    row.addView(title);

    android.widget.TextView detail = UiKit.text(
        activity,
        value,
        13,
        tone,
        Typeface.BOLD
    );
    detail.setGravity(android.view.Gravity.END);
    detail.setMaxWidth(UiKit.dp(activity, 190));
    row.addView(detail);
    captureValue.accept(detail);
    return row;
  }

  private int connectionTone(String state) {
    if ("Bağlantı hazır".equals(state)
        || "Yerel ağ bağlı".equals(state)
        || "Web bağlantısı hazır".equals(state)
        || state.contains("eşleştirme tamamlandı")) {
      return UiKit.SUCCESS;
    }
    if (state.contains("çekiliyor") || state.contains("eşleştiriliyor")) {
      return UiKit.INFO;
    }
    return "Henüz bağlanmadı".equals(state) ? UiKit.MUTED : UiKit.DANGER;
  }

  private String compactDeviceId() {
    if (identity.deviceId.length() <= 20) {
      return identity.deviceId;
    }
    return identity.deviceId.substring(0, 12)
        + "…"
        + identity.deviceId.substring(identity.deviceId.length() - 5);
  }
}

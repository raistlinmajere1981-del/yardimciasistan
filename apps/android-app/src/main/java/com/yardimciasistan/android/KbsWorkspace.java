package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Typeface;
import android.view.View;
import android.widget.TextView;
import java.util.ArrayList;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.Toast;
import org.json.JSONException;
import org.json.JSONObject;

final class KbsWorkspace {
  interface Listener { void onAction(String type, JSONObject payload, String message); }
  private KbsWorkspace() {}

  static void append(Context context, LinearLayout page, OperationData data, Listener listener) {
    if (!KbsUiRules.canView(data)) return;
    TextView provider = UiKit.text(context,
        "Sağlayıcı: " + ("jandarma".equals(data.kbs.provider) ? "Jandarma" : "EGM"),
        13, UiKit.MUTED, Typeface.BOLD);
    page.addView(provider);
    ArrayList<View> stats = new ArrayList<>();
    stats.add(UiKit.metricCard(context, "Bekleyen", data.kbs.pendingCount, UiKit.WARNING, null));
    stats.add(UiKit.metricCard(context, "Başarısız", data.kbs.failedCount, UiKit.DANGER, null));
    stats.add(UiKit.metricCard(context, "Sonuç belirsiz", data.kbs.unknownCount, UiKit.WARNING, null));
    stats.add(UiKit.metricCard(context, "Gönderilen", data.kbs.sentCount, UiKit.SUCCESS, null));
    stats.add(UiKit.metricCard(context, "Kimliği hazır", data.kbs.identityReadyCount, UiKit.SUCCESS, null));
    stats.add(UiKit.metricCard(context, "Kimliği eksik", data.kbs.identityMissingCount, UiKit.WARNING, null));
    page.addView(UiKit.metricGrid(context, stats));
    LinearLayout notice = UiKit.card(context);
    notice.addView(UiKit.text(context,
        data.kbs.configured
            ? "Gönderim isteği masaüstünde işlenir. Kuyruğa alınması resmi gönderim değildir."
            : "KBS bağlantı ayarları masaüstünde tamamlanmalı.",
        13, UiKit.WARNING, Typeface.NORMAL));
    page.addView(notice);
    int history = 0;
    for (OperationData.ActionRecord action : data.actions) {
      if (!KbsUiRules.isAction(action.type) || history++ >= 5) continue;
      LinearLayout card = UiKit.card(context);
      card.addView(UiKit.text(context, AndroidPresentation.formatActionType(action.type), 16, UiKit.TEXT, Typeface.BOLD));
      card.addView(UiKit.text(context, KbsUiRules.actionFeedback(action.type, action.status), 16, UiKit.SECONDARY, Typeface.NORMAL));
      if (!action.errorMessage.isEmpty()) card.addView(UiKit.text(context, action.errorMessage, 16, UiKit.DANGER, Typeface.NORMAL));
      page.addView(card);
    }
    NativeSearchList search = null;
    if (!data.kbs.notifications.isEmpty()) {
      search = new NativeSearchList(context, "Misafir, oda veya durum ara");
      LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, -2);
      searchParams.setMargins(0, UiKit.dp(context, 8), 0, UiKit.dp(context, 12));
      page.addView(search.input(), searchParams);
    }
    for (OperationData.KbsNotification row : data.kbs.notifications) {
      LinearLayout card = UiKit.card(context);
      card.addView(UiKit.text(context, row.customerName + " · " + row.roomName + " " + row.roomNumber, 18, UiKit.TEXT, Typeface.BOLD));
      String kind = "departure".equals(row.kind) ? "Çıkış" : "room_change".equals(row.kind) ? "Oda değişimi" : "Giriş";
      card.addView(UiKit.text(context, kind + " · " + row.occurredAt, 16, UiKit.MUTED, Typeface.NORMAL));
      card.addView(UiKit.text(context, KbsUiRules.statusLabel(row.status), 16,
          "sent".equals(row.status) ? UiKit.SUCCESS : UiKit.WARNING, Typeface.BOLD));
      if (!row.identityReady) card.addView(UiKit.text(context, "Kimlik bilgileri eksik; masaüstünde tamamlayın.", 16, UiKit.WARNING, Typeface.NORMAL));
      if (row.deliveryRequested) card.addView(UiKit.text(context, "Masaüstüne ulaştı; gönderim işlenmeyi bekliyor.", 16, UiKit.SECONDARY, Typeface.NORMAL));
      if ("queued".equals(row.requestState) && "failed".equals(row.status)) card.addView(UiKit.text(context, "Önceki isteğin yerel tamamlanma kaydı bekleniyor. Durumu yenileyin.", 16, UiKit.WARNING, Typeface.NORMAL));
      if ("waiting".equals(row.requestState)) card.addView(UiKit.text(context, "Masaüstüne ulaştı; gönderim koşulları tamamlanamadı. Masaüstü KBS bağlantısını ve sağlayıcı hazırlığını kontrol edin.", 16, UiKit.WARNING, Typeface.NORMAL));
      if ("denied".equals(row.requestState)) card.addView(UiKit.text(context, "Masaüstüne ulaştı; güncel cihaz veya işletme yetkisi gönderimi durdurdu.", 16, UiKit.WARNING, Typeface.NORMAL));
      if ("submission_unknown".equals(row.status)) card.addView(UiKit.text(context,
          "Gönderim sürüyor veya sonucu belirsiz. Yeniden gönderilemez; resmi kurum portalındaki kaydı kontrol edin.", 16, UiKit.WARNING, Typeface.NORMAL));
      if (KbsUiRules.canSend(data, row)) card.addView(UiKit.button(context, "Gönderim Talep Et", UiKit.PRIMARY,
          view -> confirm(context, data, row, KbsUiRules.SEND, listener)));
      if (KbsUiRules.canRetry(data, row)) card.addView(UiKit.button(context, "Yeniden denemeye hazırla", UiKit.SECONDARY,
          view -> confirm(context, data, row, KbsUiRules.RETRY, listener)));
      if (KbsUiRules.canReconcile(data, row)) card.addView(UiKit.button(context, "Haricen gönderildi", UiKit.SECONDARY,
          view -> confirmExternal(context, data, row, listener)));
      page.addView(card);
      if (search != null) {
        search.add(card, row.customerName + " " + row.roomName + " " + row.roomNumber
            + " " + row.kind + " " + row.status + " " + row.occurredAt
            + " " + KbsUiRules.statusLabel(row.status));
      }
    }
    if (search != null) {
      TextView none = UiKit.text(context, "Aramayla eşleşen KBS bildirimi yok.",
          13, UiKit.MUTED, Typeface.NORMAL);
      page.addView(none);
      search.setNoMatchesNotice(none);
    }
    if (data.kbs.notifications.isEmpty()) page.addView(UiKit.text(context, "KBS bildirim kaydı yok.", 16, UiKit.MUTED, Typeface.NORMAL));
    if (data.kbs.notifications.size() >= 500) page.addView(UiKit.text(context, "En fazla 500 bildirim gösterilir. Tüm durumların sayıları yukarıdadır.", 16, UiKit.MUTED, Typeface.NORMAL));
  }

  private static void confirm(Context context, OperationData data, OperationData.KbsNotification row, String type, Listener listener) {
    new AlertDialog.Builder(context).setTitle(KbsUiRules.SEND.equals(type) ? "Gönderim isteği" : "Yeniden denemeye hazırla")
        .setMessage(KbsUiRules.SEND.equals(type) ? "Masaüstü güncel kimlik ve bağlantı koşullarını kontrol ederek gönderimi işleyecek. İstek resmi gönderim değildir."
            : "Sağlayıcının kesin reddettiği bildirim bekleyen duruma alınacak. Bu işlem gönderim yapmaz.")
        .setNegativeButton("Vazgeç", null).setPositiveButton("Talep Et", (dialog, which) -> submit(context, data, row, type, false, listener)).show();
  }
  private static void confirmExternal(Context context, OperationData data, OperationData.KbsNotification row, Listener listener) {
    new AlertDialog.Builder(context).setTitle("Haricen gönderildi")
        .setMessage("Bu işlemi yalnız bildirimin resmi EGM/Jandarma portalında kayıtlı olduğunu kendiniz doğruladıysanız kullanın. Uygulama portalı doğrulamaz.")
        .setNegativeButton("Vazgeç", null).setPositiveButton("Kaydı kontrol ettim, devam et", (dialog, which) -> {
          dialog.dismiss();
          CheckBox verified = new CheckBox(context);
          verified.setText("Bu misafirin bu giriş/çıkış/oda değişimi kaydını resmi kurum portalında gördüm; haricen gönderildi olarak kaydedilmesini onaylıyorum.");
          verified.setPadding(UiKit.dp(context, 16), UiKit.dp(context, 12), UiKit.dp(context, 16), UiKit.dp(context, 12));
          AlertDialog second = new AlertDialog.Builder(context).setTitle("İkinci onay · " + row.customerName)
              .setView(verified).setNegativeButton("Vazgeç", null).setPositiveButton("Haricen gönderildi olarak kaydet", null).create();
          second.setOnShowListener(value -> {
            Button save = second.getButton(AlertDialog.BUTTON_POSITIVE);
            save.setEnabled(false);
            verified.setOnCheckedChangeListener((button, checked) -> save.setEnabled(checked));
            save.setOnClickListener(view -> { if (verified.isChecked()) { save.setEnabled(false); second.dismiss(); submit(context, data, row, KbsUiRules.EXTERNAL, true, listener); } });
          });
          second.show();
        }).show();
  }
  private static void submit(Context context, OperationData data, OperationData.KbsNotification row, String type, boolean confirmed, Listener listener) {
    try { listener.onAction(type, KbsUiRules.payload(data, row, type, confirmed, confirmed), KbsUiRules.actionFeedback(type, "pending")); }
    catch (JSONException | IllegalArgumentException error) { Toast.makeText(context,
        error.getMessage() == null ? "KBS isteği hazırlanamadı; güncel veriyi çekin." : error.getMessage(), Toast.LENGTH_LONG).show(); }
  }
}

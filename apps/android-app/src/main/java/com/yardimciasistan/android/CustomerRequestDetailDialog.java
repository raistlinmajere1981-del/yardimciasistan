package com.yardimciasistan.android;

import android.app.Dialog;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class CustomerRequestDetailDialog {
  interface Listener {
    void addHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen);
    void openDialer(String phone);
    void openWhatsApp(String phone, String message);
    void showPreparedReply(String customerName, String message);
    void sendAction(String actionType, JSONObject payload, String successMessage);
    void confirm(String title, String message, Runnable action);
    void configureFullDialog(Dialog dialog);
  }

  static void show(
      ComponentActivity activity,
      OperationData data,
      OperationData.RequestRecord request,
      AndroidVoiceController voice,
      Listener listener
  ) {
    Dialog dialog = new Dialog(activity);
    LinearLayout shell = UiKit.column(activity);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(
        UiKit.dp(activity, 16),
        UiKit.dp(activity, 14),
        UiKit.dp(activity, 16),
        UiKit.dp(activity, 20)
    );

    LinearLayout header = UiKit.row(activity);
    LinearLayout heading = UiKit.column(activity);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(activity, "TALEP DETAYI"));
    heading.addView(UiKit.title(activity, request.customerName));
    header.addView(heading);
    listener.addHeaderActions(
        header,
        dialog,
        () -> show(activity, data, request, voice, listener)
    );
    shell.addView(header);

    LinearLayout page = UiKit.column(activity);
    LinearLayout summary = UiKit.card(activity);
    summary.addView(detailLine(activity, "Talep", formatRequestType(request.type)));
    summary.addView(UiKit.divider(activity));
    summary.addView(detailLine(
        activity,
        "Tarih / kişi",
        requestDate(request)
            + (request.guestCount > 0 ? " · " + request.guestCount + " kişi" : "")
    ));
    summary.addView(UiKit.divider(activity));
    summary.addView(detailLine(activity, "Durum", formatRequestStatus(request.status)));

    boolean qrOrder = AndroidUiRules.isQrOrderRequest(request);
    if (qrOrder) {
      summary.addView(UiKit.divider(activity));
      summary.addView(detailLine(activity, "Sipariş kaynağı",
          request.qrOrder == null ? "Kaynak bilgisi bulunamadı" : request.qrOrder.sourceLabel));
      if (request.qrOrder == null || request.qrOrder.invalidItems || request.qrOrder.items.isEmpty()) {
        summary.addView(UiKit.text(activity,
            "Sipariş kalemleri doğrulanamadı. Masaüstünde kontrol edin.",
            13, UiKit.WARNING, Typeface.BOLD));
      } else {
        for (OperationData.QrOrderItem item : request.qrOrder.items) {
          summary.addView(UiKit.divider(activity));
          summary.addView(detailLine(activity, item.quantity + " × " + item.name,
              money(item.quantity * item.unitPrice, item.currency)));
          if (!item.note.isEmpty()) {
            summary.addView(UiKit.text(activity, "Not: " + item.note,
                12, UiKit.MUTED, Typeface.NORMAL));
          }
        }
        summary.addView(UiKit.divider(activity));
        summary.addView(detailLine(activity, "Talep toplamı",
            money(request.qrOrder.total, request.qrOrder.currency)));
      }
      summary.addView(UiKit.text(activity,
          request.qrOrder != null && !request.qrOrder.decisionReady
            ? "Sipariş masaüstüne alındığında kabul ve ret işlemleri açılır."
            : "İşlem masaüstünde güncel QR, fiyat, stok ve açık hesap doğrulamasından sonra tamamlanır.",
          12, UiKit.MUTED, Typeface.NORMAL));
    }

    if (!request.message.isEmpty()) {
      summary.addView(UiKit.divider(activity));
      summary.addView(UiKit.text(
          activity,
          request.message,
          14,
          UiKit.TEXT,
          Typeface.NORMAL
      ));
    }

    if (AndroidUiRules.canUseAi(data) && !request.aiSummary.isEmpty()) {
      summary.addView(UiKit.divider(activity));
      summary.addView(UiKit.text(
          activity,
          "Kısa özet",
          12,
          UiKit.PRIMARY,
          Typeface.BOLD
      ));
      summary.addView(UiKit.text(
          activity,
          request.aiSummary,
          13,
          UiKit.TEXT,
          Typeface.NORMAL
      ));
    }
    page.addView(summary);
    voice.addSpeaker(dialog, summary, request.message, () -> voice.hasPermission("customer.view"));

    EditText reply = new EditText(activity);
    reply.setContentDescription("Talep yanıtı taslağı");
    reply.setHint("Yanıt taslağı");
    reply.setText(request.readyMessage());
    reply.setMinLines(2);
    reply.setMaxLines(5);
    reply.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
        | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    if (AndroidUiRules.canUseWhatsApp(data) && data.hasPermission("customer.respond")) {
      page.addView(UiKit.sectionTitle(activity, "Yanıt taslağı"));
      page.addView(reply);
      voice.addDictation(dialog, page, reply, AndroidVoiceRules.MAX_TEXT_CHARS,
          () -> voice.hasPermission("customer.respond"));
    }

    page.addView(UiKit.sectionTitle(activity, "İletişim"));
    LinearLayout contact = UiKit.row(activity);
    UiKit.addAction(
        contact,
        UiKit.outlineButton(
            activity,
            "Ara",
            view -> listener.openDialer(request.customerPhone)
        ),
        activity
    );
    if (AndroidUiRules.canUseWhatsApp(data)
        && data.hasPermission("customer.respond")) {
      UiKit.addAction(
          contact,
          UiKit.button(
              activity,
              "WhatsApp",
              UiKit.PRIMARY,
              view -> listener.openWhatsApp(
                  request.customerPhone,
                  reply.getText().toString()
              )
          ),
          activity
      );
    }
    page.addView(contact);

    String readyMessage = request.readyMessage();
    if (!readyMessage.isEmpty()
        && AndroidUiRules.canUseWhatsApp(data)
        && data.hasPermission("customer.respond")) {
      Button ready = UiKit.outlineButton(
          activity,
          "Hazır Cevabı Göster",
          view -> listener.showPreparedReply(request.customerName, readyMessage)
      );
      LinearLayout.LayoutParams readyParams =
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
      readyParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      ready.setLayoutParams(readyParams);
      page.addView(ready);
    }

    if (qrOrder && (AndroidUiRules.canDecideQrOrder(data, request, true)
        || AndroidUiRules.canDecideQrOrder(data, request, false))) {
      page.addView(UiKit.sectionTitle(activity,"QR sipariş kararı"));
      LinearLayout decisions = UiKit.row(activity);
      if (AndroidUiRules.canDecideQrOrder(data, request, true)) {
        final String action = "table_order".equals(request.type)
            ? "qr_table_order_accept" : "qr_room_order_accept";
        final String destination = "table_order".equals(request.type) ? "masa adisyonuna" : "oda hesabına";
        UiKit.addAction(decisions,UiKit.button(activity, "Siparişi kabul et",UiKit.PRIMARY,
            view -> listener.confirm("QR siparişi kabul et",
                request.qrOrder.sourceLabel + " için sipariş " + destination
                    + " aktarılsın mı? Fiyat ve stok masaüstünde yeniden denetlenecek.",
                () -> {
                  listener.sendAction(action,
                      payload("request_id",request.id,"expected_updated_at",request.updatedAt),
                      "Sipariş kabulü masaüstüne iletildi; doğrulama sonucu senkronize edilecek.");
                  dialog.dismiss();
                })),activity);
      }
      if (AndroidUiRules.canDecideQrOrder(data, request, false)) {
        UiKit.addAction(decisions,UiKit.dangerButton(activity,"Reddet",
            view -> listener.confirm("QR siparişini reddet",
                "Bu QR siparişi adisyona veya oda hesabına aktarılmadan reddedilsin mi?",
                () -> {
                  listener.sendAction("qr_order_reject",
                      payload("request_id",request.id,"expected_updated_at",request.updatedAt),
                      "Sipariş reddi masaüstüne iletildi; sonuç senkronize edilecek.");
                  dialog.dismiss();
                })),activity);
      }
      page.addView(decisions);
    }

    boolean canConvert = !qrOrder && AndroidUiRules.canConvertRequest(data, request);
    boolean canRespond = !qrOrder && data.hasPermission("customer.respond");
    boolean canReject = !qrOrder && data.hasPermission("customer.reject");
    boolean canMarkAnswered = !qrOrder && data.hasPermission("customer.mark_answered");

    if (canConvert || canRespond || canReject || canMarkAnswered) {
      page.addView(UiKit.sectionTitle(activity, "Hızlı karar"));
    }

    if (canConvert) {
      Button convert = UiKit.button(
          activity,
          "Rezervasyona Çevir",
          UiKit.PRIMARY,
          view -> {
            listener.sendAction(
                "customer_request_convert_to_reservation",
                payload(
                    "request_id", request.id,
                    "expected_updated_at", request.updatedAt
                ),
                "Talep rezervasyona çevrilmek üzere gönderildi."
            );
            dialog.dismiss();
          }
      );
      convert.setLayoutParams(
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46))
      );
      page.addView(convert);
    }

    if (canRespond || canReject) {
      LinearLayout decisions = UiKit.row(activity);
      LinearLayout.LayoutParams decisionParams =
          new LinearLayout.LayoutParams(-1, -2);
      decisionParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      decisions.setLayoutParams(decisionParams);

      if (canRespond) {
        UiKit.addAction(
            decisions,
            UiKit.outlineButton(activity, "Onayla", view -> {
              listener.sendAction(
                  "customer_request_approve",
                  payload(
                      "request_id", request.id,
                      "expected_updated_at", request.updatedAt
                  ),
                  "Talep onayı gönderildi."
              );
              dialog.dismiss();
            }),
            activity
        );
      }

      if (canReject) {
        UiKit.addAction(
            decisions,
            UiKit.dangerButton(activity, "Reddet", view ->
                listener.confirm(
                    "Talebi reddet",
                    request.customerName + " talebi reddedilsin mi?",
                    () -> {
                      listener.sendAction(
                          "customer_request_reject",
                          payload(
                              "request_id", request.id,
                              "expected_updated_at", request.updatedAt
                          ),
                          "Talep reddi gönderildi."
                      );
                      dialog.dismiss();
                    }
                )
            ),
            activity
        );
      }
      page.addView(decisions);
    }

    if (canMarkAnswered || canRespond) {
      LinearLayout response = UiKit.row(activity);
      LinearLayout.LayoutParams responseParams =
          new LinearLayout.LayoutParams(-1, -2);
      responseParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      response.setLayoutParams(responseParams);

      if (canMarkAnswered) {
        UiKit.addAction(
            response,
            UiKit.button(activity, "Cevaplandı", UiKit.ACCENT, view -> {
              listener.sendAction(
                  "customer_request_mark_answered",
                  payload(
                      "request_id", request.id,
                      "expected_updated_at", request.updatedAt
                  ),
                  "Talep cevaplandı olarak gönderildi."
              );
              dialog.dismiss();
            }),
            activity
        );
      }

      if (canRespond) {
        UiKit.addAction(
            response,
            UiKit.outlineButton(activity, "Yeniden Aç", view -> {
              listener.sendAction(
                  "customer_request_reopen",
                  payload(
                      "request_id", request.id,
                      "expected_updated_at", request.updatedAt
                  ),
                  "Talep yeniden açılmak üzere gönderildi."
              );
              dialog.dismiss();
            }),
            activity
        );
      }
      page.addView(response);
    }

    if (!qrOrder && AndroidUiRules.canDelete(data, "request.delete")) {
      page.addView(UiKit.sectionTitle(activity, "Yönetici işlemi"));
      Button delete = UiKit.dangerButton(
          activity,
          "Talebi Sil",
          view -> listener.confirm(
              "Talebi sil",
              request.customerName
                  + " talebi ve bu talebe bağlı hazır mesaj silinsin mi?",
              () -> {
                listener.sendAction(
                    "customer_request_delete",
                    payload(
                        "request_id", request.id,
                        "expected_updated_at", request.updatedAt
                    ),
                    "Talep silinmek üzere gönderildi."
                );
                dialog.dismiss();
              }
          )
      );
      delete.setLayoutParams(
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46))
      );
      page.addView(delete);
    }

    ScrollView scroll = UiKit.scroll(activity, page);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);
    dialog.setContentView(shell);
    voice.bindDialog(dialog);
    dialog.show();
    listener.configureFullDialog(dialog);
  }

  private static View detailLine(
      ComponentActivity activity,
      String label,
      String value
  ) {
    LinearLayout row = UiKit.row(activity);
    TextView labelView = UiKit.text(
        activity,
        label,
        12,
        UiKit.MUTED,
        Typeface.BOLD
    );
    labelView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 0.38f));
    row.addView(labelView);

    TextView valueView = UiKit.text(
        activity,
        value,
        13,
        UiKit.TEXT,
        Typeface.BOLD
    );
    valueView.setGravity(Gravity.END);
    valueView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 0.62f));
    row.addView(valueView);
    return row;
  }

  private static JSONObject payload(Object... values) {
    JSONObject payload = new JSONObject();
    try {
      for (int index = 0; index + 1 < values.length; index += 2) {
        payload.put(String.valueOf(values[index]), values[index + 1]);
      }
    } catch (Exception ignored) {
      // UI values are primitive strings and numbers.
    }
    return payload;
  }

  private CustomerRequestDetailDialog() {}
}

package com.yardimciasistan.android;

import android.app.Dialog;
import android.graphics.Typeface;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

final class MessageDetailDialog {
  interface Listener {
    void addHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen);
    void copyText(String message);
    void openWhatsApp(String phone, String message);
    void openDialer(String phone);
    void sendAction(String actionType, JSONObject payload, String successMessage);
    void confirm(String title, String message, Runnable action);
    void configureFullDialog(Dialog dialog);
  }

  static void show(
      ComponentActivity activity,
      OperationData data,
      OperationData.MessageRecord message,
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
    heading.addView(UiKit.eyebrow(activity, "MESAJ DETAYI"));
    heading.addView(UiKit.title(activity, message.customerName));
    header.addView(heading);
    listener.addHeaderActions(
        header,
        dialog,
        () -> show(activity, data, message, listener)
    );
    shell.addView(header);

    LinearLayout page = UiKit.column(activity);
    LinearLayout messageCard = UiKit.card(activity);
    messageCard.addView(UiKit.badge(
        activity,
        message.message.isEmpty() ? "Cevap bekleniyor" : "Hazır",
        message.message.isEmpty() ? UiKit.WARNING : UiKit.PRIMARY
    ));

    TextView body = UiKit.text(
        activity,
        message.message.isEmpty()
            ? "Bu talep için henüz hazır mesaj bulunmuyor."
            : message.message,
        14,
        message.message.isEmpty() ? UiKit.MUTED : UiKit.TEXT,
        Typeface.NORMAL
    );
    LinearLayout.LayoutParams bodyParams =
        new LinearLayout.LayoutParams(-1, -2);
    bodyParams.setMargins(0, UiKit.dp(activity, 10), 0, 0);
    body.setLayoutParams(bodyParams);
    messageCard.addView(body);
    page.addView(messageCard);

    if (AndroidUiRules.canUseWhatsApp(data)
        && data.hasPermission("customer.respond")
        && !message.message.isEmpty()) {
      LinearLayout responseActions = UiKit.row(activity);
      UiKit.addAction(
          responseActions,
          UiKit.outlineButton(
              activity,
              "Kopyala",
              view -> listener.copyText(message.message)
          ),
          activity
      );
      UiKit.addAction(
          responseActions,
          UiKit.button(
              activity,
              "WhatsApp'ta Aç",
              UiKit.PRIMARY,
              view -> listener.openWhatsApp(
                  message.customerPhone,
                  message.message
              )
          ),
          activity
      );
      page.addView(responseActions);
    }

    if (!message.customerPhone.isEmpty()
        || (!message.requestId.isEmpty()
            && data.hasPermission("customer.mark_answered"))) {
      LinearLayout followUp = UiKit.row(activity);
      LinearLayout.LayoutParams followUpParams =
          new LinearLayout.LayoutParams(-1, -2);
      followUpParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      followUp.setLayoutParams(followUpParams);

      if (!message.customerPhone.isEmpty()) {
        UiKit.addAction(
            followUp,
            UiKit.outlineButton(
                activity,
                "Ara",
                view -> listener.openDialer(message.customerPhone)
            ),
            activity
        );
      }

      if (!message.requestId.isEmpty()
          && data.hasPermission("customer.mark_answered")) {
        OperationData.RequestRecord request = data.requestById(message.requestId);
        String expectedUpdatedAt = request == null ? "" : request.updatedAt;
        UiKit.addAction(
            followUp,
            UiKit.button(activity, "Cevaplandı", UiKit.ACCENT, view -> {
              listener.sendAction(
                  "customer_request_mark_answered",
                  payload(
                      "request_id", message.requestId,
                      "message_id", message.id,
                      "expected_updated_at", expectedUpdatedAt
                  ),
                  "Talep cevaplandı olarak gönderildi."
              );
              dialog.dismiss();
            }),
            activity
        );
      }
      page.addView(followUp);
    }

    if (AndroidUiRules.canDelete(data, "message.delete")) {
      page.addView(UiKit.sectionTitle(activity, "Yönetici işlemi"));
      Button delete = UiKit.dangerButton(
          activity,
          "Mesajı Sil",
          view -> listener.confirm(
              "Hazır mesajı sil",
              "Bu hazır mesaj silinsin mi? Talep kaydı korunur.",
              () -> {
                listener.sendAction(
                    "message_delete",
                    payload(
                        "message_id", message.id,
                        "request_id", message.requestId,
                        "expected_updated_at", message.updatedAt
                    ),
                    "Hazır mesaj silinmek üzere gönderildi."
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
    dialog.show();
    listener.configureFullDialog(dialog);
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

  private MessageDetailDialog() {}
}

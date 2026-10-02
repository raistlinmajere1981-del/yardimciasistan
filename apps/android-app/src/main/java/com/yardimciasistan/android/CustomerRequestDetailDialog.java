package com.yardimciasistan.android;

import android.app.Dialog;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
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
        () -> show(activity, data, request, listener)
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
                  request.readyMessage()
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

    boolean canConvert = AndroidUiRules.canConvertRequest(data, request);
    boolean canRespond = data.hasPermission("customer.respond");
    boolean canReject = data.hasPermission("customer.reject");
    boolean canMarkAnswered = data.hasPermission("customer.mark_answered");

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

    if (AndroidUiRules.canDelete(data, "request.delete")) {
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

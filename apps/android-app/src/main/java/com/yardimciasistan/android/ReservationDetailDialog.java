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

import java.util.ArrayList;
import java.util.List;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class ReservationDetailDialog {
  interface Listener {
    void addHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen);
    void openDialer(String phone);
    void openWhatsApp(String phone, String message);
    void editReservation(
        ReservationEditorDialog.Kind kind,
        OperationData.ReservationRecord reservation
    );
    void sendReservationAction(
        OperationData.ReservationRecord reservation,
        String actionType,
        String successMessage
    );
    void confirm(String title, String message, Runnable action);
    void configureFullDialog(Dialog dialog);
    void showError(String message);
  }

  static void show(
      ComponentActivity activity,
      OperationData data,
      OperationData.ReservationRecord reservation,
      Listener listener
  ) {
    if (!AndroidUiRules.reservationAllowed(data, reservation)
        || !data.hasPermission("reservation.view")) {
      listener.showError("Bu rezervasyon alanı işletmede etkin değil.");
      return;
    }

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
    heading.addView(UiKit.eyebrow(activity, "REZERVASYON DETAYI"));
    heading.addView(UiKit.title(
        activity,
        reservation.customerName.isEmpty()
            ? reservation.title
            : reservation.customerName
    ));
    header.addView(heading);
    listener.addHeaderActions(
        header,
        dialog,
        () -> show(activity, data, reservation, listener)
    );
    shell.addView(header);

    LinearLayout page = UiKit.column(activity);
    LinearLayout summary = UiKit.card(activity);
    summary.addView(detailLine(
        activity,
        "Durum",
        formatReservationStatus(reservation.status)
    ));
    summary.addView(UiKit.divider(activity));
    summary.addView(detailLine(
        activity,
        "Tarih",
        joinDateRange(reservation.startDate, reservation.endDate)
    ));

    if (!reservation.time.isEmpty() || reservation.guestCount > 0) {
      summary.addView(UiKit.divider(activity));
      summary.addView(detailLine(
          activity,
          "Saat / kişi",
          joinNonEmpty(
              " · ",
              reservation.time,
              reservation.guestCount > 0
                  ? reservation.guestCount + " kişi"
                  : ""
          )
      ));
    }

    if (!reservation.roomIds.isEmpty()) {
      summary.addView(UiKit.divider(activity));
      summary.addView(detailLine(
          activity,
          "Oda",
          namesForRooms(data, reservation.roomIds)
      ));
    }

    if (!reservation.tableIds.isEmpty()) {
      summary.addView(UiKit.divider(activity));
      summary.addView(detailLine(
          activity,
          "Masa",
          namesForTables(data, reservation.tableIds)
      ));
    }

    if (!reservation.notes.isEmpty()) {
      summary.addView(UiKit.divider(activity));
      summary.addView(UiKit.text(
          activity,
          reservation.notes,
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
            view -> listener.openDialer(reservation.customerPhone)
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
                  reservation.customerPhone,
                  reservationMessage(reservation)
              )
          ),
          activity
      );
    }
    page.addView(contact);

    ReservationEditorDialog.Kind editKind = editorKind(reservation);
    if (editKind != null
        && data.hasPermission("reservation.update")
        && ("pending".equals(reservation.status)
            || "approved".equals(reservation.status))) {
      page.addView(UiKit.sectionTitle(activity, "Düzenleme"));
      Button edit = UiKit.outlineButton(
          activity,
          "Rezervasyonu Düzenle",
          view -> {
            dialog.dismiss();
            listener.editReservation(editKind, reservation);
          }
      );
      edit.setLayoutParams(
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46))
      );
      page.addView(edit);
    }

    if ("pending".equals(reservation.status)
        && (data.hasPermission("reservation.approve")
            || data.hasPermission("reservation.reject"))) {
      page.addView(UiKit.sectionTitle(activity, "Karar"));
      LinearLayout decisions = UiKit.row(activity);

      if (data.hasPermission("reservation.approve")) {
        UiKit.addAction(
            decisions,
            UiKit.button(activity, "Onayla", UiKit.PRIMARY, view -> {
              listener.sendReservationAction(
                  reservation,
                  "reservation_approve",
                  "Rezervasyon onayı gönderildi."
              );
              dialog.dismiss();
            }),
            activity
        );
      }

      if (data.hasPermission("reservation.reject")) {
        UiKit.addAction(
            decisions,
            UiKit.dangerButton(activity, "Reddet", view ->
                listener.confirm(
                    "Rezervasyonu reddet",
                    reservation.customerName + " rezervasyonu reddedilsin mi?",
                    () -> {
                      listener.sendReservationAction(
                          reservation,
                          "reservation_reject",
                          "Rezervasyon reddi gönderildi."
                      );
                      dialog.dismiss();
                    }
                )
            ),
            activity
        );
      }
      page.addView(decisions);
    } else if ("approved".equals(reservation.status)
        && data.hasPermission("reservation.cancel")) {
      page.addView(UiKit.sectionTitle(activity, "Rezervasyon işlemi"));
      Button cancel = UiKit.dangerButton(
          activity,
          "Rezervasyonu İptal Et",
          view -> listener.confirm(
              "Rezervasyonu iptal et",
              "Bu rezervasyon iptal edilsin mi?",
              () -> {
                listener.sendReservationAction(
                    reservation,
                    "reservation_cancel",
                    "Rezervasyon iptali gönderildi."
                );
                dialog.dismiss();
              }
          )
      );
      cancel.setLayoutParams(
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46))
      );
      page.addView(cancel);
    }

    ScrollView scroll = UiKit.scroll(activity, page);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);
    dialog.setContentView(shell);
    dialog.show();
    listener.configureFullDialog(dialog);
  }

  static ReservationEditorDialog.Kind editorKind(
      OperationData.ReservationRecord reservation
  ) {
    if (reservation == null) {
      return null;
    }
    if ("room".equals(reservation.type)) {
      return ReservationEditorDialog.Kind.ROOM;
    }
    if (AndroidUiRules.isRestaurantOnlyReservation(reservation)) {
      return ReservationEditorDialog.Kind.TABLE;
    }
    return null;
  }

  private static String namesForRooms(OperationData data, List<String> roomIds) {
    ArrayList<String> names = new ArrayList<>();
    for (String roomId : roomIds) {
      for (OperationData.RoomRecord room : data.rooms) {
        if (roomId.equals(room.id)) {
          names.add(room.name);
          break;
        }
      }
    }
    return names.isEmpty()
        ? "Atama bekliyor"
        : joinNonEmpty(", ", names.toArray(new String[0]));
  }

  private static String namesForTables(OperationData data, List<String> tableIds) {
    ArrayList<String> names = new ArrayList<>();
    for (String tableId : tableIds) {
      for (OperationData.TableRecord table : data.tables) {
        if (tableId.equals(table.id)) {
          names.add(table.name);
          break;
        }
      }
    }
    return names.isEmpty()
        ? "Atama bekliyor"
        : joinNonEmpty(", ", names.toArray(new String[0]));
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

  private ReservationDetailDialog() {}
}

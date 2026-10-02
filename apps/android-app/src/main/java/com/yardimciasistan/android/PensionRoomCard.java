package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class PensionRoomCard {
  interface Listener {
    void onAssignCustomer(OperationData.RoomRecord room);
    void onManageStay(OperationData.CustomerRoomStayRecord stay);
    void onChangeStatus(OperationData.RoomRecord room);
  }

  static View create(
      ComponentActivity activity,
      OperationData data,
      OperationData.RoomRecord room,
      Listener listener
  ) {
    LinearLayout card = UiKit.card(activity);
    OperationData.CustomerRoomStayRecord activeStay = data.activeStayForRoom(room.id);

    LinearLayout top = UiKit.row(activity);
    LinearLayout name = UiKit.column(activity);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    name.addView(UiKit.text(activity, room.name, 15, UiKit.TEXT, Typeface.BOLD));
    name.addView(UiKit.text(
        activity,
        (room.number.isEmpty() ? "" : room.number + " · ") + room.capacity + " kişi",
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(name);
    top.addView(UiKit.badge(activity, formatRoomStatus(room.status), resourceTone(room.status)));
    card.addView(top);

    if (activeStay != null) {
      String summary = activeStay.customerName + " · " + joinDateRange(activeStay.checkInDate, activeStay.checkOutDate);
      card.addView(UiKit.text(activity, summary, 12, UiKit.INFO, Typeface.BOLD));
    } else if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS)
        && !room.activeReservation.isEmpty()) {
      card.addView(UiKit.text(activity, room.activeReservation, 12, UiKit.INFO, Typeface.BOLD));
    }

    if (canManageCustomerRoomStays(data)) {
      Button assignment = UiKit.button(
          activity,
          activeStay == null ? "Müşteri Ata" : "Konaklamayı Yönet",
          UiKit.PRIMARY,
          view -> {
            if (activeStay == null) {
              listener.onAssignCustomer(room);
            } else {
              listener.onManageStay(activeStay);
            }
          }
      );
      LinearLayout.LayoutParams assignmentParams = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 44));
      assignmentParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      assignment.setLayoutParams(assignmentParams);
      assignment.setEnabled(activeStay != null || !data.customers.isEmpty());
      card.addView(assignment);
    }

    if (data.hasPermission("room.update_status") && activeStay == null) {
      Button status = UiKit.outlineButton(
          activity,
          "Durumu Değiştir",
          view -> listener.onChangeStatus(room)
      );
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 44));
      params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      status.setLayoutParams(params);
      card.addView(status);
    }

    return card;
  }

  private static boolean canManageCustomerRoomStays(OperationData data) {
    return data.isAdmin()
        && data.hasPermission("customer.manage")
        && data.hasPermission("room.assign_customer");
  }

  private PensionRoomCard() {}
}

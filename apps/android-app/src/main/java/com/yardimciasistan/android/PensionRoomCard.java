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

    card.addView(UiKit.recordHeader(activity, room.name, 15,
        (room.number.isEmpty() ? "" : room.number + " · ") + room.capacity + " kişi",
        UiKit.badge(activity, formatRoomStatus(room.status), resourceTone(room.status))));

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
      assignment.setEnabled(activeStay != null || !data.customers.isEmpty());
      UiKit.addCardAction(card, assignment, activity);
    }

    if (data.hasPermission("room.update_status") && activeStay == null) {
      Button status = UiKit.outlineButton(
          activity,
          "Durumu Değiştir",
          view -> listener.onChangeStatus(room)
      );
      UiKit.addCardAction(card, status, activity);
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

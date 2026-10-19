package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class PensionStayCard {
  interface Listener {
    void onManageStay(OperationData.CustomerRoomStayRecord stay);
  }

  static View create(
      ComponentActivity activity,
      OperationData data,
      OperationData.CustomerRoomStayRecord stay,
      Listener listener
  ) {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.recordHeader(activity, stay.customerName, 15,
        stay.roomName + (stay.roomNumber.isEmpty() ? "" : " · " + stay.roomNumber),
        UiKit.badge(activity, formatCustomerRoomStayStatus(stay.status), customerRoomStayTone(stay.status))));

    card.addView(UiKit.text(
        activity,
        joinDateRange(stay.checkInDate, stay.checkOutDate) + " · " + stay.guestCount + " kişi",
        12,
        UiKit.SECONDARY,
        Typeface.NORMAL
    ));

    if (!stay.notes.isEmpty()) {
      card.addView(UiKit.text(
          activity,
          ellipsize(stay.notes, 140),
          12,
          UiKit.MUTED,
          Typeface.NORMAL
      ));
    }

    if (canManageCustomerRoomStays(data) && canTransitionCustomerRoomStay(stay)) {
      Button manage = UiKit.outlineButton(
          activity,
          "Durumu Yönet",
          view -> listener.onManageStay(stay)
      );
      UiKit.addCardAction(card, manage, activity);
    }

    return card;
  }

  private static boolean canManageCustomerRoomStays(OperationData data) {
    return data.isAdmin()
        && data.hasPermission("customer.manage")
        && data.hasPermission("room.assign_customer");
  }

  private PensionStayCard() {}
}

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
    LinearLayout top = UiKit.row(activity);
    LinearLayout identity = UiKit.column(activity);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(activity, stay.customerName, 15, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(
        activity,
        stay.roomName + (stay.roomNumber.isEmpty() ? "" : " · " + stay.roomNumber),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(identity);
    top.addView(UiKit.badge(
        activity,
        formatCustomerRoomStayStatus(stay.status),
        customerRoomStayTone(stay.status)
    ));
    card.addView(top);

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
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 44));
      params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      manage.setLayoutParams(params);
      card.addView(manage);
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

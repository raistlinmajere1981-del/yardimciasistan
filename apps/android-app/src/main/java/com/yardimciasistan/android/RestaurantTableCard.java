package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class RestaurantTableCard {
  interface Listener {
    void onOpenOrder(OperationData.TableRecord table);
    void onChangeStatus(OperationData.TableRecord table);
    void onSetPaymentWaiting(OperationData.TableOrder order);
    void onClosePaid(OperationData.TableRecord table, OperationData.TableOrder order);
  }

  static View create(
      ComponentActivity activity,
      OperationData data,
      OperationData.TableRecord table,
      Listener listener
  ) {
    boolean ordersEnabled = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS);
    OperationData.TableOrder order = ordersEnabled ? data.activeOrderForTable(table.id) : null;

    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    LinearLayout identity = UiKit.column(activity);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(activity, table.name, 16, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(
        activity,
        ordersEnabled
            ? formatTableStatus(table.status) + " · " + (order == null ? "Adisyon yok" : formatOrderStatus(order.status))
            : formatTableStatus(table.status),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(identity);
    top.addView(UiKit.badge(activity, formatTableStatus(table.status), resourceTone(table.status)));
    card.addView(top);

    if (order != null) {
      TextView total = UiKit.text(
          activity,
          order.itemCount + " ürün · " + money(order.total, orderCurrency(order)),
          14,
          UiKit.TEXT,
          Typeface.BOLD
      );
      LinearLayout.LayoutParams totalParams = new LinearLayout.LayoutParams(-1, -2);
      totalParams.setMargins(0, UiKit.dp(activity, 5), 0, 0);
      total.setLayoutParams(totalParams);
      card.addView(total);
    } else if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS)
        && !table.activeReservation.isEmpty()) {
      card.addView(UiKit.text(activity, table.activeReservation, 12, UiKit.INFO, Typeface.BOLD));
    }

    LinearLayout actions = UiKit.row(activity);
    LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(-1, -2);
    actionParams.setMargins(0, UiKit.dp(activity, 10), 0, 0);
    actions.setLayoutParams(actionParams);

    if (data.hasPermission("table_order.view")
        && (order != null || data.hasPermission("table_order.open"))) {
      UiKit.addAction(
          actions,
          UiKit.button(
              activity,
              order == null ? "Sipariş Aç" : "Siparişi Aç",
              UiKit.PRIMARY,
              view -> listener.onOpenOrder(table)
          ),
          activity
      );
    }

    if (order == null && data.hasPermission("table.update_status")) {
      UiKit.addAction(
          actions,
          UiKit.outlineButton(activity, "Masa Durumu", view -> listener.onChangeStatus(table)),
          activity
      );
    } else if (order != null
        && "payment".equals(order.status)
        && data.hasPermission("table_order.close_paid")) {
      UiKit.addAction(
          actions,
          UiKit.button(
              activity,
              "Ödendi / Kapat",
              UiKit.ACCENT,
              view -> listener.onClosePaid(table, order)
          ),
          activity
      );
    } else if (order != null && data.hasPermission("table_order.set_payment_waiting")) {
      UiKit.addAction(
          actions,
          UiKit.outlineButton(activity, "Hesap Bekliyor", view -> listener.onSetPaymentWaiting(order)),
          activity
      );
    } else if (order != null && data.hasPermission("table_order.close_paid")) {
      UiKit.addAction(
          actions,
          UiKit.button(
              activity,
              "Ödendi / Kapat",
              UiKit.ACCENT,
              view -> listener.onClosePaid(table, order)
          ),
          activity
      );
    }

    if (actions.getChildCount() > 0) {
      card.addView(actions);
    }
    return card;
  }

  private RestaurantTableCard() {}
}

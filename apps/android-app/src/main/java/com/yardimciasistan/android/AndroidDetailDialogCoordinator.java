package com.yardimciasistan.android;

import android.app.Dialog;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

final class AndroidDetailDialogCoordinator {
  interface Listener {
    void addHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen);
    void configureFullDialog(Dialog dialog);
    void openDialer(String phone);
    void openWhatsApp(String phone, String message);
    void copyText(String message);
    void showPreparedReply(String customerName, String message);
    void sendAction(String actionType, JSONObject payload, String successMessage);
    void confirm(String title, String message, Runnable action);
    void editReservation(
        ReservationEditorDialog.Kind kind,
        OperationData.ReservationRecord reservation
    );
    void sendReservationAction(
        OperationData.ReservationRecord reservation,
        String actionType,
        String successMessage
    );
    void showError(String message);
    void addOrderItem(
        OperationData.TableRecord table,
        OperationData.TableOrder order,
        OperationData.MenuItem item
    );
    void sendOrderStatus(OperationData.TableOrder order, String status);
    void closeOrder(OperationData.TableOrder order, String status);
  }

  private final ComponentActivity activity;
  private final Listener listener;

  AndroidDetailDialogCoordinator(
      ComponentActivity activity,
      Listener listener
  ) {
    this.activity = activity;
    this.listener = listener;
  }

  void showRequestDetail(
      OperationData data,
      OperationData.RequestRecord request
  ) {
    CustomerRequestDetailDialog.show(
        activity,
        data,
        request,
        new CustomerRequestDetailDialog.Listener() {
          @Override
          public void addHeaderActions(
              LinearLayout header,
              Dialog dialog,
              Runnable reopen
          ) {
            listener.addHeaderActions(header, dialog, reopen);
          }

          @Override
          public void openDialer(String phone) {
            listener.openDialer(phone);
          }

          @Override
          public void openWhatsApp(String phone, String message) {
            listener.openWhatsApp(phone, message);
          }

          @Override
          public void showPreparedReply(String customerName, String message) {
            listener.showPreparedReply(customerName, message);
          }

          @Override
          public void sendAction(
              String actionType,
              JSONObject payload,
              String successMessage
          ) {
            listener.sendAction(actionType, payload, successMessage);
          }

          @Override
          public void confirm(String title, String message, Runnable action) {
            listener.confirm(title, message, action);
          }

          @Override
          public void configureFullDialog(Dialog dialog) {
            listener.configureFullDialog(dialog);
          }
        }
    );
  }

  void showReservationDetail(
      OperationData data,
      OperationData.ReservationRecord reservation
  ) {
    ReservationDetailDialog.show(
        activity,
        data,
        reservation,
        new ReservationDetailDialog.Listener() {
          @Override
          public void addHeaderActions(
              LinearLayout header,
              Dialog dialog,
              Runnable reopen
          ) {
            listener.addHeaderActions(header, dialog, reopen);
          }

          @Override
          public void openDialer(String phone) {
            listener.openDialer(phone);
          }

          @Override
          public void openWhatsApp(String phone, String message) {
            listener.openWhatsApp(phone, message);
          }

          @Override
          public void editReservation(
              ReservationEditorDialog.Kind kind,
              OperationData.ReservationRecord selected
          ) {
            listener.editReservation(kind, selected);
          }

          @Override
          public void sendReservationAction(
              OperationData.ReservationRecord selected,
              String actionType,
              String successMessage
          ) {
            listener.sendReservationAction(selected, actionType, successMessage);
          }

          @Override
          public void confirm(String title, String message, Runnable action) {
            listener.confirm(title, message, action);
          }

          @Override
          public void configureFullDialog(Dialog dialog) {
            listener.configureFullDialog(dialog);
          }

          @Override
          public void showError(String message) {
            listener.showError(message);
          }
        }
    );
  }

  void showMessageDetail(
      OperationData data,
      OperationData.MessageRecord message
  ) {
    MessageDetailDialog.show(
        activity,
        data,
        message,
        new MessageDetailDialog.Listener() {
          @Override
          public void addHeaderActions(
              LinearLayout header,
              Dialog dialog,
              Runnable reopen
          ) {
            listener.addHeaderActions(header, dialog, reopen);
          }

          @Override
          public void copyText(String text) {
            listener.copyText(text);
          }

          @Override
          public void openWhatsApp(String phone, String text) {
            listener.openWhatsApp(phone, text);
          }

          @Override
          public void openDialer(String phone) {
            listener.openDialer(phone);
          }

          @Override
          public void sendAction(
              String actionType,
              JSONObject payload,
              String successMessage
          ) {
            listener.sendAction(actionType, payload, successMessage);
          }

          @Override
          public void confirm(String title, String text, Runnable action) {
            listener.confirm(title, text, action);
          }

          @Override
          public void configureFullDialog(Dialog dialog) {
            listener.configureFullDialog(dialog);
          }
        }
    );
  }

  void showTableOrder(
      OperationData data,
      OperationData.TableRecord table
  ) {
    if (!data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS)
        || !data.hasPermission("table_order.view")) {
      listener.showError("Bu işletmede masa siparişi kullanılamıyor.");
      return;
    }

    new TableOrderDialog(
        activity,
        data,
        table,
        new TableOrderDialog.Listener() {
          @Override
          public void addHeaderActions(
              LinearLayout header,
              Dialog dialog,
              Runnable reopen
          ) {
            listener.addHeaderActions(header, dialog, reopen);
          }

          @Override
          public void configureFullDialog(Dialog dialog) {
            listener.configureFullDialog(dialog);
          }

          @Override
          public void onOpenOrder(OperationData.TableRecord selectedTable) {
            listener.sendAction(
                "table_order_open",
                payload(
                    "table_id", selectedTable.id,
                    "expected_table_updated_at", selectedTable.updatedAt
                ),
                "Masa siparişi açılmak üzere gönderildi."
            );
          }

          @Override
          public void onAddItem(
              OperationData.TableRecord selectedTable,
              OperationData.TableOrder order,
              OperationData.MenuItem item
          ) {
            listener.addOrderItem(selectedTable, order, item);
          }

          @Override
          public void onUpdateItemQuantity(
              OperationData.TableOrderItem item,
              int quantity
          ) {
            listener.sendAction(
                "table_order_update_item_quantity",
                payload(
                    "item_id", item.id,
                    "quantity", quantity,
                    "expected_item_updated_at", item.updatedAt
                ),
                quantity < item.quantity
                    ? "Ürün adedi azaltılmak üzere gönderildi."
                    : "Ürün adedi artırılmak üzere gönderildi."
            );
          }

          @Override
          public void onRemoveItem(OperationData.TableOrderItem item) {
            listener.sendAction(
                "table_order_remove_item",
                payload(
                    "item_id", item.id,
                    "expected_item_updated_at", item.updatedAt
                ),
                "Ürün silinmek üzere gönderildi."
            );
          }

          @Override
          public void onSetOrderStatus(
              OperationData.TableOrder order,
              String status
          ) {
            listener.sendOrderStatus(order, status);
          }

          @Override
          public void onCloseOrder(
              OperationData.TableOrder order,
              String status
          ) {
            listener.closeOrder(order, status);
          }

          @Override
          public void onConfirm(
              String title,
              String message,
              Runnable action
          ) {
            listener.confirm(title, message, action);
          }
        }
    ).show();
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
}

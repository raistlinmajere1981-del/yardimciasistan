package com.yardimciasistan.android;

import android.app.Dialog;
import android.view.View;
import android.widget.Toast;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

final class AndroidDetailDialogCoordinator {
  interface Listener {
    void addHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen);
    void configureFullDialog(Dialog dialog);
    void configureBottomDialog(Dialog dialog);
    void openDialer(String phone);
    void openWhatsApp(String phone, String message);
    void copyText(String message);
    void showCustomerForm(OperationData.CustomerRecord customer);
    View createStayCard(OperationData.CustomerRoomStayRecord stay);
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
  private final AndroidVoiceController voice;

  AndroidDetailDialogCoordinator(
      ComponentActivity activity,
      AndroidVoiceController voice,
      Listener listener
  ) {
    this.activity = activity;
    this.voice = voice;
    this.listener = listener;
  }

  void showCustomerDetail(
      OperationData data,
      OperationData.CustomerRecord customer
  ) {
    new CustomerDetailDialog(
        activity,
        data,
        customer,
        new CustomerDetailDialog.Listener() {
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
          public void onDial(String phone) {
            listener.openDialer(phone);
          }

          @Override
          public void onWhatsApp(String phone) {
            listener.openWhatsApp(phone, "");
          }

          @Override
          public void onEditCustomer(OperationData.CustomerRecord selected) {
            listener.showCustomerForm(selected);
          }

          @Override
          public void onAssignRoom(OperationData.CustomerRecord selected) {
            showRoomAssignment(data, selected, null);
          }

          @Override
          public View createStayCard(OperationData.CustomerRoomStayRecord stay) {
            return listener.createStayCard(stay);
          }

          @Override
          public void onDeleteCustomer(
              OperationData.CustomerRecord selected,
              Dialog dialog
          ) {
            listener.confirm(
                "Müşteriyi sil",
                selected.fullName
                    + " müşteri listesinden silinsin mi? Eski talep ve rezervasyon kayıtları korunur.",
                () -> {
                  listener.sendAction(
                      "customer_delete",
                      payload(
                          "customer_id", selected.id,
                          "expected_updated_at", selected.updatedAt
                      ),
                      "Müşteri silinmek üzere gönderildi."
                  );
                  dialog.dismiss();
                }
            );
          }
        }
    ).show();
  }

  void showRoomAssignment(
      OperationData data,
      OperationData.CustomerRecord preferredCustomer,
      OperationData.RoomRecord preferredRoom
  ) {
    if (!canManageCustomerRoomStays(data)) {
      listener.showError(
          "Müşteri-oda ataması yalnız yetkili yönetici cihazlarda kullanılabilir."
      );
      return;
    }
    if (data.customers.isEmpty() || data.rooms.isEmpty()) {
      listener.showError(
          data.customers.isEmpty()
              ? "Odaya atamak için önce bir müşteri kartı oluşturun."
              : "Atama yapılabilecek oda kaydı bulunamadı."
      );
      return;
    }

    RoomAssignmentDialog.show(
        activity,
        data,
        preferredCustomer,
        preferredRoom,
        new RoomAssignmentDialog.Listener() {
          @Override
          public void onSubmit(JSONObject actionPayload) {
            listener.sendAction(
                "customer_room_assign",
                actionPayload,
                "Müşteri-oda ataması gönderildi."
            );
          }

          @Override
          public void configureFullDialog(Dialog dialog) {
            listener.configureFullDialog(dialog);
          }
        }
    );
  }

  void showStayActions(
      OperationData data,
      OperationData.CustomerRoomStayRecord stay
  ) {
    if (!canManageCustomerRoomStays(data)
        || !AndroidPresentation.canTransitionCustomerRoomStay(stay)) {
      Toast.makeText(
          activity,
          "Bu konaklama kaydında kullanılabilir durum işlemi yok.",
          Toast.LENGTH_SHORT
      ).show();
      return;
    }

    PensionStayActionsDialog.show(
        activity,
        stay,
        new PensionStayActionsDialog.Listener() {
          @Override
          public void onStatusChange(String nextStatus) {
            listener.sendAction(
                "customer_room_stay_status",
                payload(
                    "stay_id", stay.id,
                    "status", nextStatus,
                    "expected_updated_at", stay.updatedAt
                ),
                "Konaklama durumu güncellenmek üzere gönderildi."
            );
          }

          @Override
          public void configureBottomDialog(Dialog dialog) {
            listener.configureBottomDialog(dialog);
          }
        }
    );
  }

  void showRequestDetail(
      OperationData data,
      OperationData.RequestRecord request
  ) {
    CustomerRequestDetailDialog.show(
        activity,
        data,
        request,
        voice,
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
        voice,
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

  void showReservationEditor(
      OperationData data,
      ReservationEditorDialog.Kind kind,
      OperationData.ReservationRecord reservation
  ) {
    boolean editing = reservation != null;
    String requiredPermission = editing
        ? "reservation.update"
        : "reservation.create";
    boolean capabilityAllowed = kind == ReservationEditorDialog.Kind.ROOM
        ? data.hasBusinessCapability(
            AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS
        )
        : data.hasBusinessCapability(
            AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS
        );

    if (!capabilityAllowed || !data.hasPermission(requiredPermission)) {
      listener.showError(
          editing
              ? "Bu cihazın rezervasyon düzenleme yetkisi yok."
              : "Bu cihazın rezervasyon oluşturma yetkisi yok."
      );
      return;
    }
    if (!editing && data.customers.isEmpty()) {
      listener.showError(
          "Rezervasyon eklemeden önce Müşteri ekranından müşteri kaydı oluşturun."
      );
      return;
    }

    ReservationEditorDialog.show(
        activity,
        data,
        kind,
        reservation,
        actionPayload -> {
          String actionType;
          if (kind == ReservationEditorDialog.Kind.ROOM) {
            actionType = editing
                ? "reservation_room_update"
                : "reservation_room_create";
          } else {
            actionType = editing
                ? "reservation_table_update"
                : "reservation_table_create";
          }
          listener.sendAction(
              actionType,
              actionPayload,
              editing
                  ? "Rezervasyon güncellenmek üzere gönderildi."
                  : "Rezervasyon oluşturulmak üzere gönderildi."
          );
        }
    );
  }

  void showDailyTaskEditor(
      OperationData data,
      DailyTaskEditorDialog.Kind kind,
      OperationData.TaskRecord task
  ) {
    boolean editing = task != null;
    String requiredPermission = editing
        ? "daily_task.update"
        : "daily_task.create";
    boolean capabilityAllowed = editing
        ? AndroidUiRules.taskAllowed(data, task)
        : (kind == DailyTaskEditorDialog.Kind.RESTAURANT
            ? data.hasBusinessCapability(AndroidUiRules.CAPABILITY_TABLES)
            : data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ROOMS));

    if (!capabilityAllowed || !data.hasPermission(requiredPermission)) {
      listener.showError(
          editing
              ? "Bu cihazın günlük iş düzenleme yetkisi yok."
              : "Bu cihazın günlük iş ekleme yetkisi yok."
      );
      return;
    }
    if (editing && !AndroidUiRules.isManualTask(task)) {
      listener.showError(
          "Otomatik oluşturulan günlük işler yalnız tamamla veya yeniden aç işlemiyle yönetilebilir."
      );
      return;
    }

    boolean canDelete =
        editing && AndroidUiRules.canDelete(data, "daily_task.delete");
    DailyTaskEditorDialog.show(
        activity,
        kind,
        task,
        canDelete,
        voice,
        new DailyTaskEditorDialog.Listener() {
          @Override
          public void onSave(JSONObject actionPayload) {
            listener.sendAction(
                editing ? "daily_task_update" : "daily_task_create",
                actionPayload,
                editing
                    ? "Günlük iş güncellenmek üzere gönderildi."
                    : "Günlük iş eklenmek üzere gönderildi."
            );
          }

          @Override
          public void onDelete() {
            if (!editing) {
              return;
            }
            listener.sendAction(
                "daily_task_delete",
                payload(
                    "task_id", task.id,
                    "task_type", task.type,
                    "expected_updated_at", task.updatedAt
                ),
                "Günlük iş silinmek üzere gönderildi."
            );
          }
        }
    );
  }

  private boolean canManageCustomerRoomStays(OperationData data) {
    return data.isAdmin()
        && data.hasPermission("customer.manage")
        && data.hasPermission("room.assign_customer");
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

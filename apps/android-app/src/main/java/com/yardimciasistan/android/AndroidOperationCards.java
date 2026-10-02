package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class AndroidOperationCards {
  interface Listener {
    void showRequestDetail(OperationData.RequestRecord request);
    void openDialer(String phone);
    void openWhatsApp(String phone, String message);
    void showReservationDetail(OperationData.ReservationRecord reservation);
    void assignCustomerToRoom(OperationData.RoomRecord room);
    void manageStay(OperationData.CustomerRoomStayRecord stay);
    void showRoomStatus(OperationData.RoomRecord room);
    void showDailyTaskEditor(
        DailyTaskEditorDialog.Kind kind,
        OperationData.TaskRecord task
    );
    void sendAction(String actionType, JSONObject payload, String successMessage);
    void showTableOrder(OperationData.TableRecord table);
    void showTableStatus(OperationData.TableRecord table);
    void sendOrderStatus(OperationData.TableOrder order, String status);
    void confirm(String title, String message, Runnable action);
    void closeOrder(OperationData.TableOrder order, String status);
    void showStockActions(OperationData.TrackedStockItem item);
    void launchStockCamera();
    void launchStockGallery();
    void openRoute(String route);
    void render();
    void copyText(String message);
    void showMessageDetail(OperationData.MessageRecord message);
  }

  private final ComponentActivity activity;
  private final OperationData data;
  private final Listener listener;

  AndroidOperationCards(
      ComponentActivity activity,
      OperationData data,
      Listener listener
  ) {
    this.activity = activity;
    this.data = data;
    this.listener = listener;
  }

  View todayRequestCard(OperationData.RequestRecord request) {
    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    TextView name = UiKit.text(
        activity,
        request.customerName,
        15,
        UiKit.TEXT,
        Typeface.BOLD
    );
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(name);
    top.addView(UiKit.badge(
        activity,
        formatRequestStatus(request.status),
        requestTone(request.status)
    ));
    card.addView(top);
    card.addView(UiKit.text(
        activity,
        formatRequestType(request.type) + " · " + requestDate(request),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));

    LinearLayout actions = UiKit.row(activity);
    UiKit.addAction(
        actions,
        UiKit.outlineButton(
            activity,
            "Ara",
            view -> listener.openDialer(request.customerPhone)
        ),
        activity
    );
    UiKit.addAction(
        actions,
        UiKit.button(
            activity,
            "Aç",
            UiKit.PRIMARY,
            view -> listener.showRequestDetail(request)
        ),
        activity
    );
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    actions.setLayoutParams(params);
    card.addView(actions);
    return card;
  }

  View requestCard(OperationData.RequestRecord request) {
    LinearLayout card = UiKit.card(activity);
    card.setOnClickListener(view -> listener.showRequestDetail(request));

    LinearLayout top = UiKit.row(activity);
    LinearLayout identity = UiKit.column(activity);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(
        activity,
        request.customerName,
        16,
        UiKit.TEXT,
        Typeface.BOLD
    ));
    identity.addView(UiKit.text(
        activity,
        formatRequestType(request.type),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(identity);
    top.addView(UiKit.badge(
        activity,
        formatRequestStatus(request.status),
        requestTone(request.status)
    ));
    card.addView(top);

    String meta = requestDate(request);
    if (request.guestCount > 0) {
      meta += " · " + request.guestCount + " kişi";
    }
    card.addView(UiKit.text(activity, meta, 12, UiKit.MUTED, Typeface.NORMAL));

    if (!request.message.isEmpty()) {
      TextView note = UiKit.text(
          activity,
          ellipsize(request.message, 150),
          13,
          UiKit.TEXT,
          Typeface.NORMAL
      );
      note.setMaxLines(2);
      note.setEllipsize(android.text.TextUtils.TruncateAt.END);
      LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, -2);
      noteParams.setMargins(0, UiKit.dp(activity, 8), 0, UiKit.dp(activity, 10));
      note.setLayoutParams(noteParams);
      card.addView(note);
    }

    LinearLayout actions = UiKit.row(activity);
    UiKit.addAction(
        actions,
        UiKit.outlineButton(activity, "Ara", view -> listener.openDialer(request.customerPhone)),
        activity
    );
    if (AndroidUiRules.canUseWhatsApp(data)
        && data.hasPermission("customer.respond")) {
      UiKit.addAction(
          actions,
          UiKit.outlineButton(
              activity,
              "WhatsApp",
              view -> listener.openWhatsApp(
                  request.customerPhone,
                  request.readyMessage()
              )
          ),
          activity
      );
    }
    UiKit.addAction(
        actions,
        UiKit.button(
            activity,
            "Aç",
            UiKit.PRIMARY,
            view -> listener.showRequestDetail(request)
        ),
        activity
    );
    card.addView(actions);
    return card;
  }

  View waitingMessageCard(OperationData.RequestRecord request) {
    OperationData.MessageRecord message = null;
    for (OperationData.MessageRecord candidate : data.messages) {
      if (request.id.equals(candidate.requestId)) {
        message = candidate;
        break;
      }
    }
    if (message == null) {
      message = new OperationData.MessageRecord();
      message.id = "message_" + request.id;
      message.requestId = request.id;
      message.customerName = request.customerName;
      message.customerPhone = request.customerPhone;
      message.message = request.readyMessage();
      message.updatedAt = request.updatedAt;
    }

    String preview = !message.message.isEmpty()
        ? message.message
        : (AndroidUiRules.canUseAi(data) && !request.aiSummary.isEmpty()
            ? request.aiSummary
            : request.message);
    return messageCard(message, "Cevap bekliyor", UiKit.WARNING, preview);
  }

  View reservationCard(OperationData.ReservationRecord reservation) {
    if (!AndroidUiRules.reservationAllowed(data, reservation)) {
      return new View(activity);
    }

    LinearLayout card = UiKit.card(activity);
    card.setOnClickListener(view -> listener.showReservationDetail(reservation));

    LinearLayout top = UiKit.row(activity);
    TextView title = UiKit.text(
        activity,
        reservation.customerName.isEmpty()
            ? reservation.title
            : reservation.customerName,
        15,
        UiKit.TEXT,
        Typeface.BOLD
    );
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(title);
    top.addView(UiKit.badge(
        activity,
        formatReservationStatus(reservation.status),
        reservationTone(reservation.status)
    ));
    card.addView(top);

    String dates = joinDateRange(reservation.startDate, reservation.endDate);
    if (!reservation.time.isEmpty()) dates += " · " + reservation.time;
    if (reservation.guestCount > 0) dates += " · " + reservation.guestCount + " kişi";
    card.addView(UiKit.text(activity, dates, 12, UiKit.MUTED, Typeface.NORMAL));

    if (!reservation.roomIds.isEmpty()) {
      card.addView(UiKit.text(
          activity,
          "Oda: " + namesForRooms(reservation.roomIds),
          12,
          UiKit.MUTED,
          Typeface.NORMAL
      ));
    }
    if (!reservation.tableIds.isEmpty()) {
      card.addView(UiKit.text(
          activity,
          "Masa: " + namesForTables(reservation.tableIds),
          12,
          UiKit.MUTED,
          Typeface.NORMAL
      ));
    }

    LinearLayout contact = UiKit.row(activity);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    contact.setLayoutParams(params);
    UiKit.addAction(
        contact,
        UiKit.outlineButton(activity, "Ara", view -> listener.openDialer(reservation.customerPhone)),
        activity
    );
    UiKit.addAction(
        contact,
        UiKit.button(
            activity,
            "Aç",
            UiKit.PRIMARY,
            view -> listener.showReservationDetail(reservation)
        ),
        activity
    );
    card.addView(contact);
    return card;
  }

  View roomCard(OperationData.RoomRecord room) {
    return PensionRoomCard.create(
        activity,
        data,
        room,
        new PensionRoomCard.Listener() {
          @Override
          public void onAssignCustomer(OperationData.RoomRecord selectedRoom) {
            listener.assignCustomerToRoom(selectedRoom);
          }

          @Override
          public void onManageStay(OperationData.CustomerRoomStayRecord stay) {
            listener.manageStay(stay);
          }

          @Override
          public void onChangeStatus(OperationData.RoomRecord selectedRoom) {
            listener.showRoomStatus(selectedRoom);
          }
        }
    );
  }

  View customerRoomStayCard(OperationData.CustomerRoomStayRecord stay) {
    return PensionStayCard.create(
        activity,
        data,
        stay,
        listener::manageStay
    );
  }

  View taskCard(OperationData.TaskRecord task, boolean compact) {
    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    LinearLayout details = UiKit.column(activity);
    details.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    details.addView(UiKit.text(activity, task.title, 15, UiKit.TEXT, Typeface.BOLD));
    String due = joinNonEmpty(" · ", task.dueDate, task.dueTime);
    details.addView(UiKit.text(
        activity,
        due.isEmpty() ? "Saat belirtilmemiş" : due,
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(details);
    top.addView(UiKit.badge(
        activity,
        formatTaskStatus(task.status),
        taskTone(task.status)
    ));
    card.addView(top);

    if (!compact && !task.description.isEmpty()) {
      card.addView(UiKit.text(
          activity,
          ellipsize(task.description, 130),
          12,
          UiKit.MUTED,
          Typeface.NORMAL
      ));
    }

    boolean manualTask = AndroidUiRules.isManualTask(task);
    boolean canEdit = manualTask && data.hasPermission("daily_task.update");
    boolean canReopen = ("done".equals(task.status) || "cancelled".equals(task.status))
        && data.hasPermission("daily_task.reopen");
    boolean canComplete = !"done".equals(task.status)
        && !"cancelled".equals(task.status)
        && data.hasPermission("daily_task.complete");

    if (canEdit || canReopen || canComplete) {
      LinearLayout actions = UiKit.row(activity);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, UiKit.dp(activity, 9), 0, 0);
      actions.setLayoutParams(params);

      if (canEdit) {
        DailyTaskEditorDialog.Kind kind = AndroidUiRules.isRestaurantTask(data, task)
            ? DailyTaskEditorDialog.Kind.RESTAURANT
            : DailyTaskEditorDialog.Kind.PENSION;
        UiKit.addAction(
            actions,
            UiKit.outlineButton(
                activity,
                "Düzenle",
                view -> listener.showDailyTaskEditor(kind, task)
            ),
            activity
        );
      }
      if (canReopen) {
        UiKit.addAction(
            actions,
            UiKit.button(activity, "Yeniden Aç", UiKit.PRIMARY, view ->
                listener.sendAction(
                    "daily_task_reopen",
                    payload(
                        "task_id", task.id,
                        "task_type", task.type,
                        "expected_updated_at", task.updatedAt
                    ),
                    "Günlük iş yeniden açılmak üzere gönderildi."
                )
            ),
            activity
        );
      } else if (canComplete) {
        UiKit.addAction(
            actions,
            UiKit.button(activity, "Tamamla", UiKit.PRIMARY, view ->
                listener.sendAction(
                    "daily_task_complete",
                    payload(
                        "task_id", task.id,
                        "task_type", task.type,
                        "expected_updated_at", task.updatedAt
                    ),
                    "Günlük iş tamamlanmak üzere gönderildi."
                )
            ),
            activity
        );
      }
      card.addView(actions);
    }

    return card;
  }

  View tableCard(OperationData.TableRecord table) {
    return RestaurantTableCard.create(
        activity,
        data,
        table,
        new RestaurantTableCard.Listener() {
          @Override
          public void onOpenOrder(OperationData.TableRecord selectedTable) {
            listener.showTableOrder(selectedTable);
          }

          @Override
          public void onChangeStatus(OperationData.TableRecord selectedTable) {
            listener.showTableStatus(selectedTable);
          }

          @Override
          public void onSetPaymentWaiting(OperationData.TableOrder order) {
            listener.sendOrderStatus(order, "payment");
          }

          @Override
          public void onClosePaid(
              OperationData.TableRecord selectedTable,
              OperationData.TableOrder order
          ) {
            listener.confirm(
                "Adisyonu kapat",
                selectedTable.name + " adisyonu ödendi olarak kapatılsın mı?",
                () -> listener.closeOrder(order, "paid")
            );
          }
        }
    );
  }

  View stockCard(OperationData.TrackedStockItem item) {
    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    LinearLayout identity = UiKit.column(activity);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(activity, item.name, 15, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(activity, item.category, 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(identity);
    top.addView(UiKit.badge(
        activity,
        formatStockStatus(item.stockStatus),
        stockTone(item.stockStatus)
    ));
    card.addView(top);

    card.addView(UiKit.text(
        activity,
        "Stok: " + stockQuantity(item.stockQuantity, item.stockUnit)
            + " · Minimum: "
            + (item.stockMinQuantity == null
                ? "—"
                : stockQuantity(item.stockMinQuantity, item.stockUnit)),
        13,
        UiKit.TEXT,
        Typeface.BOLD
    ));

    if (data.hasPermission("menu.stock_update")) {
      Button update = UiKit.outlineButton(
          activity,
          "Stok Güncelle",
          view -> listener.showStockActions(item)
      );
      LinearLayout.LayoutParams params =
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 44));
      params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      update.setLayoutParams(params);
      card.addView(update);
    }
    return card;
  }

  View adminMenuCategoryCard(OperationData.MenuCategory category) {
    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    LinearLayout identity = UiKit.column(activity);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(activity, category.name, 15, UiKit.TEXT, Typeface.BOLD));

    int productCount = 0;
    for (OperationData.MenuItem item : data.adminMenuItems) {
      if (category.id.equals(item.categoryId)) productCount += 1;
    }
    identity.addView(UiKit.text(
        activity,
        productCount + " ürün · " + (category.active ? "Aktif" : "Pasif"),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(identity);
    top.addView(UiKit.badge(
        activity,
        category.active ? "Aktif" : "Pasif",
        category.active ? UiKit.SUCCESS : UiKit.MUTED
    ));
    card.addView(top);

    final int relatedProductCount = productCount;
    Button delete = UiKit.dangerButton(
        activity,
        "Kategoriyi Sil",
        view -> listener.confirm(
            "Menü kategorisini sil",
            category.name
                + " ve bağlı "
                + relatedProductCount
                + " ürün kalıcı görünümden kaldırılsın mı?",
            () -> listener.sendAction(
                "menu_category_delete",
                payload(
                    "category_id", category.id,
                    "expected_updated_at", category.updatedAt
                ),
                "Menü kategorisi silinmek üzere gönderildi."
            )
        )
    );
    LinearLayout.LayoutParams params =
        new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 44));
    params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    delete.setLayoutParams(params);
    card.addView(delete);
    return card;
  }

  View adminMenuItemCard(OperationData.MenuItem item) {
    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    LinearLayout identity = UiKit.column(activity);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(activity, item.name, 15, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(
        activity,
        data.adminCategoryName(item.categoryId)
            + " · "
            + money(item.price, item.currency),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(identity);
    top.addView(UiKit.badge(
        activity,
        item.available ? "Satışta" : "Pasif",
        item.available ? UiKit.SUCCESS : UiKit.MUTED
    ));
    card.addView(top);

    Button delete = UiKit.dangerButton(
        activity,
        "Ürünü Sil",
        view -> listener.confirm(
            "Menü ürününü sil",
            item.name + " menüden silinsin mi?",
            () -> listener.sendAction(
                "menu_item_delete",
                payload(
                    "menu_item_id", item.id,
                    "expected_updated_at", item.updatedAt
                ),
                "Menü ürünü silinmek üzere gönderildi."
            )
        )
    );
    LinearLayout.LayoutParams params =
        new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 44));
    params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    delete.setLayoutParams(params);
    card.addView(delete);
    return card;
  }

  View stockImageImportCard() {
    LinearLayout card = UiKit.card(activity);
    card.setBackground(UiKit.rounded(
        activity,
        UiKit.PRIMARY_DARK,
        UiKit.PRIMARY,
        14
    ));
    card.addView(UiKit.eyebrow(activity, "AI DESTEKLİ STOK GİRİŞİ"));
    card.addView(UiKit.text(
        activity,
        "Fatura veya fiş görselini kontrol edilebilir bir stok taslağına dönüştürün.",
        13,
        UiKit.TEXT,
        Typeface.BOLD
    ));
    card.addView(UiKit.text(
        activity,
        "Stoklar siz onaylamadan değişmez. Görsel analiz için yapılandırılmış AI hizmetine gönderilir ve kalıcı saklanmaz.",
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));

    LinearLayout actions = UiKit.row(activity);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(activity, 10), 0, 0);
    actions.setLayoutParams(params);

    UiKit.addAction(
        actions,
        UiKit.button(
            activity,
            "Kamera ile çek",
            UiKit.PRIMARY,
            view -> listener.launchStockCamera()
        ),
        activity
    );
    UiKit.addAction(
        actions,
        UiKit.outlineButton(
            activity,
            "Galeriden seç",
            view -> listener.launchStockGallery()
        ),
        activity
    );
    card.addView(actions);
    return card;
  }

  View priorityStockCard(OperationData.TrackedStockItem item) {
    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    LinearLayout identity = UiKit.column(activity);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(activity, item.name, 15, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(
        activity,
        item.category
            + " · Stok "
            + stockQuantity(item.stockQuantity, item.stockUnit),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(identity);
    top.addView(UiKit.badge(
        activity,
        formatStockStatus(item.stockStatus),
        stockTone(item.stockStatus)
    ));
    card.addView(top);

    Button open = UiKit.outlineButton(activity, "Stoku Aç", view -> {
      listener.openRoute("restaurant:stock");
      listener.render();
    });
    LinearLayout.LayoutParams params =
        new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 44));
    params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    open.setLayoutParams(params);
    card.addView(open);
    return card;
  }

  View activeOrderCard(OperationData.TableOrder order) {
    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    TextView table = UiKit.text(
        activity,
        order.tableName,
        15,
        UiKit.TEXT,
        Typeface.BOLD
    );
    table.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(table);
    top.addView(UiKit.badge(
        activity,
        formatOrderStatus(order.status),
        orderTone(order.status)
    ));
    card.addView(top);
    card.addView(UiKit.text(
        activity,
        order.itemCount
            + " ürün · "
            + money(order.total, orderCurrency(order)),
        14,
        UiKit.TEXT,
        Typeface.BOLD
    ));

    OperationData.TableRecord tableRecord = tableById(order.tableId);
    if (tableRecord == null && !order.tableId.isEmpty()) {
      tableRecord = new OperationData.TableRecord();
      tableRecord.id = order.tableId;
      tableRecord.name = order.tableName;
      tableRecord.status = "occupied";
      tableRecord.updatedAt = order.updatedAt;
    }
    if (tableRecord != null && data.hasPermission("table_order.view")) {
      OperationData.TableRecord selectedTable = tableRecord;
      Button open = UiKit.button(
          activity,
          "Adisyonu Aç",
          UiKit.PRIMARY,
          view -> listener.showTableOrder(selectedTable)
      );
      LinearLayout.LayoutParams params =
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 44));
      params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      open.setLayoutParams(params);
      card.addView(open);
    }
    return card;
  }

  View messageCard(OperationData.MessageRecord message) {
    return messageCard(message, "Hazır", UiKit.PRIMARY, message.message);
  }

  View messageCard(
      OperationData.MessageRecord message,
      String status,
      int tone,
      String previewText
  ) {
    LinearLayout card = UiKit.card(activity);
    card.setOnClickListener(view -> listener.showMessageDetail(message));

    LinearLayout top = UiKit.row(activity);
    TextView name = UiKit.text(
        activity,
        message.customerName,
        15,
        UiKit.TEXT,
        Typeface.BOLD
    );
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(name);
    top.addView(UiKit.badge(activity, status, tone));
    card.addView(top);

    String preview = previewText == null || previewText.trim().isEmpty()
        ? "Hazır cevap bekleniyor"
        : ellipsize(previewText, 120);
    TextView body = UiKit.text(
        activity,
        preview,
        13,
        message.message.isEmpty() ? UiKit.MUTED : UiKit.TEXT,
        Typeface.NORMAL
    );
    body.setMaxLines(2);
    body.setEllipsize(android.text.TextUtils.TruncateAt.END);
    body.setPadding(0, UiKit.dp(activity, 6), 0, UiKit.dp(activity, 8));
    card.addView(body);

    LinearLayout actions = UiKit.row(activity);
    if (AndroidUiRules.canUseWhatsApp(data)
        && data.hasPermission("customer.respond")) {
      Button copy = UiKit.outlineButton(
          activity,
          "Kopyala",
          view -> listener.copyText(message.message)
      );
      copy.setEnabled(!message.message.isEmpty());
      UiKit.addAction(actions, copy, activity);

      Button whatsapp = UiKit.outlineButton(
          activity,
          "WhatsApp",
          view -> listener.openWhatsApp(message.customerPhone, message.message)
      );
      whatsapp.setEnabled(!message.message.isEmpty());
      UiKit.addAction(actions, whatsapp, activity);
    }

    UiKit.addAction(
        actions,
        UiKit.button(
            activity,
            "Aç",
            UiKit.PRIMARY,
            view -> listener.showMessageDetail(message)
        ),
        activity
    );
    card.addView(actions);
    return card;
  }

  View actionCard(OperationData.ActionRecord action) {
    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    TextView label = UiKit.text(
        activity,
        formatActionType(action.type),
        14,
        UiKit.TEXT,
        Typeface.BOLD
    );
    label.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(label);
    top.addView(UiKit.badge(
        activity,
        formatActionStatus(action.status),
        actionTone(action.status)
    ));
    card.addView(top);
    card.addView(UiKit.text(
        activity,
        shortTimestamp(action.createdAt),
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    ));

    if (!action.errorMessage.isEmpty()) {
      TextView error = UiKit.text(
          activity,
          action.errorMessage,
          12,
          UiKit.DANGER,
          Typeface.NORMAL
      );
      error.setPadding(0, UiKit.dp(activity, 6), 0, 0);
      card.addView(error);
    }
    return card;
  }

  private String namesForRooms(List<String> roomIds) {
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

  private String namesForTables(List<String> tableIds) {
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

  private OperationData.TableRecord tableById(String tableId) {
    for (OperationData.TableRecord table : data.tables) {
      if (tableId.equals(table.id)) return table;
    }
    return null;
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

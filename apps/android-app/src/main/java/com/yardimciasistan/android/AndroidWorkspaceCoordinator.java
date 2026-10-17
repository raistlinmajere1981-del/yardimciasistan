package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

import java.util.ArrayList;

final class AndroidWorkspaceCoordinator {
  interface Listener {
    void render();
    void showCustomerForm(OperationData.CustomerRecord customer);
    void showCustomerDetail(OperationData.CustomerRecord customer);
    void openDialer(String phone);
    void openWhatsApp(String phone, String message);
    void showReservationEditor(
        ReservationEditorDialog.Kind kind,
        OperationData.ReservationRecord reservation
    );
    void showRoomAssignment();
    void showDailyTaskEditor(
        DailyTaskEditorDialog.Kind kind,
        OperationData.TaskRecord task
    );
    void sendAction(String actionType, JSONObject payload, String successMessage);
  }

  private final ComponentActivity activity;
  private final AndroidOperationCards cards;
  private final Listener listener;

  private String customerFilter = AndroidUiRules.CUSTOMER_NEW;
  private String pensionMode = AndroidUiRules.PENSION_RESERVATIONS;
  private String restaurantMode = AndroidUiRules.RESTAURANT_TABLES;
  private String messageMode = AndroidUiRules.MESSAGES_PREPARED;

  AndroidWorkspaceCoordinator(
      ComponentActivity activity,
      AndroidOperationCards cards,
      Listener listener
  ) {
    this.activity = activity;
    this.cards = cards;
    this.listener = listener;
  }

  void applyDestination(
      OperationData data,
      AndroidUiRules.Destination destination
  ) {
    if (AndroidUiRules.TAB_CUSTOMERS.equals(destination.tab)) {
      customerFilter = destination.mode;
    } else if (AndroidUiRules.TAB_PENSION.equals(destination.tab)) {
      String visible = AndroidUiRules.visiblePensionMode(data, destination.mode);
      if (visible != null) pensionMode = visible;
    } else if (AndroidUiRules.TAB_RESTAURANT.equals(destination.tab)) {
      String visible = AndroidUiRules.visibleRestaurantMode(data, destination.mode);
      if (visible != null) restaurantMode = visible;
    } else if (AndroidUiRules.TAB_MESSAGES.equals(destination.tab)) {
      messageMode = destination.mode;
    }
  }

  void normalize(OperationData data) {
    String visiblePensionMode =
        AndroidUiRules.visiblePensionMode(data, pensionMode);
    if (visiblePensionMode != null) {
      pensionMode = visiblePensionMode;
    }

    String visibleRestaurantMode =
        AndroidUiRules.visibleRestaurantMode(data, restaurantMode);
    if (visibleRestaurantMode != null) {
      restaurantMode = visibleRestaurantMode;
    }

    if (!data.hasBusinessCapability(AndroidUiRules.CAPABILITY_REQUESTS)
        && AndroidUiRules.MESSAGES_WAITING.equals(messageMode)) {
      messageMode = AndroidUiRules.MESSAGES_PREPARED;
    }
  }

  String screenKey(String tab) {
    if (AndroidUiRules.TAB_CUSTOMERS.equals(tab)) {
      return tab + ":" + customerFilter;
    }
    if (AndroidUiRules.TAB_PENSION.equals(tab)) {
      return tab + ":" + pensionMode;
    }
    if (AndroidUiRules.TAB_RESTAURANT.equals(tab)) {
      return tab + ":" + restaurantMode;
    }
    if (AndroidUiRules.TAB_MESSAGES.equals(tab)) {
      return tab + ":" + messageMode;
    }
    return tab;
  }

  View customer(OperationData data, int bottomPaddingDp) {
    CustomerWorkspace workspace = new CustomerWorkspace(
        activity,
        data,
        new CustomerWorkspace.Listener() {
          @Override
          public void onFilterNormalized(String filter) {
            customerFilter = filter;
          }

          @Override
          public void onFilterChanged(String filter) {
            customerFilter = filter;
            listener.render();
          }

          @Override
          public void onCreateCustomer() {
            listener.showCustomerForm(null);
          }

          @Override
          public void onOpenCustomer(OperationData.CustomerRecord customer) {
            listener.showCustomerDetail(customer);
          }

          @Override
          public View createRequestCard(OperationData.RequestRecord request) {
            return cards.requestCard(request);
          }

          @Override
          public void onDial(String phone) {
            listener.openDialer(phone);
          }

          @Override
          public void onWhatsApp(String phone) {
            listener.openWhatsApp(phone, "");
          }
        },
        bottomPaddingDp
    );
    return workspace.render(customerFilter);
  }

  View pension(OperationData data, int bottomPaddingDp) {
    PensionWorkspace workspace = new PensionWorkspace(
        activity,
        data,
        new PensionWorkspace.Listener() {
          @Override
          public void onModeChanged(String mode) {
            pensionMode = mode;
            listener.render();
          }

          @Override
          public void onCreateRoomReservation() {
            listener.showReservationEditor(ReservationEditorDialog.Kind.ROOM, null);
          }

          @Override
          public void onAssignCustomerToRoom() {
            listener.showRoomAssignment();
          }

          @Override
          public void onCreateTask() {
            listener.showDailyTaskEditor(DailyTaskEditorDialog.Kind.PENSION, null);
          }

          @Override
          public View createReservationCard(
              OperationData.ReservationRecord reservation
          ) {
            return cards.reservationCard(reservation);
          }

          @Override
          public View createRoomCard(OperationData.RoomRecord room) {
            return cards.roomCard(room);
          }

          @Override
          public View createStayCard(OperationData.CustomerRoomStayRecord stay) {
            return cards.customerRoomStayCard(stay);
          }

          @Override
          public View createTaskCard(OperationData.TaskRecord task) {
            return cards.taskCard(task, false);
          }

          @Override
          public void onFolioAction(
              String actionType,
              JSONObject actionPayload,
              String successMessage
          ) {
            listener.sendAction(actionType, actionPayload, successMessage);
          }
        },
        bottomPaddingDp
    );
    return workspace.render(pensionMode);
  }

  View restaurant(OperationData data, int bottomPaddingDp) {
    RestaurantWorkspace workspace = new RestaurantWorkspace(
        activity,
        data,
        new RestaurantWorkspace.Listener() {
          @Override
          public void onModeChanged(String mode) {
            restaurantMode = mode;
            listener.render();
          }

          @Override
          public void onRoute(String route) {
            AndroidUiRules.Destination destination =
                AndroidUiRules.resolveDestination(route);
            applyDestination(data, destination);
            listener.render();
          }

          @Override
          public void onCreateTableReservation() {
            listener.showReservationEditor(ReservationEditorDialog.Kind.TABLE, null);
          }

          @Override
          public void onCreateTask() {
            listener.showDailyTaskEditor(DailyTaskEditorDialog.Kind.RESTAURANT, null);
          }

          @Override
          public View createTableCard(OperationData.TableRecord table) {
            return cards.tableCard(table);
          }

          @Override
          public View createReservationCard(
              OperationData.ReservationRecord reservation
          ) {
            return cards.reservationCard(reservation);
          }

          @Override
          public View createOrderCard(OperationData.TableOrder order) {
            return cards.activeOrderCard(order);
          }

          @Override
          public View createTaskCard(OperationData.TaskRecord task) {
            return cards.taskCard(task, false);
          }

          @Override
          public View createStockImageImportCard() {
            return cards.stockImageImportCard();
          }

          @Override
          public View createStockCard(OperationData.TrackedStockItem item) {
            return cards.stockCard(item);
          }

          @Override
          public View createAdminCategoryCard(OperationData.MenuCategory category) {
            return cards.adminMenuCategoryCard(category);
          }

          @Override
          public View createAdminMenuItemCard(OperationData.MenuItem item) {
            return cards.adminMenuItemCard(item);
          }
          @Override public View createMenuProductCreateCard() { return cards.menuProductCreateCard(); }
        },
        bottomPaddingDp
    );
    return workspace.render(restaurantMode);
  }

  View messages(OperationData data, int bottomPaddingDp) {
    LinearLayout page = UiKit.column(activity);
    if (!AndroidUiRules.canUseWhatsApp(data)
        || !data.hasPermission("customer.view")) {
      page.addView(emptyCard(
          "Bu cihazın bu alan için yetkisi yok",
          "Yetkiler masaüstü yöneticisi tarafından belirlenir."
      ));
      return UiKit.scroll(activity, page, bottomPaddingDp);
    }

    boolean requestsEnabled =
        data.hasBusinessCapability(AndroidUiRules.CAPABILITY_REQUESTS);
    ArrayList<String[]> options = new ArrayList<>();
    options.add(new String[] {
        AndroidUiRules.MESSAGES_PREPARED,
        "Hazır Mesajlar"
    });
    if (requestsEnabled) {
      options.add(new String[] {
          AndroidUiRules.MESSAGES_WAITING,
          "Cevap Bekleyenler"
      });
    } else if (AndroidUiRules.MESSAGES_WAITING.equals(messageMode)) {
      messageMode = AndroidUiRules.MESSAGES_PREPARED;
    }

    page.addView(UiKit.title(activity, "Mesajlar"));
    page.addView(filterBar(options.toArray(new String[0][])));

    if (AndroidUiRules.MESSAGES_PREPARED.equals(messageMode)) {
      NativeSearchList search = null;
      if (!data.messages.isEmpty()) {
        search = addMessageSearch(page, "Müşteri veya mesaj ara");
      }
      if (data.messages.isEmpty()) {
        page.addView(emptyCard(
            "Hazır mesaj yok",
            "Masaüstünde hazırlanan cevaplar burada görünür."
        ));
      }
      for (OperationData.MessageRecord message : data.messages) {
        View row = cards.messageCard(message);
        page.addView(row);
        if (search != null) search.add(row, message.customerName + " " + message.customerPhone
            + " " + message.message + " " + message.status);
      }
      if (search != null) finishMessageSearch(page, search, "Aramayla eşleşen mesaj yok.");
    } else {
      int shown = 0;
      NativeSearchList search = null;
      for (OperationData.RequestRecord request : data.requests) {
        if (!request.waitingForResponse()) continue;
        if (search == null) search = addMessageSearch(page, "Yanıt bekleyen müşteri ara");
        View row = cards.waitingMessageCard(request);
        page.addView(row);
        search.add(row, request.customerName + " " + request.customerPhone + " "
            + request.message + " " + request.status);
        shown += 1;
      }
      if (shown == 0) {
        page.addView(emptyCard(
            "Cevap bekleyen müşteri yok",
            "Yanıt gerektiren talepler burada görünür."
        ));
      } else finishMessageSearch(page, search, "Aramayla eşleşen talep yok.");
    }

    return UiKit.scroll(activity, page, bottomPaddingDp);
  }

  private NativeSearchList addMessageSearch(LinearLayout page, String hint) {
    NativeSearchList search = new NativeSearchList(activity, hint);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(activity, 4), 0, UiKit.dp(activity, 12));
    page.addView(search.input(), params);
    return search;
  }

  private void finishMessageSearch(LinearLayout page, NativeSearchList search, String emptyText) {
    TextView text = UiKit.text(activity, emptyText, 13, UiKit.MUTED, Typeface.NORMAL);
    page.addView(text);
    search.setNoMatchesNotice(text);
  }

  private View filterBar(String[][] options) {
    HorizontalScrollView scroll = new HorizontalScrollView(activity);
    scroll.setHorizontalScrollBarEnabled(false);
    LinearLayout row = UiKit.row(activity);
    row.setPadding(0, UiKit.dp(activity, 3), 0, UiKit.dp(activity, 6));

    for (String[] option : options) {
      row.addView(UiKit.chip(
          activity,
          option[1],
          option[0].equals(messageMode),
          view -> {
            messageMode = option[0];
            listener.render();
          }
      ));
    }
    scroll.addView(row);
    return scroll;
  }

  private View emptyCard(String title, String detail) {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.text(
        activity,
        title,
        14,
        UiKit.TEXT,
        Typeface.BOLD
    ));
    card.addView(UiKit.text(
        activity,
        detail,
        12,
        UiKit.SECONDARY,
        Typeface.NORMAL
    ));
    return card;
  }
}

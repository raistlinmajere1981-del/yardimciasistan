package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import java.util.ArrayList;

final class TodayWorkspace {
  interface Listener {
    View requestCard(OperationData.RequestRecord request);
    View reservationCard(OperationData.ReservationRecord reservation);
    View orderCard(OperationData.TableOrder order);
    View tableCard(OperationData.TableRecord table);
    View taskCard(OperationData.TaskRecord task);
    View stockCard(OperationData.TrackedStockItem item);
    View actionCard(OperationData.ActionRecord action);
    void openRoute(String route);
    ScrollView wrap(View page);
    int localPendingActionCount();
  }

  private final ComponentActivity activity;
  private final OperationData data;
  private final Listener listener;
  private final String companionNotice;

  TodayWorkspace(
      ComponentActivity activity,
      OperationData data,
      String companionNotice,
      Listener listener
  ) {
    this.activity = activity;
    this.data = data;
    this.listener = listener;
    this.companionNotice = companionNotice;
  }

  View build() {
    LinearLayout page = UiKit.column(activity);
    if (!companionNotice.isEmpty()) {
      page.addView(emptyCard("Görünüm kapatıldı", companionNotice));
    }
    boolean canViewCustomers = data.hasPermission("customer.view");
    boolean canViewRequests = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_REQUESTS)
        && data.hasPermission("customer.view");
    boolean canViewReservations = data.hasPermission("reservation.view");
    boolean canViewRooms = data.hasPermission("room.view");
    boolean canViewPensionTasks = AndroidUiRules.canOpenPensionMode(
        data,
        AndroidUiRules.PENSION_TASKS
    );
    boolean canViewRestaurantTasks = AndroidUiRules.canOpenRestaurantMode(
        data,
        AndroidUiRules.RESTAURANT_TASKS
    );
    boolean canViewTasks = data.hasPermission("daily_task.view");
    boolean canViewTables = data.hasPermission("table.view");
    boolean canViewOrders = data.hasPermission("table_order.view");
    boolean canViewStock = data.hasPermission("menu.stock_view");
    boolean canViewCommerce = CompanionUiRules.canOpen(data, AndroidUiRules.TODAY_COMMERCE);
    boolean canViewShipments = CompanionUiRules.canOpen(data, AndroidUiRules.TODAY_SHIPMENTS);
    boolean canViewMarketing = CompanionUiRules.canOpen(data, AndroidUiRules.TODAY_MARKETING);
    data.companion.redact(data);

    ArrayList<Counter> counters = new ArrayList<>();
    if (KbsUiRules.canView(data)) counters.add(new Counter("KBS bekleyen / sorunlu", data.kbs.pendingCount + data.kbs.failedCount + data.kbs.unknownCount, UiKit.WARNING, "pension:kbs"));
    if (canViewCommerce && data.companion.commerceAvailable) {
      counters.add(new Counter("Ticari sipariş", data.companion.pendingOrders, UiKit.WARNING, "today:commerce"));
    }
    if (canViewShipments && data.companion.commerceAvailable) {
      counters.add(new Counter("Gönderi", data.companion.pendingShipments, UiKit.INFO, "today:shipments"));
    }
    if (canViewMarketing && data.companion.marketingAvailable) {
      counters.add(new Counter("Pazarlama hatası", data.companion.recentFailedMarketingOperations, UiKit.DANGER, "today:marketing"));
    }
    if (canViewRequests) {
      counters.add(new Counter("Yeni", data.newRequests, UiKit.INFO, "customers:new"));
      counters.add(new Counter(
          "Cevap",
          data.waitingResponses > 0 ? data.waitingResponses : countWaitingRequests(),
          UiKit.DANGER,
          "customers:waiting"
      ));
    }

    if (canViewReservations) {
      int pensionPending = countPensionReservations("pending");
      int restaurantPending = countRestaurantOnlyReservations("pending");
      if (pensionPending > 0) {
        counters.add(new Counter(
            "Oda Rez.",
            pensionPending,
            UiKit.WARNING,
            "pension:reservations"
        ));
      }
      if (restaurantPending > 0) {
        counters.add(new Counter(
            "Masa Rez.",
            restaurantPending,
            UiKit.WARNING,
            "restaurant:reservations"
        ));
      }
    }

    int visibleTaskCount = 0;
    boolean hasPensionTasks = false;
    boolean hasRestaurantTasks = false;
    boolean hasOtherTasks = false;
    if (canViewTasks) {
      for (OperationData.TaskRecord task : data.tasks) {
        if (!"pending".equals(task.status) || !AndroidUiRules.taskAllowed(data, task)) {
          continue;
        }
        String domain = AndroidUiRules.taskDomain(data, task);
        if ("accommodation".equals(domain) && canViewPensionTasks) {
          hasPensionTasks = true;
        } else if ("food_service".equals(domain) && canViewRestaurantTasks) {
          hasRestaurantTasks = true;
        } else if ("mixed".equals(domain)
            && canViewPensionTasks
            && canViewRestaurantTasks) {
          hasPensionTasks = true;
          hasRestaurantTasks = true;
        } else if ("core".equals(domain)) {
          hasOtherTasks = true;
        } else {
          continue;
        }
        visibleTaskCount += 1;
      }
    }

    if (visibleTaskCount > 0) {
      String taskLabel = hasPensionTasks && !hasRestaurantTasks && !hasOtherTasks
          ? "Oda işi"
          : (hasRestaurantTasks && !hasPensionTasks && !hasOtherTasks
              ? "Servis işi"
              : "İş");
      String taskRoute = hasPensionTasks && !hasRestaurantTasks && !hasOtherTasks
          ? "pension:tasks"
          : (hasRestaurantTasks && !hasPensionTasks && !hasOtherTasks
              ? "restaurant:tasks"
              : "today");
      counters.add(new Counter(taskLabel, visibleTaskCount, UiKit.ACCENT, taskRoute));
    }

    if (canViewRooms) {
      counters.add(new Counter("Oda", data.availableRooms, UiKit.SUCCESS, "pension:rooms"));
    }
    if (canViewOrders) {
      counters.add(new Counter(
          "Hesap",
          data.billWaitingTables,
          UiKit.WARNING,
          "restaurant:orders"
      ));
    }

    int outOfStock = countStockByStatus("out_of_stock");
    int lowStock = countStockByStatus("low_stock");
    if (canViewStock && outOfStock > 0) {
      counters.add(new Counter(
          "Stok yok",
          outOfStock,
          UiKit.DANGER,
          "restaurant:stock"
      ));
    }
    if (canViewStock && lowStock > 0) {
      counters.add(new Counter(
          "Az stok",
          lowStock,
          UiKit.WARNING,
          "restaurant:stock"
      ));
    }
    if (!counters.isEmpty()) {
      page.addView(statusStrip(counters));
    }

    page.addView(sectionLabel("Öncelikli işler"));
    int shown = 0;
    int categoryShown = 0;

    if (canViewRequests) {
      for (OperationData.RequestRecord request : data.requests) {
        if (!"new".equals(request.status) || categoryShown >= 2 || shown >= 8) {
          continue;
        }
        page.addView(listener.requestCard(request));
        categoryShown += 1;
        shown += 1;
      }
    }

    categoryShown = 0;
    if (canViewReservations) {
      for (OperationData.ReservationRecord reservation : data.reservations) {
        if (!AndroidUiRules.reservationAllowed(data, reservation)
            || !"pending".equals(reservation.status)
            || categoryShown >= 2
            || shown >= 8) {
          continue;
        }
        page.addView(listener.reservationCard(reservation));
        categoryShown += 1;
        shown += 1;
      }
    }

    categoryShown = 0;
    if (canViewOrders) {
      for (OperationData.TableOrder order : data.tableOrders) {
        if (!"payment".equals(order.status) || categoryShown >= 2 || shown >= 8) {
          continue;
        }
        page.addView(listener.orderCard(order));
        categoryShown += 1;
        shown += 1;
      }
    }

    if (canViewTables && categoryShown < 2 && shown < 8) {
      for (OperationData.TableRecord table : data.tables) {
        if (!("bill_waiting".equals(table.status) || "payment".equals(table.status))
            || hasPaymentOrderForTable(table.id)
            || categoryShown >= 2
            || shown >= 8) {
          continue;
        }
        page.addView(listener.tableCard(table));
        categoryShown += 1;
        shown += 1;
      }
    }

    categoryShown = 0;
    if (canViewTasks) {
      for (OperationData.TaskRecord task : data.tasks) {
        if (!AndroidUiRules.taskAllowed(data, task)
            || !AndroidPresentation.isPriorityTask(task)
            || categoryShown >= 2
            || shown >= 8) {
          continue;
        }
        page.addView(listener.taskCard(task));
        categoryShown += 1;
        shown += 1;
      }
    }

    categoryShown = 0;
    if (canViewStock) {
      for (OperationData.TrackedStockItem item : data.trackedStockItems) {
        if (!("out_of_stock".equals(item.stockStatus)
            || "low_stock".equals(item.stockStatus))
            || categoryShown >= 2
            || shown >= 8) {
          continue;
        }
        page.addView(listener.stockCard(item));
        categoryShown += 1;
        shown += 1;
      }
    }

    if (shown == 0) {
      boolean hasOperationalPermission = canViewCustomers
          || canViewReservations
          || canViewRooms
          || canViewTasks
          || canViewTables
          || canViewOrders
          || canViewStock
          || canViewCommerce
          || canViewMarketing;
      page.addView(
          hasOperationalPermission
              ? emptyCard(
                  "Öncelikli iş yok",
                  "Açık operasyonlar geldikçe bu liste güncellenir."
              )
              : permissionDeniedCard()
      );
    }

    int visiblePendingActions = data.pendingActions + listener.localPendingActionCount();
    OperationData.ActionRecord failedAction = latestFailedAction();
    if (visiblePendingActions > 0 || failedAction != null) {
      page.addView(sectionLabel("Telefon işlemleri"));
    }
    if (visiblePendingActions > 0) {
      LinearLayout pending = UiKit.card(activity);
      pending.addView(UiKit.text(
          activity,
          visiblePendingActions + " işlem masaüstünü bekliyor",
          14,
          UiKit.WARNING,
          Typeface.BOLD
      ));
      pending.addView(UiKit.text(
          activity,
          "Sonuçlar bir sonraki senkronla güncellenir.",
          12,
          UiKit.MUTED,
          Typeface.NORMAL
      ));
      page.addView(pending);
    }
    if (failedAction != null) {
      page.addView(listener.actionCard(failedAction));
    }

    return listener.wrap(page);
  }


  private View statusStrip(ArrayList<Counter> counters) {
    HorizontalScrollView scroll = new HorizontalScrollView(activity);
    scroll.setHorizontalScrollBarEnabled(false);
    scroll.setClipToPadding(false);
    scroll.setContentDescription("Sayaçlar");

    LinearLayout row = UiKit.row(activity);
    row.setPadding(0, UiKit.dp(activity, 2), UiKit.dp(activity, 4), UiKit.dp(activity, 7));
    for (Counter counter : counters) {
      View.OnClickListener click = counter.route.isEmpty()
          ? null
          : view -> listener.openRoute(counter.route);
      row.addView(UiKit.counterChip(
          activity,
          counter.label,
          counter.value,
          counter.tone,
          click
      ));
    }
    scroll.addView(row);
    return scroll;
  }

  private View sectionLabel(String value) {
    TextView label = UiKit.text(activity, value, 16, UiKit.TEXT, Typeface.BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(activity, 7), 0, UiKit.dp(activity, 7));
    label.setLayoutParams(params);
    return label;
  }

  private View emptyCard(String title, String detail) {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.text(activity, title, 14, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(activity, detail, 12, UiKit.SECONDARY, Typeface.NORMAL));
    return card;
  }

  private View permissionDeniedCard() {
    return emptyCard(
        "Bu cihazın bu alan için yetkisi yok",
        "Yetkiler masaüstü yöneticisi tarafından belirlenir."
    );
  }

  private int countWaitingRequests() {
    int count = 0;
    for (OperationData.RequestRecord request : data.requests) {
      if (request.waitingForResponse()) count += 1;
    }
    return count;
  }

  private int countPensionReservations(String status) {
    int count = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (status.equals(reservation.status)
          && AndroidUiRules.isPensionReservation(data, reservation)) {
        count += 1;
      }
    }
    return count;
  }

  private int countRestaurantOnlyReservations(String status) {
    int count = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (status.equals(reservation.status)
          && AndroidUiRules.isRestaurantOnlyReservation(reservation)) {
        count += 1;
      }
    }
    return count;
  }

  private int countStockByStatus(String status) {
    int count = 0;
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      if (status.equals(item.stockStatus)) count += 1;
    }
    return count;
  }

  private boolean hasPaymentOrderForTable(String tableId) {
    for (OperationData.TableOrder order : data.tableOrders) {
      if (tableId.equals(order.tableId) && "payment".equals(order.status)) {
        return true;
      }
    }
    return false;
  }

  private OperationData.ActionRecord latestFailedAction() {
    for (OperationData.ActionRecord action : data.actions) {
      if ("failed".equals(action.status)) return action;
    }
    return null;
  }

  private static final class Counter {
    final String label;
    final long value;
    final int tone;
    final String route;

    Counter(String label, long value, int tone, String route) {
      this.label = label;
      this.value = value;
      this.tone = tone;
      this.route = route == null ? "" : route;
    }
  }
}

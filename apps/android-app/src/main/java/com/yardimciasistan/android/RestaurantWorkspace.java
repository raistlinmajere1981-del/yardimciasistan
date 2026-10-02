package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.view.View;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.ArrayList;

final class RestaurantWorkspace {
  interface Listener {
    void onModeChanged(String mode);
    void onRoute(String route);
    void onCreateTableReservation();
    void onCreateTask();
    View createTableCard(OperationData.TableRecord table);
    View createReservationCard(OperationData.ReservationRecord reservation);
    View createOrderCard(OperationData.TableOrder order);
    View createTaskCard(OperationData.TaskRecord task);
    View createStockImageImportCard();
    View createStockCard(OperationData.TrackedStockItem item);
    View createAdminCategoryCard(OperationData.MenuCategory category);
    View createAdminMenuItemCard(OperationData.MenuItem item);
  }

  private final ComponentActivity activity;
  private final OperationData data;
  private final Listener listener;
  private final int bottomPaddingDp;

  RestaurantWorkspace(
      ComponentActivity activity,
      OperationData data,
      Listener listener,
      int bottomPaddingDp
  ) {
    this.activity = activity;
    this.data = data;
    this.listener = listener;
    this.bottomPaddingDp = bottomPaddingDp;
  }

  View render(String mode) {
    LinearLayout page = UiKit.column(activity);
    ArrayList<String[]> options = new ArrayList<>();
    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_TABLES)) {
      options.add(new String[] {AndroidUiRules.RESTAURANT_TABLES, "Masalar"});
    }
    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_RESERVATIONS)) {
      options.add(new String[] {AndroidUiRules.RESTAURANT_RESERVATIONS, "Rezervasyonlar"});
    }
    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_ORDERS)) {
      options.add(new String[] {AndroidUiRules.RESTAURANT_ORDERS, "Açık Adisyon"});
    }
    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_TASKS)) {
      options.add(new String[] {AndroidUiRules.RESTAURANT_TASKS, "İşler"});
    }
    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_STOCK)) {
      options.add(new String[] {AndroidUiRules.RESTAURANT_STOCK, "Stok"});
    }
    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_MENU)) {
      options.add(new String[] {AndroidUiRules.RESTAURANT_MENU, "Menü"});
    }
    if (options.isEmpty()) {
      page.addView(emptyCard(
          "Bu cihazın bu alan için yetkisi yok",
          "Yetkiler masaüstü yöneticisi tarafından belirlenir."
      ));
      return UiKit.scroll(activity, page, bottomPaddingDp);
    }

    page.addView(filterBar(options.toArray(new String[0][]), mode));

    if (AndroidUiRules.RESTAURANT_TABLES.equals(mode)) {
      renderTables(page);
    } else if (AndroidUiRules.RESTAURANT_RESERVATIONS.equals(mode)) {
      renderReservations(page);
    } else if (AndroidUiRules.RESTAURANT_ORDERS.equals(mode)) {
      renderOrders(page);
    } else if (AndroidUiRules.RESTAURANT_TASKS.equals(mode)) {
      renderTasks(page);
    } else if (AndroidUiRules.RESTAURANT_STOCK.equals(mode)) {
      renderStock(page);
    } else {
      renderMenuAdmin(page);
    }
    return UiKit.scroll(activity, page, bottomPaddingDp);
  }

  private void renderTables(LinearLayout page) {
    ArrayList<CounterValue> counters = new ArrayList<>();
    counters.add(new CounterValue("Boş", countTablesByStatus("available"), UiKit.SUCCESS, ""));
    counters.add(new CounterValue("Dolu", countTablesByStatus("occupied"), UiKit.INFO, ""));
    if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS)) {
      counters.add(new CounterValue("Hesap", countPaymentWaitingTables(), UiKit.WARNING, ""));
      counters.add(new CounterValue("Açık", countActiveOrders(), UiKit.ACCENT, "restaurant:orders"));
    }
    page.addView(statusStrip(counters.toArray(new CounterValue[0])));

    if (data.tables.isEmpty()) {
      page.addView(emptyCard("Masa verisi yayınlanmamış", "Masaüstünden Android özetini yayınlayın."));
    }
    for (OperationData.TableRecord table : data.tables) {
      page.addView(listener.createTableCard(table));
    }
  }

  private void renderReservations(LinearLayout page) {
    if (AndroidUiRules.canCreateTableReservation(data)) {
      Button create = UiKit.button(
          activity,
          "+ Yeni Rezervasyon",
          UiKit.PRIMARY,
          view -> listener.onCreateTableReservation()
      );
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
      params.setMargins(0, 0, 0, UiKit.dp(activity, 10));
      create.setLayoutParams(params);
      create.setEnabled(!data.customers.isEmpty());
      page.addView(create);
    }

    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Bekleyen", countRestaurantReservations("pending"), UiKit.WARNING, ""),
        new CounterValue("Onaylı", countRestaurantReservations("approved"), UiKit.SUCCESS, ""),
        new CounterValue("Bugün", countRestaurantReservationsToday(), UiKit.INFO, "")
    }));

    int shown = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (!AndroidUiRules.isRestaurantReservation(data, reservation)
          || !AndroidUiRules.reservationAllowed(data, reservation)) {
        continue;
      }
      page.addView(listener.createReservationCard(reservation));
      shown += 1;
    }
    if (shown == 0) {
      page.addView(emptyCard(
          "Restoran rezervasyonu yok",
          "Masa ve kahvaltı rezervasyonları geldiğinde burada görünür."
      ));
    }
  }

  private void renderOrders(LinearLayout page) {
    int activeOrders = countActiveOrders();
    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Açık", countOrdersByStatus("open"), UiKit.INFO, ""),
        new CounterValue("Hazırl.", countOrdersByStatus("preparing"), UiKit.ACCENT, ""),
        new CounterValue("Servis", countOrdersByStatus("served"), UiKit.SUCCESS, ""),
        new CounterValue("Hesap", countOrdersByStatus("payment"), UiKit.WARNING, "")
    }));
    if (activeOrders == 0) {
      page.addView(emptyCard("Aktif adisyon yok", "Sipariş açılan masalar burada ayrıca görünür."));
    }
    for (OperationData.TableOrder order : data.tableOrders) {
      if (order.isActive()) {
        page.addView(listener.createOrderCard(order));
      }
    }
  }

  private void renderTasks(LinearLayout page) {
    if (data.hasPermission("daily_task.create")
        && data.hasBusinessCapability(AndroidUiRules.CAPABILITY_TABLES)) {
      Button create = UiKit.button(activity, "+ Yeni İş", UiKit.PRIMARY, view -> listener.onCreateTask());
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
      params.setMargins(0, 0, 0, UiKit.dp(activity, 10));
      create.setLayoutParams(params);
      page.addView(create);
    }

    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Bekleyen", countRestaurantTasks(false), UiKit.WARNING, ""),
        new CounterValue("Tamam", countRestaurantTasks(true), UiKit.SUCCESS, "")
    }));

    int shown = 0;
    for (OperationData.TaskRecord task : data.tasks) {
      if (!AndroidUiRules.isRestaurantTask(data, task) || !AndroidUiRules.taskAllowed(data, task)) {
        continue;
      }
      page.addView(listener.createTaskCard(task));
      shown += 1;
    }
    if (shown == 0) {
      page.addView(emptyCard("Restoran işi yok", "Günlük restoran işleri sakin görünüyor."));
    }
  }

  private void renderStock(LinearLayout page) {
    if (data.hasPermission("menu.stock_update") && AndroidUiRules.canUseAi(data)) {
      page.addView(listener.createStockImageImportCard());
    }
    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Stok yok", countStockByStatus("out_of_stock"), UiKit.DANGER, ""),
        new CounterValue("Az stok", countStockByStatus("low_stock"), UiKit.WARNING, ""),
        new CounterValue("Takip", data.trackedStockItems.size(), UiKit.INFO, "")
    }));

    page.addView(sectionLabel("Stokta yok"));
    int outOfStock = 0;
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      if ("out_of_stock".equals(item.stockStatus)) {
        page.addView(listener.createStockCard(item));
        outOfStock += 1;
      }
    }
    if (outOfStock == 0) {
      page.addView(emptyCard("Stokta olmayan ürün yok", "Takip edilen ürünlerde tükenen stok bulunmuyor."));
    }

    page.addView(sectionLabel("Az stok"));
    int lowStock = 0;
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      if ("low_stock".equals(item.stockStatus)) {
        page.addView(listener.createStockCard(item));
        lowStock += 1;
      }
    }
    if (lowStock == 0) {
      page.addView(emptyCard("Azalan stok yok", "Minimum stok seviyesine yaklaşan ürün bulunmuyor."));
    }

    page.addView(sectionLabel("Tüm takip edilen ürünler"));
    if (data.trackedStockItems.isEmpty()) {
      page.addView(emptyCard("Stok takibi yapılmıyor", "Masaüstünde stok adedi girilen ürünler burada görünür."));
    }
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      page.addView(listener.createStockCard(item));
    }
  }

  private void renderMenuAdmin(LinearLayout page) {
    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Kategori", data.adminCategories.size(), UiKit.INFO, ""),
        new CounterValue("Ürün", data.adminMenuItems.size(), UiKit.ACCENT, "")
    }));
    page.addView(emptyCard(
        "Yönetici silme alanı",
        "Kategori silmek o kategoriye bağlı tüm ürünleri de siler. Her işlem ayrıca onay ister."
    ));

    page.addView(sectionLabel("Kategoriler"));
    if (data.adminCategories.isEmpty()) {
      page.addView(emptyCard("Kategori yok", "Silinebilecek menü kategorisi bulunmuyor."));
    }
    for (OperationData.MenuCategory category : data.adminCategories) {
      page.addView(listener.createAdminCategoryCard(category));
    }

    page.addView(sectionLabel("Ürünler"));
    if (data.adminMenuItems.isEmpty()) {
      page.addView(emptyCard("Ürün yok", "Silinebilecek menü ürünü bulunmuyor."));
    }
    for (OperationData.MenuItem item : data.adminMenuItems) {
      page.addView(listener.createAdminMenuItemCard(item));
    }
  }

  private View filterBar(String[][] options, String selected) {
    HorizontalScrollView scroll = new HorizontalScrollView(activity);
    scroll.setHorizontalScrollBarEnabled(false);
    LinearLayout row = UiKit.row(activity);
    row.setPadding(0, UiKit.dp(activity, 3), 0, UiKit.dp(activity, 6));
    for (String[] option : options) {
      row.addView(UiKit.chip(
          activity,
          option[1],
          option[0].equals(selected),
          view -> listener.onModeChanged(option[0])
      ));
    }
    scroll.addView(row);
    return scroll;
  }

  private View statusStrip(CounterValue[] counters) {
    HorizontalScrollView scroll = new HorizontalScrollView(activity);
    scroll.setHorizontalScrollBarEnabled(false);
    scroll.setContentDescription("Sayaçlar");
    LinearLayout row = UiKit.row(activity);
    row.setPadding(0, UiKit.dp(activity, 2), UiKit.dp(activity, 4), UiKit.dp(activity, 7));
    for (CounterValue counter : counters) {
      View.OnClickListener click = counter.route.isEmpty()
          ? null
          : view -> listener.onRoute(counter.route);
      row.addView(UiKit.counterChip(activity, counter.label, counter.value, counter.tone, click));
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

  private int countTablesByStatus(String status) {
    int count = 0;
    for (OperationData.TableRecord table : data.tables) {
      if (status.equals(table.status)) count += 1;
    }
    return count;
  }

  private int countPaymentWaitingTables() {
    int count = countOrdersByStatus("payment");
    for (OperationData.TableRecord table : data.tables) {
      if (("bill_waiting".equals(table.status) || "payment".equals(table.status))
          && !hasPaymentOrderForTable(table.id)) {
        count += 1;
      }
    }
    return count;
  }

  private boolean hasPaymentOrderForTable(String tableId) {
    for (OperationData.TableOrder order : data.tableOrders) {
      if (tableId.equals(order.tableId) && "payment".equals(order.status) && order.isActive()) {
        return true;
      }
    }
    return false;
  }

  private int countActiveOrders() {
    int count = 0;
    for (OperationData.TableOrder order : data.tableOrders) {
      if (order.isActive()) count += 1;
    }
    return count;
  }

  private int countOrdersByStatus(String status) {
    int count = 0;
    for (OperationData.TableOrder order : data.tableOrders) {
      if (status.equals(order.status) && order.isActive()) count += 1;
    }
    return count;
  }

  private int countRestaurantReservations(String status) {
    int count = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (status.equals(reservation.status)
          && AndroidUiRules.isRestaurantReservation(data, reservation)
          && AndroidUiRules.reservationAllowed(data, reservation)) {
        count += 1;
      }
    }
    return count;
  }

  private int countRestaurantReservationsToday() {
    String today = new SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT).format(new Date());
    int count = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (!AndroidUiRules.isRestaurantReservation(data, reservation)
          || !AndroidUiRules.reservationAllowed(data, reservation)
          || "cancelled".equals(reservation.status)
          || "rejected".equals(reservation.status)) {
        continue;
      }
      if (today.equals(reservation.startDate)) {
        count += 1;
      }
    }
    return count;
  }

  private int countRestaurantTasks(boolean completed) {
    int count = 0;
    for (OperationData.TaskRecord task : data.tasks) {
      if (!AndroidUiRules.isRestaurantTask(data, task) || !AndroidUiRules.taskAllowed(data, task)) {
        continue;
      }
      if ((completed && "done".equals(task.status)) || (!completed && "pending".equals(task.status))) {
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

  private static final class CounterValue {
    final String label;
    final int value;
    final int tone;
    final String route;

    CounterValue(String label, int value, int tone, String route) {
      this.label = label;
      this.value = value;
      this.tone = tone;
      this.route = route == null ? "" : route;
    }
  }
}

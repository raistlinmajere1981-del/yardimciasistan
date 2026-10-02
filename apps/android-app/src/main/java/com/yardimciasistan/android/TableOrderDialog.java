package com.yardimciasistan.android;

import android.app.Dialog;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class TableOrderDialog {
  interface Listener {
    void addHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen);
    void configureFullDialog(Dialog dialog);
    void onOpenOrder(OperationData.TableRecord table);
    void onAddItem(OperationData.TableRecord table, OperationData.TableOrder order, OperationData.MenuItem item);
    void onUpdateItemQuantity(OperationData.TableOrderItem item, int quantity);
    void onRemoveItem(OperationData.TableOrderItem item);
    void onSetOrderStatus(OperationData.TableOrder order, String status);
    void onCloseOrder(OperationData.TableOrder order, String status);
    void onConfirm(String title, String message, Runnable action);
  }

  private final ComponentActivity activity;
  private final OperationData data;
  private final OperationData.TableRecord table;
  private final Listener listener;

  TableOrderDialog(
      ComponentActivity activity,
      OperationData data,
      OperationData.TableRecord table,
      Listener listener
  ) {
    this.activity = activity;
    this.data = data;
    this.table = table;
    this.listener = listener;
  }

  void show() {
    OperationData.TableOrder order = data.activeOrderForTable(table.id);
    Dialog dialog = new Dialog(activity);
    LinearLayout shell = UiKit.column(activity);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(activity, 14), UiKit.dp(activity, 12), UiKit.dp(activity, 14), UiKit.dp(activity, 16));

    LinearLayout header = UiKit.row(activity);
    LinearLayout heading = UiKit.column(activity);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(activity, "MASA SİPARİŞİ"));
    heading.addView(UiKit.title(activity, table.name));
    String orderSummary = order == null
        ? "Adisyon yok · 0 ürün · " + money(0, "TRY")
        : formatOrderStatus(order.status) + " · " + order.itemCount + " ürün · " + money(order.total, orderCurrency(order));
    heading.addView(UiKit.text(
        activity,
        orderSummary,
        12,
        order == null ? UiKit.WARNING : orderTone(order.status),
        Typeface.BOLD
    ));
    header.addView(heading);
    listener.addHeaderActions(header, dialog, this::show);
    shell.addView(header);

    LinearLayout page = UiKit.column(activity);
    if (order == null) {
      TextView hint = UiKit.text(
          activity,
          "Ürün ekleyin veya alttaki Siparişi Kaydet aksiyonuyla boş adisyon açın.",
          12,
          UiKit.MUTED,
          Typeface.NORMAL
      );
      LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(-1, -2);
      hintParams.setMargins(0, UiKit.dp(activity, 6), 0, UiKit.dp(activity, 4));
      hint.setLayoutParams(hintParams);
      page.addView(hint);
    }

    if (data.hasPermission("menu.view")) {
      appendMenuPicker(page, order);
    }

    page.addView(sectionLabel("Aktif adisyon satırları"));
    if (order == null || order.items.isEmpty()) {
      page.addView(emptyCard("Henüz ürün yok", "Menüden Ekle'ye dokunarak siparişi başlatın."));
    } else {
      for (OperationData.TableOrderItem item : order.items) {
        page.addView(orderItemCard(item));
      }
    }

    LinearLayout total = UiKit.card(activity);
    total.addView(settingLine(
        "Toplam",
        order == null ? money(0, "TRY") : money(order.total, orderCurrency(order)),
        UiKit.PRIMARY
    ));
    page.addView(total);

    if (order != null && data.hasPermission("table_order.cancel")) {
      Button cancel = UiKit.dangerButton(
          activity,
          "Adisyonu İptal Et",
          view -> listener.onConfirm(
              "Adisyonu iptal et",
              "Adisyon iptal edilip masa boşaltılsın mı?",
              () -> {
                listener.onCloseOrder(order, "cancelled");
                dialog.dismiss();
              }
          )
      );
      LinearLayout.LayoutParams cancelParams = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
      cancelParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      cancel.setLayoutParams(cancelParams);
      page.addView(cancel);
    }

    ScrollView scroll = UiKit.scroll(activity, page);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);

    ArrayList<Button> stickyActions = new ArrayList<>();
    if (order == null && data.hasPermission("table_order.open")) {
      stickyActions.add(UiKit.button(
          activity,
          "Siparişi Kaydet",
          UiKit.PRIMARY,
          view -> listener.onOpenOrder(table)
      ));
    }
    if (order != null && data.hasPermission("table_order.set_preparing")) {
      stickyActions.add(UiKit.outlineButton(activity, "Hazırlanıyor", view -> listener.onSetOrderStatus(order, "preparing")));
    }
    if (order != null && data.hasPermission("table_order.set_served")) {
      stickyActions.add(UiKit.outlineButton(activity, "Servis Edildi", view -> listener.onSetOrderStatus(order, "served")));
    }
    if (order != null && data.hasPermission("table_order.set_payment_waiting")) {
      stickyActions.add(UiKit.button(activity, "Hesap Bekliyor", UiKit.ACCENT, view -> listener.onSetOrderStatus(order, "payment")));
    }
    if (order != null && data.hasPermission("table_order.close_paid")) {
      stickyActions.add(UiKit.button(
          activity,
          "Ödendi / Kapat",
          UiKit.PRIMARY,
          view -> listener.onConfirm(
              "Adisyonu kapat",
              "Adisyon ödendi olarak kapatılsın mı?",
              () -> {
                listener.onCloseOrder(order, "paid");
                dialog.dismiss();
              }
          )
      ));
    }
    if (!stickyActions.isEmpty()) {
      shell.addView(orderActionBar(stickyActions));
    }

    dialog.setContentView(shell);
    dialog.show();
    listener.configureFullDialog(dialog);
  }

  private void appendMenuPicker(LinearLayout page, OperationData.TableOrder order) {
    page.addView(sectionLabel("Ürünler"));
    final String[] category = {""};
    final String[] query = {""};

    EditText search = UiKit.input(activity, "Ürün ara");
    LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 50));
    searchParams.setMargins(0, 0, 0, UiKit.dp(activity, 7));
    search.setLayoutParams(searchParams);
    page.addView(search);

    LinearLayout categoryRow = UiKit.row(activity);
    HorizontalScrollView categoryScroll = new HorizontalScrollView(activity);
    categoryScroll.setHorizontalScrollBarEnabled(false);
    categoryScroll.addView(categoryRow);
    page.addView(categoryScroll);

    LinearLayout menuContainer = UiKit.column(activity);
    LinearLayout.LayoutParams menuParams = new LinearLayout.LayoutParams(-1, -2);
    menuParams.setMargins(0, UiKit.dp(activity, 7), 0, 0);
    menuContainer.setLayoutParams(menuParams);
    page.addView(menuContainer);

    final Runnable[] refreshMenu = new Runnable[1];
    refreshMenu[0] = () -> {
      categoryRow.removeAllViews();
      categoryRow.addView(UiKit.chip(activity, "Tümü", category[0].isEmpty(), view -> {
        category[0] = "";
        refreshMenu[0].run();
      }));
      for (OperationData.MenuCategory menuCategory : data.categories) {
        categoryRow.addView(UiKit.chip(
            activity,
            menuCategory.name,
            menuCategory.id.equals(category[0]),
            view -> {
              category[0] = menuCategory.id;
              refreshMenu[0].run();
            }
        ));
      }
      renderMenuItems(menuContainer, order, category[0], query[0]);
    };

    search.addTextChangedListener(new TextWatcher() {
      @Override public void beforeTextChanged(CharSequence text, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence text, int start, int before, int count) {
        query[0] = text == null ? "" : text.toString().trim();
        renderMenuItems(menuContainer, order, category[0], query[0]);
      }
      @Override public void afterTextChanged(Editable editable) {}
    });
    refreshMenu[0].run();
  }

  private void renderMenuItems(
      LinearLayout container,
      OperationData.TableOrder order,
      String categoryId,
      String search
  ) {
    container.removeAllViews();
    String normalizedSearch = search.toLowerCase(new Locale("tr", "TR"));
    int shown = 0;
    for (OperationData.MenuItem item : data.menuItems) {
      if (!item.available || (!categoryId.isEmpty() && !categoryId.equals(item.categoryId))) continue;
      if (!normalizedSearch.isEmpty()
          && !item.name.toLowerCase(new Locale("tr", "TR")).contains(normalizedSearch)
          && !item.description.toLowerCase(new Locale("tr", "TR")).contains(normalizedSearch)) {
        continue;
      }

      LinearLayout card = UiKit.card(activity);
      LinearLayout row = UiKit.row(activity);
      LinearLayout details = UiKit.column(activity);
      details.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
      details.addView(UiKit.text(activity, item.name, 14, UiKit.TEXT, Typeface.BOLD));
      details.addView(UiKit.text(
          activity,
          data.categoryName(item.categoryId) + " · " + money(item.price, item.currency),
          12,
          UiKit.MUTED,
          Typeface.NORMAL
      ));
      if (item.stockQuantity != null) {
        details.addView(UiKit.text(
            activity,
            item.outOfStock() ? "Stokta yok" : "Mevcut stok: " + stockQuantity(item.stockQuantity, item.stockUnit),
            12,
            item.outOfStock() ? UiKit.DANGER : UiKit.INFO,
            Typeface.BOLD
        ));
      }
      row.addView(details);

      boolean canAdd = data.hasPermission("table_order.add_item")
          && (order != null || data.hasPermission("table_order.open"));
      if (canAdd) {
        Button add = UiKit.button(
            activity,
            item.outOfStock() ? "Stok yok" : "Ekle",
            UiKit.PRIMARY,
            view -> listener.onAddItem(table, order, item)
        );
        add.setLayoutParams(new LinearLayout.LayoutParams(UiKit.dp(activity, 82), UiKit.dp(activity, 44)));
        add.setEnabled(!item.outOfStock());
        row.addView(add);
      }
      card.addView(row);
      container.addView(card);
      shown += 1;
    }

    if (shown == 0) {
      container.addView(emptyCard("Ürün bulunamadı", "Arama veya kategori filtresini değiştirin."));
    }
  }

  private View orderItemCard(OperationData.TableOrderItem item) {
    LinearLayout card = UiKit.card(activity);
    LinearLayout top = UiKit.row(activity);
    LinearLayout details = UiKit.column(activity);
    details.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    details.addView(UiKit.text(activity, item.productName, 14, UiKit.TEXT, Typeface.BOLD));
    details.addView(UiKit.text(
        activity,
        money(item.unitPrice, item.currency) + " · " + money(item.lineTotal, item.currency),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    top.addView(details);
    top.addView(UiKit.badge(activity, String.valueOf(item.quantity), UiKit.PRIMARY));
    card.addView(top);

    if (data.hasPermission("table_order.update_item") || data.hasPermission("table_order.remove_item")) {
      LinearLayout actions = UiKit.row(activity);
      LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(-1, -2);
      actionParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      actions.setLayoutParams(actionParams);

      if (data.hasPermission("table_order.update_item")) {
        Button minus = UiKit.outlineButton(activity, "−", view -> {
          if (item.quantity > 1) listener.onUpdateItemQuantity(item, item.quantity - 1);
        });
        minus.setEnabled(item.quantity > 1);
        UiKit.addAction(actions, minus, activity);

        Button plus = UiKit.outlineButton(activity, "+", view -> listener.onUpdateItemQuantity(item, item.quantity + 1));
        OperationData.MenuItem currentMenuItem = data.menuItemById(item.menuItemId);
        plus.setEnabled(currentMenuItem == null || !currentMenuItem.outOfStock());
        UiKit.addAction(actions, plus, activity);
      }

      if (data.hasPermission("table_order.remove_item")) {
        UiKit.addAction(
            actions,
            UiKit.dangerButton(
                activity,
                "Sil",
                view -> listener.onConfirm(
                    "Ürünü sil",
                    item.productName + " adisyondan kaldırılsın mı?",
                    () -> listener.onRemoveItem(item)
                )
            ),
            activity
        );
      }
      card.addView(actions);
    }
    return card;
  }

  private View orderActionBar(List<Button> actions) {
    LinearLayout bar = UiKit.column(activity);
    bar.setContentDescription("Adisyon aksiyonları");
    bar.setPadding(0, UiKit.dp(activity, 8), 0, 0);
    bar.setBackground(UiKit.rounded(activity, UiKit.BG, UiKit.BORDER, 0));
    int firstRowEnd = actions.size() > 2 ? 2 : actions.size();
    bar.addView(orderActionRow(actions, 0, firstRowEnd));
    if (firstRowEnd < actions.size()) {
      LinearLayout secondRow = orderActionRow(actions, firstRowEnd, actions.size());
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, UiKit.dp(activity, 7), 0, 0);
      secondRow.setLayoutParams(params);
      bar.addView(secondRow);
    }
    return bar;
  }

  private LinearLayout orderActionRow(List<Button> actions, int start, int end) {
    LinearLayout row = UiKit.row(activity);
    row.setLayoutParams(new LinearLayout.LayoutParams(-1, -2));
    for (int index = start; index < end; index += 1) {
      UiKit.addAction(row, actions.get(index), activity);
    }
    return row;
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

  private View settingLine(String label, String value, int tone) {
    LinearLayout row = UiKit.row(activity);
    TextView title = UiKit.text(activity, label, 13, UiKit.MUTED, Typeface.BOLD);
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    row.addView(title);
    TextView detail = UiKit.text(activity, value, 13, tone, Typeface.BOLD);
    detail.setGravity(android.view.Gravity.END);
    detail.setMaxWidth(UiKit.dp(activity, 190));
    row.addView(detail);
    return row;
  }
}

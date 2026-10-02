package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.app.Dialog;
import android.graphics.Typeface;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

import java.util.ArrayList;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class OperationMutationDialogs {
  interface Listener {
    void updateRoom(OperationData.RoomRecord room, String status);
    void updateTable(OperationData.TableRecord table, String status);
    void sendAction(String actionType, JSONObject payload, String successMessage);
    void configureBottomDialog(Dialog dialog);
    AlertDialog.Builder alertDialogBuilder();
  }

  static void showRoomStatus(
      ComponentActivity activity,
      OperationData.RoomRecord room,
      Listener listener
  ) {
    showStatusSelection(
        activity,
        "Oda durumunu değiştir",
        room.status,
        new String[][] {
            {"available", "Boş"},
            {"occupied", "Dolu"},
            {"cleaning", "Temizlik"},
            {"maintenance", "Bakım"}
        },
        status -> listener.updateRoom(room, status),
        listener
    );
  }

  static void showTableStatus(
      ComponentActivity activity,
      OperationData data,
      OperationData.TableRecord table,
      Listener listener
  ) {
    ArrayList<String[]> options = new ArrayList<>();
    options.add(new String[] {"available", "Boş"});
    options.add(new String[] {"occupied", "Dolu"});

    if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS)) {
      options.add(new String[] {"reserved", "Rezerve"});
    }
    if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS)) {
      options.add(new String[] {"bill_waiting", "Hesap"});
    }

    showStatusSelection(
        activity,
        "Masa durumunu değiştir",
        table.status,
        options.toArray(new String[0][]),
        status -> listener.updateTable(table, status),
        listener
    );
  }

  static void showStockActions(
      ComponentActivity activity,
      OperationData.TrackedStockItem item,
      Listener listener
  ) {
    Dialog dialog = new Dialog(activity);
    LinearLayout sheet = UiKit.column(activity);
    sheet.setPadding(
        UiKit.dp(activity, 18),
        UiKit.dp(activity, 16),
        UiKit.dp(activity, 18),
        UiKit.dp(activity, 18)
    );
    sheet.setBackground(UiKit.rounded(
        activity,
        UiKit.SURFACE,
        UiKit.BORDER,
        18
    ));
    sheet.addView(UiKit.eyebrow(activity, "STOK GÜNCELLE"));
    sheet.addView(UiKit.title(activity, item.name));
    sheet.addView(UiKit.text(
        activity,
        "Mevcut stok: " + stockQuantity(item.stockQuantity, item.stockUnit),
        13,
        UiKit.MUTED,
        Typeface.NORMAL
    ));

    int quickAddQuantity = "gram".equals(item.stockUnit) ? 1000 : 1;
    Button add = UiKit.button(
        activity,
        "+" + stockQuantity(quickAddQuantity, item.stockUnit) + " Ekle",
        UiKit.PRIMARY,
        view -> {
          listener.sendAction(
              "menu_stock_add",
              payload(
                  "menu_item_id", item.menuItemId,
                  "quantity", quickAddQuantity,
                  "note", "Android hızlı stok ekleme"
              ),
              item.name + " stok ekleme işlemi gönderildi."
          );
          dialog.dismiss();
        }
    );
    LinearLayout.LayoutParams actionParams =
        new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
    actionParams.setMargins(0, UiKit.dp(activity, 10), 0, 0);
    add.setLayoutParams(actionParams);
    sheet.addView(add);

    Button set = UiKit.outlineButton(activity, "Miktarı Ayarla", view -> {
      dialog.dismiss();
      showStockMutation(activity, item, "set", listener);
    });
    LinearLayout.LayoutParams setParams =
        new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
    setParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    set.setLayoutParams(setParams);
    sheet.addView(set);

    Button adjust = UiKit.outlineButton(activity, "Fark Gir", view -> {
      dialog.dismiss();
      showStockMutation(activity, item, "adjust", listener);
    });
    LinearLayout.LayoutParams adjustParams =
        new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
    adjustParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    adjust.setLayoutParams(adjustParams);
    sheet.addView(adjust);

    dialog.setContentView(sheet);
    dialog.show();
    listener.configureBottomDialog(dialog);
  }

  private static void showStatusSelection(
      ComponentActivity activity,
      String title,
      String current,
      String[][] options,
      StatusSelection listener,
      Listener host
  ) {
    Dialog dialog = new Dialog(activity);
    LinearLayout sheet = UiKit.column(activity);
    sheet.setPadding(
        UiKit.dp(activity, 18),
        UiKit.dp(activity, 16),
        UiKit.dp(activity, 18),
        UiKit.dp(activity, 18)
    );
    sheet.setBackground(UiKit.rounded(
        activity,
        UiKit.SURFACE,
        UiKit.BORDER,
        18
    ));
    sheet.addView(UiKit.eyebrow(activity, "DURUM"));
    sheet.addView(UiKit.title(activity, title));

    for (String[] option : options) {
      boolean selected = option[0].equals(current);
      Button choice = selected
          ? UiKit.button(
              activity,
              option[1] + " · Seçili",
              UiKit.PRIMARY,
              view -> dialog.dismiss()
          )
          : UiKit.outlineButton(activity, option[1], view -> {
            listener.onSelect(option[0]);
            dialog.dismiss();
          });
      LinearLayout.LayoutParams params =
          new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
      params.setMargins(0, UiKit.dp(activity, 8), 0, 0);
      choice.setLayoutParams(params);
      sheet.addView(choice);
    }

    dialog.setContentView(sheet);
    dialog.show();
    host.configureBottomDialog(dialog);
  }

  private static void showStockMutation(
      ComponentActivity activity,
      OperationData.TrackedStockItem item,
      String mode,
      Listener listener
  ) {
    LinearLayout form = UiKit.column(activity);
    int horizontal = UiKit.dp(activity, 20);
    form.setPadding(horizontal, 0, horizontal, 0);

    EditText quantity = UiKit.input(
        activity,
        "set".equals(mode)
            ? "Yeni stok miktarı (" + stockUnitLabel(item.stockUnit) + ")"
            : "Stok farkı (" + stockUnitLabel(item.stockUnit) + ")"
    );
    quantity.setInputType(
        InputType.TYPE_CLASS_NUMBER
            | InputType.TYPE_NUMBER_FLAG_DECIMAL
            | ("adjust".equals(mode) ? InputType.TYPE_NUMBER_FLAG_SIGNED : 0)
    );
    if ("set".equals(mode)) {
      quantity.setText(stockNumber(item.stockQuantity));
    }

    EditText note = UiKit.input(activity, "Not (isteğe bağlı)");
    LinearLayout.LayoutParams noteParams =
        new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 50));
    noteParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    note.setLayoutParams(noteParams);

    form.addView(quantity);
    form.addView(note);

    AlertDialog dialog = listener.alertDialogBuilder()
        .setTitle(
            "set".equals(mode)
                ? "Stok miktarını ayarla"
                : "Stok farkı gir"
        )
        .setView(form)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton("Kaydet", null)
        .create();

    dialog.setOnShowListener(value -> {
      dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(UiKit.MUTED);
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(UiKit.PRIMARY);
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
        double parsed;
        try {
          parsed = Double.parseDouble(
              quantity.getText().toString().trim().replace(',', '.')
          );
        } catch (NumberFormatException error) {
          Toast.makeText(
              activity,
              "Geçerli bir stok değeri girin.",
              Toast.LENGTH_SHORT
          ).show();
          return;
        }

        if (("set".equals(mode) && parsed < 0)
            || ("adjust".equals(mode) && parsed == 0)) {
          Toast.makeText(
              activity,
              "Stok değeri geçersiz.",
              Toast.LENGTH_SHORT
          ).show();
          return;
        }

        String actionType =
            "set".equals(mode) ? "menu_stock_set" : "menu_stock_adjust";
        String quantityKey =
            "set".equals(mode) ? "quantity" : "quantity_change";

        listener.sendAction(
            actionType,
            payload(
                "menu_item_id", item.menuItemId,
                quantityKey, parsed,
                "note", note.getText().toString().trim()
            ),
            item.name + " stok güncellemesi gönderildi."
        );
        dialog.dismiss();
      });
    });
    dialog.show();
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

  private interface StatusSelection {
    void onSelect(String value);
  }

  private OperationMutationDialogs() {}
}

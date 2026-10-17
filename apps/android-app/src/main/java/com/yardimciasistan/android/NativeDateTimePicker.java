package com.yardimciasistan.android;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.NumberPicker;
import android.widget.PopupWindow;
import android.widget.ScrollView;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.Locale;

/**
 * V16 Android-native Turkish picker. A focusable popover over the existing edit
 * dialog, never a second AlertDialog or an embedded browser. YYYY-MM-DD and
 * HH:mm values stay unchanged for the existing action/validation contracts.
 */
final class NativeDateTimePicker {
  private static final Locale TR = new Locale("tr", "TR");
  private static final Locale ISO = Locale.US;
  private static final String[] DAYS = {"Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"};
  private NativeDateTimePicker() {}

  static void showDate(Context context, EditText target, EditText checkIn, boolean allowPast) {
    showDate(context, target, checkIn, allowPast, false);
  }

  static void showDate(Context context, EditText target, EditText checkIn,
      boolean allowPast, boolean optional) {
    Calendar current = parseDate(target.getText().toString());
    Calendar minimum = minDate(checkIn, allowPast);
    if (current.before(minimum)) current = (Calendar) minimum.clone();
    final Calendar shown = (Calendar) current.clone();
    final PopupWindow[] pop = new PopupWindow[1];
    LinearLayout panel = panel(context);
    panel.addView(header(context, checkIn == null ? "Tarih seç" : "Çıkış tarihi", () -> pop[0].dismiss()));

    LinearLayout quick = UiKit.row(context);
    String[] labels = checkIn == null ? new String[]{"Bugün", "Yarın", "+7 gün"} : new String[]{"+1 gün", "+2 gün", "+7 gün", "+10 gün"};
    int[] offsets = checkIn == null ? new int[]{0, 1, 7} : new int[]{1, 2, 7, 10};
    Calendar anchor = checkIn == null ? today() : parseDate(checkIn.getText().toString());
    for (int i = 0; i < labels.length; i++) {
      Calendar date = (Calendar) anchor.clone();
      date.add(Calendar.DAY_OF_MONTH, offsets[i]);
      Button item = small(context, labels[i]);
      item.setEnabled(!date.before(minimum));
      item.setOnClickListener(v -> { target.setText(key(date)); pop[0].dismiss(); });
      quick.addView(item, new LinearLayout.LayoutParams(0, UiKit.dp(context, 46), 1f));
    }
    panel.addView(quick);
    if (optional) {
      Button clear = small(context, "Tarihi temizle");
      clear.setContentDescription("İsteğe bağlı tarihi temizle");
      clear.setOnClickListener(v -> {
        target.setText("");
        pop[0].dismiss();
      });
      LinearLayout.LayoutParams clearParams = new LinearLayout.LayoutParams(-1, UiKit.dp(context, 44));
      clearParams.setMargins(0, UiKit.dp(context, 6), 0, UiKit.dp(context, 5));
      panel.addView(clear, clearParams);
    }

    LinearLayout nav = UiKit.row(context);
    Button back = small(context, "‹");
    Button next = small(context, "›");
    TextView month = UiKit.text(context, "", 16, UiKit.TEXT, Typeface.BOLD);
    month.setGravity(Gravity.CENTER);
    nav.addView(back, new LinearLayout.LayoutParams(UiKit.dp(context, 46), UiKit.dp(context, 48)));
    nav.addView(month, new LinearLayout.LayoutParams(0, UiKit.dp(context, 48), 1f));
    nav.addView(next, new LinearLayout.LayoutParams(UiKit.dp(context, 46), UiKit.dp(context, 48)));
    panel.addView(nav);

    // Years can be reached quickly for identity dates, without 30+ month taps.
    LinearLayout jumps = UiKit.row(context);
    NumberPicker months = new NumberPicker(context);
    months.setMinValue(0); months.setMaxValue(11);
    months.setDisplayedValues(new String[]{"Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
        "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"});
    months.setValue(shown.get(Calendar.MONTH));
    months.setWrapSelectorWheel(false);
    months.setDescendantFocusability(NumberPicker.FOCUS_BLOCK_DESCENDANTS);
    months.setContentDescription("Ay");
    NumberPicker year = new NumberPicker(context);
    year.setMinValue(1900);
    year.setMaxValue(Math.max(today().get(Calendar.YEAR) + 30, shown.get(Calendar.YEAR)));
    year.setValue(shown.get(Calendar.YEAR));
    year.setWrapSelectorWheel(false);
    year.setDescendantFocusability(NumberPicker.FOCUS_BLOCK_DESCENDANTS);
    year.setContentDescription("Yıl");
    jumps.addView(months, new LinearLayout.LayoutParams(0, UiKit.dp(context, 88), 1f));
    jumps.addView(year, new LinearLayout.LayoutParams(0, UiKit.dp(context, 88), 1f));
    panel.addView(jumps);

    LinearLayout weekdays = UiKit.row(context);
    for (String name : DAYS) {
      TextView label = UiKit.text(context, name, 12, UiKit.MUTED, Typeface.BOLD);
      label.setGravity(Gravity.CENTER);
      weekdays.addView(label, new LinearLayout.LayoutParams(0, UiKit.dp(context, 28), 1f));
    }
    panel.addView(weekdays);
    LinearLayout calendar = UiKit.column(context);
    panel.addView(calendar);

    final Runnable[] update = new Runnable[1];
    update[0] = () -> {
      month.setText(new SimpleDateFormat("LLLL yyyy", TR).format(shown.getTime()));
      calendar.removeAllViews();
      Calendar first = (Calendar) shown.clone();
      first.set(Calendar.DAY_OF_MONTH, 1);
      int offset = (first.get(Calendar.DAY_OF_WEEK) + 5) % 7;
      int length = first.getActualMaximum(Calendar.DAY_OF_MONTH);
      for (int rowIndex = 0; rowIndex < 6; rowIndex++) {
        LinearLayout row = UiKit.row(context);
        for (int column = 0; column < 7; column++) {
          int day = rowIndex * 7 + column - offset + 1;
          if (day < 1 || day > length) {
            row.addView(new View(context), new LinearLayout.LayoutParams(0, UiKit.dp(context, 44), 1f));
            continue;
          }
          Calendar date = (Calendar) first.clone();
          date.set(Calendar.DAY_OF_MONTH, day);
          Button b = small(context, Integer.toString(day));
          b.setContentDescription(day + " " + new SimpleDateFormat("LLLL yyyy", TR).format(date.getTime()));
          b.setEnabled(!date.before(minimum));
          if (key(date).equals(target.getText().toString())) {
            b.setBackground(UiKit.rounded(context, UiKit.CHIP_ACTIVE_BACKGROUND, UiKit.PRIMARY, 10));
          }
          b.setOnClickListener(v -> { target.setText(key(date)); pop[0].dismiss(); });
          row.addView(b, new LinearLayout.LayoutParams(0, UiKit.dp(context, 44), 1f));
        }
        calendar.addView(row);
        if ((rowIndex + 1) * 7 >= length + offset) break;
      }
    };
    back.setOnClickListener(v -> {
      shown.add(Calendar.MONTH, -1);
      year.setValue(shown.get(Calendar.YEAR));
      months.setValue(shown.get(Calendar.MONTH));
      update[0].run();
    });
    next.setOnClickListener(v -> {
      shown.add(Calendar.MONTH, 1);
      year.setValue(shown.get(Calendar.YEAR));
      months.setValue(shown.get(Calendar.MONTH));
      update[0].run();
    });
    months.setOnValueChangedListener((picker, oldValue, newValue) -> {
      // Avoid month overflow when jumping from day 31.
      shown.set(Calendar.DAY_OF_MONTH, 1);
      shown.set(Calendar.MONTH, newValue);
      update[0].run();
    });
    year.setOnValueChangedListener((picker, oldValue, newValue) -> {
      shown.set(Calendar.DAY_OF_MONTH, 1);
      shown.set(Calendar.YEAR, newValue);
      update[0].run();
    });
    update[0].run();
    if (checkIn != null) {
      TextView message = UiKit.text(context, "Çıkış tarihi giriş tarihinden sonra olmalı.", 12, UiKit.MUTED, Typeface.NORMAL);
      panel.addView(message);
    }
    pop[0] = show(context, target, panel);
  }

  static void showTime(Context context, EditText target) {
    final PopupWindow[] pop = new PopupWindow[1];
    LinearLayout panel = panel(context);
    panel.addView(header(context, "Saat seç · 24 saat", () -> pop[0].dismiss()));
    LinearLayout quick = UiKit.row(context);
    String[] labels = {"Şimdi", "+30 dk", "+1 saat"};
    int[] offsets = {0, 30, 60};
    for (int i = 0; i < labels.length; i++) {
      final int minutes = offsets[i];
      Button b = small(context, labels[i]);
      b.setOnClickListener(v -> {
        Calendar time = Calendar.getInstance();
        time.add(Calendar.MINUTE, minutes);
        target.setText(String.format(ISO, "%02d:%02d", time.get(Calendar.HOUR_OF_DAY), time.get(Calendar.MINUTE)));
        pop[0].dismiss();
      });
      quick.addView(b, new LinearLayout.LayoutParams(0, UiKit.dp(context, 46), 1f));
    }
    panel.addView(quick);

    LinearLayout pickers = UiKit.row(context);
    NumberPicker hours = new NumberPicker(context), minutes = new NumberPicker(context);
    hours.setMinValue(0); hours.setMaxValue(23); hours.setWrapSelectorWheel(true);
    minutes.setMinValue(0); minutes.setMaxValue(11); minutes.setWrapSelectorWheel(true);
    hours.setFormatter(i -> String.format(ISO, "%02d", i));
    minutes.setDisplayedValues(new String[]{"00","05","10","15","20","25","30","35","40","45","50","55"});
    hours.setContentDescription("Saat"); minutes.setContentDescription("Dakika");
    String[] parts = target.getText().toString().split(":", 2);
    if (parts.length == 2) {
      try {
        hours.setValue(Math.max(0, Math.min(23, Integer.parseInt(parts[0]))));
        minutes.setValue(Math.max(0, Math.min(11, (Integer.parseInt(parts[1]) + 2) / 5)));
      } catch (NumberFormatException ignored) {}
    } else {
      Calendar now = Calendar.getInstance();
      hours.setValue(now.get(Calendar.HOUR_OF_DAY)); minutes.setValue(now.get(Calendar.MINUTE) / 5);
    }
    pickers.addView(hours, new LinearLayout.LayoutParams(0, UiKit.dp(context, 175), 1f));
    pickers.addView(minutes, new LinearLayout.LayoutParams(0, UiKit.dp(context, 175), 1f));
    panel.addView(pickers);
    Button apply = UiKit.button(context, "Saati uygula", UiKit.PRIMARY, v -> {
      target.setText(String.format(ISO, "%02d:%02d", hours.getValue(), minutes.getValue() * 5));
      pop[0].dismiss();
    });
    panel.addView(apply, new LinearLayout.LayoutParams(-1, UiKit.dp(context, 48)));
    pop[0] = show(context, target, panel);
  }

  static String key(Calendar date) {
    return String.format(ISO, "%04d-%02d-%02d",
        date.get(Calendar.YEAR), date.get(Calendar.MONTH) + 1, date.get(Calendar.DAY_OF_MONTH));
  }

  private static Calendar minDate(EditText reference, boolean allowPast) {
    Calendar min = allowPast ? new GregorianCalendar(1900, 0, 1) : today();
    if (reference != null) {
      Calendar entry = parseDate(reference.getText().toString());
      entry.add(Calendar.DAY_OF_MONTH, 1);
      if (entry.after(min)) min = entry;
    }
    return min;
  }

  static Calendar parseDate(String value) {
    Calendar parsed = today();
    if (value != null && value.matches("\\d{4}-\\d{2}-\\d{2}")) {
      try {
        String[] parts = value.split("-");
        Calendar result = new GregorianCalendar(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, Integer.parseInt(parts[2]));
        result.setLenient(false);
        result.set(Calendar.HOUR_OF_DAY, 12);
        result.set(Calendar.MINUTE, 0);
        result.getTime();
        parsed = result;
      } catch (Exception ignored) {}
    }
    return parsed;
  }

  private static Calendar today() {
    Calendar day = Calendar.getInstance();
    day.set(Calendar.HOUR_OF_DAY, 12);
    day.set(Calendar.MINUTE, 0); day.set(Calendar.SECOND, 0); day.set(Calendar.MILLISECOND, 0);
    return day;
  }

  private static LinearLayout panel(Context context) {
    LinearLayout panel = UiKit.column(context);
    panel.setBackground(UiKit.rounded(context, UiKit.SURFACE, UiKit.BORDER, 20));
    panel.setPadding(UiKit.dp(context, 12), UiKit.dp(context, 12), UiKit.dp(context, 12), UiKit.dp(context, 12));
    return panel;
  }

  private static LinearLayout header(Context context, String title, Runnable close) {
    LinearLayout row = UiKit.row(context);
    TextView text = UiKit.text(context, title, 18, UiKit.TEXT, Typeface.BOLD);
    row.addView(text, new LinearLayout.LayoutParams(0, -2, 1f));
    Button dismiss = small(context, "Kapat");
    dismiss.setOnClickListener(v -> close.run());
    row.addView(dismiss, new LinearLayout.LayoutParams(-2, UiKit.dp(context, 46)));
    return row;
  }

  private static Button small(Context context, String label) {
    Button button = UiKit.outlineButton(context, label, null);
    button.setMinWidth(0);
    button.setMinimumWidth(0);
    button.setPadding(UiKit.dp(context, 2), 0, UiKit.dp(context, 2), 0);
    button.setTextSize(12);
    return button;
  }

  private static PopupWindow show(Context context, View anchor, LinearLayout panel) {
    ScrollView scroll = new ScrollView(context);
    scroll.setFillViewport(false);
    scroll.addView(panel);
    int width = Math.min(UiKit.dp(context, 430), context.getResources().getDisplayMetrics().widthPixels - UiKit.dp(context, 20));
    int height = Math.min(UiKit.dp(context, 560), context.getResources().getDisplayMetrics().heightPixels * 85 / 100);
    PopupWindow popup = new PopupWindow(scroll, width, height, true);
    popup.setBackgroundDrawable(new ColorDrawable(UiKit.SURFACE));
    popup.setOutsideTouchable(true);
    popup.setElevation(UiKit.dp(context, 10));
    popup.setOnDismissListener(() -> { if (anchor.isAttachedToWindow()) anchor.requestFocus(); });
    popup.showAtLocation(anchor, Gravity.CENTER, 0, 0);
    return popup;
  }
}

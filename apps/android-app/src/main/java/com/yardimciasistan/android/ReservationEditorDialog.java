package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.content.Context;
import android.text.InputType;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

final class ReservationEditorDialog {
  enum Kind {
    ROOM,
    TABLE
  }

  interface Listener {
    void onSave(JSONObject payload);
  }

  private ReservationEditorDialog() {}

  static void show(
      Context context,
      OperationData data,
      Kind kind,
      OperationData.ReservationRecord reservation,
      Listener listener
  ) {
    boolean editing = reservation != null;
    LinearLayout form = new LinearLayout(context);
    form.setOrientation(LinearLayout.VERTICAL);
    int padding = dp(context, 16);
    form.setPadding(padding, padding, padding, padding);

    Spinner customerSpinner = null;
    TextView customerText = null;
    if (editing) {
      customerText = valueBlock(context, "Müşteri", firstNonEmpty(reservation.customerName, "Misafir"));
      form.addView(customerText);
    } else {
      customerSpinner = spinnerField(context, form, "Müşteri", customerLabels(data.customers));
    }

    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    EditText startDate = dateField(
        context,
        form,
        kind == Kind.ROOM ? "Giriş tarihi" : "Tarih",
        editing ? reservation.startDate : today
    );
    EditText endDate = null;
    EditText time = null;
    if (kind == Kind.ROOM) {
      String defaultEnd = editing ? reservation.endDate : tomorrowKey();
      endDate = dateField(context, form, "Çıkış tarihi", defaultEnd);
    } else {
      time = timeField(context, form, "Saat", editing ? reservation.time : "19:00");
    }

    EditText guestCount = numberField(
        context,
        form,
        "Kişi sayısı",
        String.valueOf(editing ? Math.max(1, reservation.guestCount) : 1)
    );

    List<String> resourceIds = new ArrayList<>();
    List<String> resourceLabels = new ArrayList<>();
    resourceIds.add("");
    resourceLabels.add(kind == Kind.ROOM ? "Odayı daha sonra ata" : "Masayı daha sonra ata");
    int selectedResourceIndex = 0;
    String selectedResourceId = editing
        ? first(kind == Kind.ROOM ? reservation.roomIds : reservation.tableIds)
        : "";
    if (kind == Kind.ROOM) {
      for (OperationData.RoomRecord room : data.rooms) {
        resourceIds.add(room.id);
        resourceLabels.add(room.name + " · " + Math.max(0, room.capacity) + " kişi · " + roomStatus(room.status));
        if (room.id.equals(selectedResourceId)) {
          selectedResourceIndex = resourceIds.size() - 1;
        }
      }
    } else {
      for (OperationData.TableRecord table : data.tables) {
        resourceIds.add(table.id);
        String area = table.area.isEmpty() ? "" : " · " + table.area;
        resourceLabels.add(table.name + area + " · " + Math.max(0, table.capacity) + " kişi · " + tableStatus(table.status));
        if (table.id.equals(selectedResourceId)) {
          selectedResourceIndex = resourceIds.size() - 1;
        }
      }
    }
    Spinner resourceSpinner = spinnerField(context, form, kind == Kind.ROOM ? "Oda" : "Masa", resourceLabels);
    resourceSpinner.setSelection(selectedResourceIndex);

    EditText notes = textArea(
        context,
        form,
        "Not",
        editing ? reservation.notes : "",
        "Örn. Telefonla alındı, geç giriş yapacak."
    );

    TextView status = new TextView(context);
    status.setTextSize(12);
    status.setPadding(0, dp(context, 8), 0, 0);
    form.addView(status);

    ScrollView scroll = new ScrollView(context);
    scroll.addView(form);

    AlertDialog dialog = new AlertDialog.Builder(context)
        .setTitle(editing ? "Rezervasyonu düzenle" : "Yeni rezervasyon")
        .setView(scroll)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton(editing ? "Kaydet" : "Oluştur", null)
        .create();

    Spinner finalCustomerSpinner = customerSpinner;
    EditText finalEndDate = endDate;
    EditText finalTime = time;
    dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
      int customerIndex = editing ? -1 : finalCustomerSpinner.getSelectedItemPosition();
      String customerId = editing
          ? reservation.customerId
          : itemId(data.customers, customerIndex);
      String start = startDate.getText().toString().trim();
      String end = finalEndDate == null ? start : finalEndDate.getText().toString().trim();
      String clock = finalTime == null ? "" : finalTime.getText().toString().trim();
      int guests = parsePositiveInt(guestCount.getText().toString());
      int resourceIndex = resourceSpinner.getSelectedItemPosition();
      String resourceId = resourceIndex >= 0 && resourceIndex < resourceIds.size() ? resourceIds.get(resourceIndex) : "";

      String validation = validate(kind, customerId, start, end, clock, guests);
      if (!validation.isEmpty()) {
        status.setText(validation);
        return;
      }

      JSONObject payload = new JSONObject();
      try {
        if (editing) {
          payload.put("reservation_id", reservation.id);
          payload.put("expected_updated_at", reservation.updatedAt);
        } else {
          payload.put("customer_id", customerId);
        }
        payload.put(kind == Kind.ROOM ? "room_id" : "table_id", resourceId);
        if (kind == Kind.ROOM) {
          payload.put("start_date", start);
          payload.put("end_date", end);
        } else {
          payload.put("date", start);
          payload.put("time", clock);
        }
        payload.put("guest_count", guests);
        payload.put("notes", notes.getText().toString().trim());
      } catch (Exception error) {
        status.setText("Rezervasyon bilgileri hazırlanamadı.");
        return;
      }
      dialog.dismiss();
      listener.onSave(payload);
    }));
    dialog.show();
  }

  private static String validate(Kind kind, String customerId, String start, String end, String time, int guests) {
    if (customerId == null || customerId.trim().isEmpty()) {
      return "Önce müşteri seçin.";
    }
    if (!start.matches("\\d{4}-\\d{2}-\\d{2}")) {
      return kind == Kind.ROOM ? "Geçerli giriş tarihi seçin." : "Geçerli rezervasyon tarihi seçin.";
    }
    if (kind == Kind.ROOM) {
      if (!end.matches("\\d{4}-\\d{2}-\\d{2}") || end.compareTo(start) <= 0) {
        return "Çıkış tarihi giriş tarihinden sonra olmalı.";
      }
    } else if (!time.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")) {
      return "Geçerli rezervasyon saati seçin.";
    }
    if (guests < 1 || guests > 99) {
      return "Kişi sayısı 1 ile 99 arasında olmalı.";
    }
    return "";
  }

  private static Spinner spinnerField(Context context, LinearLayout form, String label, List<String> values) {
    addLabel(context, form, label);
    Spinner spinner = new Spinner(context);
    ArrayAdapter<String> adapter = new ArrayAdapter<>(context, android.R.layout.simple_spinner_item, values);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    spinner.setAdapter(adapter);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(context, 48));
    params.setMargins(0, 0, 0, dp(context, 10));
    spinner.setLayoutParams(params);
    form.addView(spinner);
    return spinner;
  }

  private static EditText dateField(Context context, LinearLayout form, String label, String initial) {
    addLabel(context, form, label);
    EditText field = new EditText(context);
    field.setSingleLine(true);
    field.setText(initial == null ? "" : initial);
    field.setHint("YYYY-AA-GG");
    field.setFocusable(false);
    field.setClickable(true);
    field.setOnClickListener(view -> showDatePicker(context, field));
    addInput(context, form, field);
    return field;
  }

  private static EditText timeField(Context context, LinearLayout form, String label, String initial) {
    addLabel(context, form, label);
    EditText field = new EditText(context);
    field.setSingleLine(true);
    field.setText(initial == null ? "" : initial);
    field.setHint("SS:DD");
    field.setFocusable(false);
    field.setClickable(true);
    field.setOnClickListener(view -> showTimePicker(context, field));
    addInput(context, form, field);
    return field;
  }

  private static EditText numberField(Context context, LinearLayout form, String label, String initial) {
    addLabel(context, form, label);
    EditText field = new EditText(context);
    field.setSingleLine(true);
    field.setInputType(InputType.TYPE_CLASS_NUMBER);
    field.setText(initial);
    addInput(context, form, field);
    return field;
  }

  private static EditText textArea(Context context, LinearLayout form, String label, String initial, String hint) {
    addLabel(context, form, label);
    EditText field = new EditText(context);
    field.setMinLines(3);
    field.setMaxLines(6);
    field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    field.setText(initial == null ? "" : initial);
    field.setHint(hint);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, 0, 0, dp(context, 10));
    field.setLayoutParams(params);
    form.addView(field);
    return field;
  }

  private static void addInput(Context context, LinearLayout form, View field) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(context, 48));
    params.setMargins(0, 0, 0, dp(context, 10));
    field.setLayoutParams(params);
    form.addView(field);
  }

  private static void addLabel(Context context, LinearLayout form, String value) {
    TextView label = new TextView(context);
    label.setText(value);
    label.setTextSize(12);
    label.setPadding(0, dp(context, 4), 0, dp(context, 2));
    form.addView(label);
  }

  private static TextView valueBlock(Context context, String label, String value) {
    TextView text = new TextView(context);
    text.setText(label + "\n" + value);
    text.setTextSize(14);
    text.setPadding(0, dp(context, 4), 0, dp(context, 12));
    return text;
  }

  private static void showDatePicker(Context context, EditText target) {
    Calendar calendar = parseDate(target.getText().toString());
    new DatePickerDialog(
        context,
        (view, year, month, day) -> target.setText(String.format(Locale.US, "%04d-%02d-%02d", year, month + 1, day)),
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH),
        calendar.get(Calendar.DAY_OF_MONTH)
    ).show();
  }

  private static void showTimePicker(Context context, EditText target) {
    int[] parts = parseTime(target.getText().toString());
    new TimePickerDialog(
        context,
        (view, hour, minute) -> target.setText(String.format(Locale.US, "%02d:%02d", hour, minute)),
        parts[0],
        parts[1],
        true
    ).show();
  }

  private static Calendar parseDate(String raw) {
    Calendar calendar = Calendar.getInstance();
    try {
      Date parsed = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(raw == null ? "" : raw.trim());
      if (parsed != null) {
        calendar.setTime(parsed);
      }
    } catch (Exception ignored) {
      // Bugünün tarihiyle aç.
    }
    return calendar;
  }

  private static int[] parseTime(String raw) {
    String[] parts = raw == null ? new String[0] : raw.trim().split(":", 2);
    if (parts.length == 2) {
      try {
        int hour = Integer.parseInt(parts[0]);
        int minute = Integer.parseInt(parts[1]);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          return new int[] {hour, minute};
        }
      } catch (NumberFormatException ignored) {
        // Varsayılan saate düş.
      }
    }
    return new int[] {19, 0};
  }

  private static String tomorrowKey() {
    Calendar calendar = Calendar.getInstance();
    calendar.add(Calendar.DAY_OF_MONTH, 1);
    return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.getTime());
  }

  private static List<String> customerLabels(List<OperationData.CustomerRecord> customers) {
    ArrayList<String> labels = new ArrayList<>();
    if (customers.isEmpty()) {
      labels.add("Müşteri kaydı yok");
      return labels;
    }
    for (OperationData.CustomerRecord customer : customers) {
      labels.add(customer.fullName + (customer.phone.isEmpty() ? "" : " · " + customer.phone));
    }
    return labels;
  }

  private static String itemId(List<OperationData.CustomerRecord> customers, int index) {
    return index >= 0 && index < customers.size() ? customers.get(index).id : "";
  }

  private static String first(List<String> values) {
    return values == null || values.isEmpty() ? "" : values.get(0);
  }

  private static String firstNonEmpty(String value, String fallback) {
    return value == null || value.trim().isEmpty() ? fallback : value.trim();
  }

  private static int parsePositiveInt(String raw) {
    try {
      return Integer.parseInt(raw == null ? "" : raw.trim());
    } catch (NumberFormatException error) {
      return 0;
    }
  }

  private static String roomStatus(String status) {
    if ("available".equals(status)) return "Boş";
    if ("reserved".equals(status)) return "Rezerve";
    if ("occupied".equals(status)) return "Dolu";
    if ("cleaning".equals(status)) return "Temizlik";
    if ("maintenance".equals(status)) return "Bakım";
    return status == null || status.isEmpty() ? "Durum yok" : status;
  }

  private static String tableStatus(String status) {
    if ("available".equals(status)) return "Boş";
    if ("reserved".equals(status)) return "Rezerve";
    if ("occupied".equals(status)) return "Dolu";
    if ("bill_waiting".equals(status) || "payment".equals(status)) return "Hesap bekliyor";
    if ("maintenance".equals(status)) return "Bakım";
    return status == null || status.isEmpty() ? "Durum yok" : status;
  }

  private static int dp(Context context, int value) {
    return Math.round(value * context.getResources().getDisplayMetrics().density);
  }
}

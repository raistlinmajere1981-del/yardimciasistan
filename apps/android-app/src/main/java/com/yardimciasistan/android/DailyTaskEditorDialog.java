package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.Context;
import android.text.InputType;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

final class DailyTaskEditorDialog {
  enum Kind {
    PENSION,
    RESTAURANT
  }

  interface Listener {
    void onSave(JSONObject payload);
    void onDelete();
  }

  private DailyTaskEditorDialog() {}

  static void show(
      Context context,
      Kind kind,
      OperationData.TaskRecord existing,
      boolean canDelete,
      AndroidVoiceController voice,
      Listener listener
  ) {
    boolean editing = existing != null;
    LinearLayout form = UiKit.column(context);
    int padding = dp(context, 16);
    form.setPadding(padding, padding, padding, padding);

    TextView area = UiKit.eyebrow(context,
        kind == Kind.PENSION ? "PANSİYON · GÜNLÜK İŞ" : "RESTORAN · GÜNLÜK İŞ");
    area.setPadding(0, 0, 0, dp(context, 10));
    form.addView(area);

    EditText title = input(context, form, "Başlık", editing ? existing.title : "");
    title.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);

    EditText description = textArea(
        context,
        form,
        "Not",
        editing ? existing.description : "",
        "İş için kısa açıklama (isteğe bağlı)"
    );
    // Keep the microphone next to the note it edits, not below the date/time fields.
    LinearLayout noteVoiceControls = new LinearLayout(context);
    noteVoiceControls.setOrientation(LinearLayout.VERTICAL);
    form.addView(noteVoiceControls);

    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    CheckBox useDate = new CheckBox(context);
    useDate.setText("Tarih ekle");
    useDate.setChecked(!editing || !existing.dueDate.isEmpty());
    form.addView(useDate);
    EditText dueDate = pickerField(
        context,
        form,
        "Tarih",
        editing && !existing.dueDate.isEmpty() ? existing.dueDate : today
    );
    dueDate.setEnabled(useDate.isChecked());
    useDate.setOnCheckedChangeListener((button, checked) -> dueDate.setEnabled(checked));
    dueDate.setOnClickListener(view -> NativeDateTimePicker.showDate(context, dueDate, null, false));

    CheckBox useTime = new CheckBox(context);
    useTime.setText("Saat ekle");
    useTime.setChecked(editing && !existing.dueTime.isEmpty());
    form.addView(useTime);
    EditText dueTime = pickerField(
        context,
        form,
        "Saat",
        editing && !existing.dueTime.isEmpty() ? existing.dueTime : "09:00"
    );
    dueTime.setEnabled(useTime.isChecked());
    useTime.setOnCheckedChangeListener((button, checked) -> dueTime.setEnabled(checked));
    dueTime.setOnClickListener(view -> NativeDateTimePicker.showTime(context, dueTime));

    TextView status = UiKit.text(context, "", 12, UiKit.DANGER, android.graphics.Typeface.BOLD);
    status.setPadding(0, dp(context, 8), 0, 0);
    form.addView(status);

    ScrollView scroll = new ScrollView(context);
    scroll.addView(form);

    AlertDialog.Builder builder = new AlertDialog.Builder(context)
        .setTitle(editing ? "Günlük işi düzenle" : "Yeni günlük iş")
        .setView(scroll)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton(editing ? "Kaydet" : "Ekle", null);
    if (editing && canDelete) {
      builder.setNeutralButton("Sil", null);
    }
    AlertDialog dialog = builder.create();
    voice.addDictation(dialog, noteVoiceControls, description, 1000,
        () -> voice.hasPermission(editing ? "daily_task.update" : "daily_task.create"));
    voice.bindDialog(dialog);
    dialog.setOnShowListener(ignored -> {
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
        String normalizedTitle = title.getText().toString().trim().replaceAll("\\s+", " ");
        String normalizedDescription = description.getText().toString().trim();
        String date = useDate.isChecked() ? dueDate.getText().toString().trim() : "";
        String time = useTime.isChecked() ? dueTime.getText().toString().trim() : "";
        String validation = validate(normalizedTitle, normalizedDescription, date, time);
        if (!validation.isEmpty()) {
          status.setText(validation);
          return;
        }

        JSONObject payload = new JSONObject();
        try {
          if (editing) {
            payload.put("task_id", existing.id);
            payload.put("expected_updated_at", existing.updatedAt);
          }
          payload.put("task_type", taskType(kind));
          payload.put("title", normalizedTitle);
          payload.put("description", normalizedDescription);
          payload.put("due_date", date);
          payload.put("due_time", time);
        } catch (Exception error) {
          status.setText("Günlük iş bilgileri hazırlanamadı.");
          return;
        }
        dialog.dismiss();
        listener.onSave(payload);
      });
      if (editing && canDelete) {
        // Two-step confirmation in the same surface; no nested Android dialog.
        final boolean[] deleteArmed = {false};
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(view -> {
          if (!deleteArmed[0]) {
            deleteArmed[0] = true;
            status.setText("Bu günlük işi silmek için 'Silmeyi Onayla' seçin.");
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setText("Silmeyi Onayla");
            return;
          }
          dialog.dismiss();
          listener.onDelete();
        });
      }
    });
    dialog.show();
  }

  static String validate(String title, String description, String dueDate, String dueTime) {
    String normalizedTitle = title == null ? "" : title.trim();
    String normalizedDescription = description == null ? "" : description.trim();
    String normalizedDate = dueDate == null ? "" : dueDate.trim();
    String normalizedTime = dueTime == null ? "" : dueTime.trim();
    if (normalizedTitle.isEmpty()) {
      return "Başlık boş olamaz.";
    }
    if (normalizedTitle.length() > 160) {
      return "Başlık en fazla 160 karakter olabilir.";
    }
    if (normalizedDescription.length() > 1000) {
      return "Not en fazla 1000 karakter olabilir.";
    }
    if (!normalizedDate.isEmpty() && !validDate(normalizedDate)) {
      return "Geçerli tarih seçin.";
    }
    if (!normalizedTime.isEmpty() && !normalizedTime.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")) {
      return "Geçerli saat seçin.";
    }
    return "";
  }

  static String taskType(Kind kind) {
    return kind == Kind.RESTAURANT ? "manual_restaurant" : "manual_pension";
  }

  private static EditText input(Context context, LinearLayout form, String label, String initial) {
    addLabel(context, form, label);
    EditText field = UiKit.input(context, label);
    field.setSingleLine(true);
    field.setText(initial == null ? "" : initial);
    addField(context, form, field, 48);
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

  private static EditText pickerField(Context context, LinearLayout form, String label, String initial) {
    addLabel(context, form, label);
    EditText field = UiKit.input(context, label);
    field.setSingleLine(true);
    field.setFocusable(false);
    field.setClickable(true);
    field.setText(initial == null ? "" : initial);
    addField(context, form, field, 48);
    return field;
  }

  private static void addField(Context context, LinearLayout form, EditText field, int height) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(context, height));
    params.setMargins(0, 0, 0, dp(context, 10));
    field.setLayoutParams(params);
    form.addView(field);
  }

  private static void addLabel(Context context, LinearLayout form, String value) {
    TextView label = UiKit.text(context, value, 12,
        UiKit.SECONDARY, android.graphics.Typeface.BOLD);
    label.setPadding(0, dp(context, 7), 0, dp(context, 4));
    form.addView(label);
  }

  private static boolean validDate(String value) {
    if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
    try {
      SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
      format.setLenient(false);
      return format.parse(value) != null;
    } catch (Exception error) {
      return false;
    }
  }

  private static int dp(Context context, int value) {
    return Math.round(value * context.getResources().getDisplayMetrics().density);
  }
}

package com.yardimciasistan.android;

import android.app.Dialog;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Locale;

final class CustomerFormDialog {
  interface Listener {
    void onIdentityImageRequested();
    void onSubmit(String actionType, JSONObject payload, String successMessage);
    void onDismiss(CustomerFormDialog dialog);
  }

  private final ComponentActivity activity;
  private final OperationData.CustomerRecord existing;
  private final boolean aiEnabled;
  private final Listener listener;
  private final Dialog dialog;

  private EditText fullName;
  private EditText phone;
  private EditText email;
  private EditText tags;
  private EditText notes;
  private Spinner identityType;
  private EditText identityNumber;
  private EditText nationality;
  private EditText birthDate;
  private Spinner gender;
  private EditText documentSerialNumber;
  private EditText documentExpiryDate;
  private EditText birthPlace;
  private EditText motherName;
  private EditText fatherName;
  private EditText issuingAuthority;
  private EditText address;
  private TextView status;
  private Button imageButton;
  private Button saveButton;

  CustomerFormDialog(
      ComponentActivity activity,
      OperationData.CustomerRecord existing,
      boolean aiEnabled,
      Listener listener
  ) {
    this.activity = activity;
    this.existing = existing;
    this.aiEnabled = aiEnabled;
    this.listener = listener;
    this.dialog = new Dialog(activity);
    build();
  }

  void show() {
    dialog.show();
  }

  Dialog dialog() {
    return dialog;
  }

  boolean isShowing() {
    return dialog.isShowing();
  }

  void setLoading(boolean loading) {
    if (imageButton != null) {
      imageButton.setEnabled(!loading);
      imageButton.setText(loading ? "Kimlik okunuyor…" : "Kimlik Görselinden AI ile Doldur");
    }
    if (saveButton != null) {
      saveButton.setEnabled(!loading);
    }
  }

  void setStatus(String message, int tone) {
    if (status == null) return;
    status.setText(message == null ? "" : message);
    status.setTextColor(tone);
    status.setVisibility(message == null || message.trim().isEmpty() ? View.GONE : View.VISIBLE);
  }

  void applyIdentityAnalysis(JSONObject analysis) {
    JSONObject fields = analysis == null ? null : analysis.optJSONObject("fields");
    if (fields == null) return;

    fillIfPresent(fullName, fields.optString("full_name", ""));
    fillIfPresent(identityNumber, fields.optString("identity_number", ""));
    fillIfPresent(nationality, fields.optString("nationality", ""));
    fillIfPresent(birthDate, fields.optString("birth_date", ""));
    fillIfPresent(documentSerialNumber, fields.optString("document_serial_number", ""));
    fillIfPresent(documentExpiryDate, fields.optString("document_expiry_date", ""));
    fillIfPresent(birthPlace, fields.optString("birth_place", ""));
    fillIfPresent(motherName, fields.optString("mother_name", ""));
    fillIfPresent(fatherName, fields.optString("father_name", ""));
    fillIfPresent(issuingAuthority, fields.optString("issuing_authority", ""));
    fillIfPresent(address, fields.optString("address", ""));
    selectSpinnerValue(identityType, fields.optString("identity_type", ""));
    selectSpinnerValue(gender, fields.optString("gender", ""));
  }

  private void build() {
    LinearLayout shell = UiKit.column(activity);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(activity, 16), UiKit.dp(activity, 14), UiKit.dp(activity, 16), UiKit.dp(activity, 20));

    LinearLayout header = UiKit.row(activity);
    LinearLayout heading = UiKit.column(activity);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(activity, existing == null ? "YENİ MÜŞTERİ" : "MÜŞTERİ KARTI"));
    heading.addView(UiKit.title(activity, existing == null ? "Müşteri oluştur" : existing.fullName));
    header.addView(heading);
    Button close = UiKit.iconButton(activity, "×", "Müşteri formunu kapat", false, view -> dialog.dismiss());
    header.addView(close, new LinearLayout.LayoutParams(UiKit.dp(activity, 44), UiKit.dp(activity, 44)));
    shell.addView(header);

    LinearLayout form = UiKit.column(activity);
    if (aiEnabled) {
      form.addView(UiKit.text(
          activity,
          "Kimlik görseli yalnız alanları önermek için işlenir; görsel müşteri kartında saklanmaz.",
          12,
          UiKit.MUTED,
          Typeface.NORMAL
      ));
    }

    fullName = addInput(form, "Ad soyad *", "Örn. Ayşe Yılmaz", value("fullName"), false);
    fullName.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
    phone = addInput(form, "Telefon", "+90 5xx… / +44…", value("phone"), false);
    phone.setInputType(InputType.TYPE_CLASS_PHONE);
    email = addInput(form, "E-posta", "ornek@eposta.com", value("email"), false);
    email.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
    tags = addInput(form, "Etiketler", "VIP, kurumsal, düzenli misafir",
        existing == null ? "" : String.join(", ", existing.tags), false);
    notes = addInput(form, "Müşteri notları", "Tercihler ve işletme notları", value("notes"), true);

    form.addView(sectionLabel("Kimlik kartı / pasaport"));
    identityType = addChoiceSpinner(
        form,
        "Belge türü",
        new ChoiceItem[] {
            new ChoiceItem("", "Belirtilmedi"),
            new ChoiceItem("tc_identity_card", "T.C. kimlik kartı"),
            new ChoiceItem("passport", "Pasaport"),
            new ChoiceItem("other", "Diğer kimlik belgesi")
        },
        value("identityType")
    );
    identityNumber = addInput(form, "Kimlik / pasaport no", "Belge numarası", value("identityNumber"), false);
    nationality = addInput(form, "Uyruk", "Örn. T.C.", value("nationality"), false);
    birthDate = addInput(form, "Doğum tarihi", "YYYY-AA-GG", value("birthDate"), false);
    birthDate.setFocusable(false);
    birthDate.setClickable(true);
    birthDate.setOnClickListener(view -> NativeDateTimePicker.showDate(activity, birthDate, null, true));
    gender = addChoiceSpinner(
        form,
        "Cinsiyet",
        new ChoiceItem[] {
            new ChoiceItem("", "Belirtilmedi"),
            new ChoiceItem("female", "Kadın"),
            new ChoiceItem("male", "Erkek"),
            new ChoiceItem("unspecified", "Belirtmek istemiyor")
        },
        value("gender")
    );
    documentSerialNumber = addInput(form, "Belge seri no", "Seri numarası", value("documentSerialNumber"), false);
    documentExpiryDate = addInput(form, "Son geçerlilik tarihi", "YYYY-AA-GG", value("documentExpiryDate"), false);
    documentExpiryDate.setFocusable(false);
    documentExpiryDate.setClickable(true);
    documentExpiryDate.setOnClickListener(view -> NativeDateTimePicker.showDate(activity, documentExpiryDate, null, true));
    birthPlace = addInput(form, "Doğum yeri", "Şehir / ülke", value("birthPlace"), false);
    motherName = addInput(form, "Anne adı", "Kimlikte yer alıyorsa", value("motherName"), false);
    fatherName = addInput(form, "Baba adı", "Kimlikte yer alıyorsa", value("fatherName"), false);
    issuingAuthority = addInput(form, "Düzenleyen makam", "Belgeyi düzenleyen makam", value("issuingAuthority"), false);
    address = addInput(form, "Adres", "Kimlikte yer alıyorsa", value("address"), true);

    if (aiEnabled) {
      imageButton = UiKit.outlineButton(activity, "Kimlik Görselinden AI ile Doldur", view -> listener.onIdentityImageRequested());
      LinearLayout.LayoutParams imageParams = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 48));
      imageParams.setMargins(0, UiKit.dp(activity, 12), 0, 0);
      imageButton.setLayoutParams(imageParams);
      form.addView(imageButton);
    }

    status = UiKit.text(activity, "", 12, UiKit.MUTED, Typeface.BOLD);
    LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, -2);
    statusParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    status.setLayoutParams(statusParams);
    status.setVisibility(View.GONE);
    form.addView(status);

    saveButton = UiKit.button(activity, existing == null ? "Müşteriyi Oluştur" : "Değişiklikleri Kaydet", UiKit.PRIMARY, view -> submit());
    LinearLayout.LayoutParams saveParams = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 50));
    saveParams.setMargins(0, UiKit.dp(activity, 12), 0, UiKit.dp(activity, 20));
    saveButton.setLayoutParams(saveParams);
    form.addView(saveButton);

    ScrollView scroll = UiKit.scroll(activity, form);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);
    dialog.setContentView(shell);
    dialog.setOnDismissListener(value -> listener.onDismiss(this));
  }

  private void submit() {
    String normalizedName = textValue(fullName);
    if (normalizedName.length() < 2) {
      setStatus("Müşteri adı en az 2 karakter olmalı.", UiKit.DANGER);
      fullName.requestFocus();
      return;
    }

    JSONObject payload = new JSONObject();
    try {
      payload.put("full_name", normalizedName);
      payload.put("phone", textValue(phone));
      payload.put("email", textValue(email));
      payload.put("notes", textValue(notes));
      payload.put("tags", parseTags(textValue(tags)));
      payload.put("identity_type", selectedChoiceValue(identityType));
      payload.put("identity_number", textValue(identityNumber));
      payload.put("nationality", textValue(nationality));
      payload.put("birth_date", textValue(birthDate));
      payload.put("gender", selectedChoiceValue(gender));
      payload.put("document_serial_number", textValue(documentSerialNumber));
      payload.put("document_expiry_date", textValue(documentExpiryDate));
      payload.put("birth_place", textValue(birthPlace));
      payload.put("mother_name", textValue(motherName));
      payload.put("father_name", textValue(fatherName));
      payload.put("issuing_authority", textValue(issuingAuthority));
      payload.put("address", textValue(address));
      if (existing != null) {
        // Existing document numbers are Desktop-only. Empty mobile fields preserve them.
        if (textValue(identityNumber).isEmpty()) payload.remove("identity_number");
        if (textValue(documentSerialNumber).isEmpty()) payload.remove("document_serial_number");
        payload.put("customer_id", existing.id);
        payload.put("expected_updated_at", existing.updatedAt);
      }
    } catch (Exception ignored) {
      setStatus("Müşteri güncelleme isteği hazırlanamadı.", UiKit.DANGER);
      return;
    }

    dialog.dismiss();
    listener.onSubmit(
        existing == null ? "customer_create" : "customer_update",
        payload,
        existing == null
            ? "Müşteri kartı oluşturulmak üzere gönderildi."
            : "Müşteri kartı güncellenmek üzere gönderildi."
    );
  }

  private EditText addInput(
      LinearLayout form,
      String label,
      String hint,
      String initialValue,
      boolean multiline
  ) {
    TextView fieldLabel = UiKit.text(activity, label, 11, UiKit.MUTED, Typeface.BOLD);
    LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(-1, -2);
    labelParams.setMargins(0, UiKit.dp(activity, 10), 0, UiKit.dp(activity, 4));
    fieldLabel.setLayoutParams(labelParams);
    form.addView(fieldLabel);

    EditText input = UiKit.input(activity, hint);
    if (multiline) {
      input.setSingleLine(false);
      input.setMinLines(3);
      input.setGravity(Gravity.TOP);
      input.setPadding(UiKit.dp(activity, 12), UiKit.dp(activity, 10), UiKit.dp(activity, 12), UiKit.dp(activity, 10));
      input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    }
    input.setText(initialValue == null ? "" : initialValue);
    input.setLayoutParams(new LinearLayout.LayoutParams(-1, multiline ? UiKit.dp(activity, 94) : UiKit.dp(activity, 50)));
    form.addView(input);
    return input;
  }

  private Spinner addChoiceSpinner(
      LinearLayout form,
      String label,
      ChoiceItem[] choices,
      String selectedValue
  ) {
    TextView fieldLabel = UiKit.text(activity, label, 11, UiKit.MUTED, Typeface.BOLD);
    LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(-1, -2);
    labelParams.setMargins(0, UiKit.dp(activity, 10), 0, UiKit.dp(activity, 4));
    fieldLabel.setLayoutParams(labelParams);
    form.addView(fieldLabel);

    Spinner spinner = new Spinner(activity);
    ArrayAdapter<ChoiceItem> adapter = new ArrayAdapter<>(activity, android.R.layout.simple_spinner_item, choices);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    spinner.setAdapter(adapter);
    spinner.setBackground(UiKit.rounded(activity, UiKit.SURFACE, UiKit.BORDER, 11));
    spinner.setPadding(UiKit.dp(activity, 8), 0, UiKit.dp(activity, 8), 0);
    spinner.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 50)));
    selectSpinnerValue(spinner, selectedValue);
    form.addView(spinner);
    return spinner;
  }

  private View sectionLabel(String value) {
    TextView label = UiKit.text(activity, value, 16, UiKit.TEXT, Typeface.BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(activity, 7), 0, UiKit.dp(activity, 7));
    label.setLayoutParams(params);
    return label;
  }

  private String value(String field) {
    if (existing == null) return "";
    switch (field) {
      case "fullName": return existing.fullName;
      case "phone": return existing.phone;
      case "email": return existing.email;
      case "notes": return existing.notes;
      case "identityType": return existing.identityType;
      case "identityNumber": return existing.identityNumber;
      case "nationality": return existing.nationality;
      case "birthDate": return existing.birthDate;
      case "gender": return existing.gender;
      case "documentSerialNumber": return existing.documentSerialNumber;
      case "documentExpiryDate": return existing.documentExpiryDate;
      case "birthPlace": return existing.birthPlace;
      case "motherName": return existing.motherName;
      case "fatherName": return existing.fatherName;
      case "issuingAuthority": return existing.issuingAuthority;
      case "address": return existing.address;
      default: return "";
    }
  }

  private static String textValue(EditText input) {
    return input == null ? "" : input.getText().toString().trim();
  }

  private static String selectedChoiceValue(Spinner spinner) {
    Object selected = spinner == null ? null : spinner.getSelectedItem();
    return selected instanceof ChoiceItem ? ((ChoiceItem) selected).value : "";
  }

  private static JSONArray parseTags(String source) {
    JSONArray result = new JSONArray();
    if (source == null || source.trim().isEmpty()) return result;
    HashSet<String> seen = new HashSet<>();
    for (String raw : source.split("[,;\\n]")) {
      String tag = raw.trim();
      String key = tag.toLowerCase(new Locale("tr", "TR"));
      if (!tag.isEmpty() && tag.length() <= 40 && seen.add(key) && result.length() < 20) {
        result.put(tag);
      }
    }
    return result;
  }

  private static void fillIfPresent(EditText field, String value) {
    String normalized = value == null ? "" : value.trim();
    if (!normalized.isEmpty()) field.setText(normalized);
  }

  private static void selectSpinnerValue(Spinner spinner, String value) {
    if (value == null || value.trim().isEmpty() || spinner.getAdapter() == null) return;
    for (int index = 0; index < spinner.getAdapter().getCount(); index += 1) {
      Object item = spinner.getAdapter().getItem(index);
      if (item instanceof ChoiceItem && value.equals(((ChoiceItem) item).value)) {
        spinner.setSelection(index);
        return;
      }
    }
  }

  private static final class ChoiceItem {
    final String value;
    final String label;

    ChoiceItem(String value, String label) {
      this.value = value == null ? "" : value;
      this.label = label == null ? "" : label;
    }

    @Override
    public String toString() {
      return label;
    }
  }
}

package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import java.text.NumberFormat;
import java.util.Locale;

/** Market form presentation only; no drafts, snapshot or mutation state. */
final class MarketFormUi {
  private final Context context;
  private final Runnable back;
  MarketFormUi(Context context, Runnable back) { this.context = context; this.back = back; }
  void addMetric(LinearLayout card, int index, String label, String value, int tone) {
    if (index > 0) card.addView(UiKit.divider(context));
    LinearLayout row = UiKit.row(context);
    TextView caption = UiKit.text(context, label, 13, UiKit.SECONDARY, Typeface.NORMAL);
    row.addView(caption, new LinearLayout.LayoutParams(0, -2, 1f));
    row.addView(UiKit.text(context, value, 14, tone, Typeface.BOLD));
    card.addView(row);
  }

  EditText labeledMultiline(LinearLayout form, String label, String hint) {
    EditText input = UiKit.labeledInput(context, form, label, hint);
    input.setSingleLine(false);
    input.setGravity(Gravity.TOP | Gravity.START);
    input.setPadding(dp(12), dp(11), dp(12), dp(11));
    input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    input.setMinHeight(dp(82));
    return input;
  }

  void bind(EditText input, String initial, ValueListener listener) {
    input.setText(initial == null ? "" : initial);
    input.addTextChangedListener(watcher(listener));
  }

  TextWatcher watcher(ValueListener listener) {
    return new TextWatcher() {
      @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence value, int start, int before, int count) {
        listener.onValue(value == null ? "" : value.toString());
      }
      @Override public void afterTextChanged(Editable value) {}
    };
  }

  LinearLayout dialogForm() {
    LinearLayout form = UiKit.column(context);
    form.setPadding(dp(16), dp(10), dp(16), dp(8));
    return form;
  }

  ScrollView wrapDialog(View content) {
    ScrollView scroll = new ScrollView(context);
    scroll.addView(content);
    return scroll;
  }

  TextView statusText() {
    TextView status = UiKit.text(context, "", 12, UiKit.DANGER, Typeface.BOLD);
    status.setPadding(0, dp(5), 0, 0);
    return status;
  }

  LinearLayout.LayoutParams fieldParams(int height) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(height));
    params.setMargins(0, 0, 0, dp(9));
    return params;
  }

  void sizeButton(Button button, int minimumHeight, int top, int bottom) {
    button.setMinHeight(dp(minimumHeight));
    button.setMinimumHeight(dp(minimumHeight));
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, dp(top), 0, dp(bottom));
    button.setLayoutParams(params);
  }

  String money(double value, String currency) {
    NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("tr", "TR"));
    try {
      format.setCurrency(java.util.Currency.getInstance(
          currency == null || currency.trim().isEmpty() ? "TRY" : currency.trim().toUpperCase(Locale.ROOT)
      ));
    } catch (IllegalArgumentException ignored) {
      // Snapshot currency is already sanitized; keep the locale default as a safe fallback.
    }
    return format.format(Math.max(0, value));
  }

  String quantity(double value) {
    if (value == Math.rint(value)) return String.valueOf((long) value);
    return String.format(Locale.US, "%.4f", value).replaceAll("0+$", "").replaceAll("\\.$", "").replace('.', ',');
  }

  String unitLabel(String unit) {
    if ("kg".equals(unit)) return "kg";
    if ("g".equals(unit)) return "g";
    if ("l".equals(unit)) return "l";
    if ("ml".equals(unit)) return "ml";
    if ("pack".equals(unit)) return "paket";
    if ("box".equals(unit)) return "kutu";
    if ("meter".equals(unit)) return "metre";
    if ("other".equals(unit)) return "birim";
    return "adet";
  }

  String shortTime(String raw) {
    String value = raw == null ? "" : raw.trim().replace('T', ' ');
    return value.length() > 16 ? value.substring(0, 16) : value;
  }

  String value(EditText input) {
    return input == null || input.getText() == null ? "" : input.getText().toString().trim();
  }

  int dp(int value) {
    return UiKit.dp(context, value);
  }

  void addChoicePicker(LinearLayout page, String label, String[] labels, int selected, PositionListener changed) {
    UiKit.fieldLabel(context, page, label); Spinner picker = new Spinner(context);
    ArrayAdapter<String> adapter = new ArrayAdapter<>(context, android.R.layout.simple_spinner_item, labels);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item); picker.setAdapter(adapter); picker.setSelection(selected);
    picker.setContentDescription(label); picker.setLayoutParams(fieldParams(50));
    picker.setOnItemSelectedListener(new SimpleItemSelectedListener(changed)); page.addView(picker);
  }

  void addPaymentPicker(LinearLayout page, String selectedMethod, String[] methods, ValueListener changed) {
    String[] labels = new String[methods.length]; int selected = 0;
    for (int i = 0; i < methods.length; i++) { labels[i] = paymentLabel(methods[i]); if (methods[i].equals(selectedMethod)) selected = i; }
    addChoicePicker(page, "Ödeme türü", labels, selected, position -> changed.onValue(methods[position]));
  }

  String paymentLabel(String method) {
    if ("card".equals(method)) return "Kart (harici POS)";
    if ("bank".equals(method)) return "Havale";
    if ("other".equals(method)) return "Diğer";
    if ("credit".equals(method)) return "Veresiye";
    return "Nakit";
  }

  void addExternalConfirmation(LinearLayout page, boolean checked, CheckedListener changed) {
    CheckBox confirmation = new CheckBox(context); confirmation.setText(R.string.external_pos_confirmation);
    confirmation.setTextSize(16); confirmation.setMinHeight(dp(48)); confirmation.setChecked(checked);
    confirmation.setOnCheckedChangeListener((button, value) -> changed.onChecked(value)); page.addView(confirmation);
  }

  ImageView productImageView(Bitmap bitmap, int heightDp) {
    ImageView image = new ImageView(context);
    image.setImageBitmap(bitmap);
    image.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
    image.setAdjustViewBounds(false);
    image.setPadding(dp(14), dp(12), dp(14), dp(12));
    image.setBackground(UiKit.rounded(context, UiKit.SURFACE_ALT, UiKit.BORDER, 12));
    image.setMinimumHeight(dp(heightDp));
    return image;
  }

  View messageCard(String message, boolean pending) {
    LinearLayout card = UiKit.card(context);
    int tone = pending ? UiKit.WARNING : UiKit.SUCCESS;
    card.setBackground(UiKit.rounded(context, UiKit.withAlpha(tone, 25), UiKit.withAlpha(tone, 100), 14));
    card.addView(UiKit.text(context, message, 13, tone, Typeface.BOLD));
    return card;
  }

  void addBackHeader(LinearLayout page, String title, String subtitle) {
    Button back = UiKit.outlineButton(context, "← Satış", view -> this.back.run());
    back.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
    LinearLayout.LayoutParams backParams = new LinearLayout.LayoutParams(-1, dp(44));
    backParams.setMargins(0, 0, 0, dp(10));
    back.setLayoutParams(backParams);
    page.addView(back);
    page.addView(UiKit.workspaceHeader(context, title, subtitle, null));
  }

  interface ValueListener { void onValue(String value); }
  interface PositionListener { void onSelected(int position); }
  interface CheckedListener { void onChecked(boolean checked); }
  static final class SimpleItemSelectedListener implements android.widget.AdapterView.OnItemSelectedListener {
    private final PositionListener listener;

    SimpleItemSelectedListener(PositionListener listener) {
      this.listener = listener;
    }

    @Override
    public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
      listener.onSelected(position);
    }

    @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
  }

  void confirmFinancial(String title, String detail, java.util.function.BooleanSupplier blocked, Runnable submit) {
    new AlertDialog.Builder(context).setTitle(title).setMessage(detail + "\n\nMasaüstü fiyat, stok ve yetkiyi doğrulamadan kayıt tamamlanmaz.")
        .setNegativeButton("Vazgeç", null).setPositiveButton("Onayla", (dialog, which) -> { if (!blocked.getAsBoolean()) submit.run(); }).show();
  }
}

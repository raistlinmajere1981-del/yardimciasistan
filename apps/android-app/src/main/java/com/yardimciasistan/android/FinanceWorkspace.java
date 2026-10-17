package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class FinanceWorkspace {
  interface Listener {
    void onCreate(JSONObject payload);
  }

  private FinanceWorkspace() {}

  static ScrollView create(Context context, OperationData data, Listener listener) {
    LinearLayout page = UiKit.column(context);
    OperationData.FinanceSnapshot finance = data.finance == null
        ? new OperationData.FinanceSnapshot()
        : data.finance;

    LinearLayout header = UiKit.row(context);
    TextView title = UiKit.title(context, "Kasa");
    header.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));
    if (data.hasPermission("finance.create")) {
      Button add = UiKit.iconButton(context, "+", "Kasa hareketi ekle", false,
          view -> showCreateDialog(context, data, listener));
      header.addView(add, new LinearLayout.LayoutParams(dp(context, 48), dp(context, 48)));
    }
    LinearLayout.LayoutParams headingParams = new LinearLayout.LayoutParams(-1, -2);
    headingParams.setMargins(0, 0, 0, dp(context, 12));
    page.addView(header, headingParams);

    ArrayList<View> summary = new ArrayList<>();
    summary.add(UiKit.metricCard(context, "Gelir", money(finance.todayIncomeMinor), UiKit.SUCCESS, null));
    summary.add(UiKit.metricCard(context, "Gider", money(finance.todayExpenseMinor), UiKit.DANGER, null));
    summary.add(UiKit.metricCard(context, "Net", signedMoney(finance.todayNetMinor),
        finance.todayNetMinor >= 0 ? UiKit.SUCCESS : UiKit.DANGER, null));
    if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_FOLIO)) {
      summary.add(UiKit.metricCard(context, "Bekleyen oda alacağı",
          money(finance.outstandingPensionMinor), UiKit.WARNING, null));
    }
    page.addView(UiKit.metricGrid(context, summary));

    page.addView(UiKit.sectionTitle(context, "Son hareketler"));
    if (finance.recentEntries.isEmpty()) {
      LinearLayout empty = UiKit.card(context);
      empty.addView(UiKit.text(context, "Kasa hareketi yok", 14, UiKit.TEXT, Typeface.BOLD));
      empty.addView(UiKit.text(context, "Gelir ve gider kayıtları burada kısa liste halinde görünür.", 12, UiKit.MUTED, Typeface.NORMAL));
      page.addView(empty);
    } else {
      NativeSearchList search = new NativeSearchList(context, "Hareket ara");
      LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, -2);
      searchParams.setMargins(0, 0, 0, dp(context, 10));
      page.addView(search.input(), searchParams);
      int shown = 0;
      for (OperationData.FinanceEntry entry : finance.recentEntries) {
        if (shown >= 20) break;
        View row = entryCard(context, entry);
        page.addView(row);
        search.add(row, entry.description + " " + entry.category + " " + entry.paymentMethod
            + " " + entry.occurredAt + " " + (entry.isIncome() ? "Gelir" : "Gider"));
        shown += 1;
      }
      TextView noMatches = UiKit.text(context, "Aramayla eşleşen kasa hareketi yok.",
          13, UiKit.MUTED, Typeface.NORMAL);
      page.addView(noMatches);
      search.setNoMatchesNotice(noMatches);
    }

    TextView note = UiKit.text(
        context,
        "Ayrıntılı raporlar ve kayıt düzeltmeleri masaüstü Kasa ekranında yapılır.",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    );
    page.addView(note);
    return UiKit.scroll(context, page);
  }

  private static LinearLayout entryCard(Context context, OperationData.FinanceEntry entry) {
    LinearLayout card = UiKit.card(context);
    LinearLayout top = UiKit.row(context);
    TextView description = UiKit.text(
        context,
        entry.description.isEmpty() ? (entry.isIncome() ? "Gelir" : "Gider") : entry.description,
        14,
        UiKit.TEXT,
        Typeface.BOLD
    );
    description.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(description);
    top.addView(UiKit.text(
        context,
        (entry.isIncome() ? "+" : "-") + money(entry.amountMinor),
        14,
        entry.isIncome() ? UiKit.SUCCESS : UiKit.DANGER,
        Typeface.BOLD
    ));
    card.addView(top);
    String meta = join(" · ", paymentLabel(entry.paymentMethod), entry.category, shortTime(entry.occurredAt));
    card.addView(UiKit.text(context, meta, 11, UiKit.MUTED, Typeface.NORMAL));
    return card;
  }

  private static TextView line(Context context, String label, String value, int tone) {
    TextView text = UiKit.text(context, label + ": " + value, 13, tone, Typeface.BOLD);
    text.setPadding(0, dp(context, 7), 0, 0);
    return text;
  }

  private static void showCreateDialog(Context context, OperationData data, Listener listener) {
    LinearLayout form = new LinearLayout(context);
    form.setOrientation(LinearLayout.VERTICAL);
    int padding = dp(context, 16);
    form.setPadding(padding, padding, padding, padding);

    Spinner direction = spinner(context, form, "Tür", new Choice[] {
        new Choice("Gelir", "income"),
        new Choice("Gider", "expense")
    });
    EditText amount = input(context, form, "Tutar (TL)", "0,00");
    amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    EditText description = input(context, form, "Açıklama", "");
    description.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    Spinner payment = spinner(context, form, "Ödeme şekli", new Choice[] {
        new Choice("Nakit", "cash"),
        new Choice("Kart", "card"),
        new Choice("Banka / Havale", "bank"),
        new Choice("Diğer", "other")
    });
    Spinner category = spinner(context, form, "Kategori", incomeCategories(data));
    direction.setOnItemSelectedListener(new SimpleItemSelectedListener(position -> {
      Choice selected = (Choice) direction.getSelectedItem();
      setChoices(context, category, "expense".equals(selected.value) ? expenseCategories() : incomeCategories(data));
    }));

    TextView status = new TextView(context);
    status.setTextSize(12);
    form.addView(status);
    ScrollView scroll = new ScrollView(context);
    scroll.addView(form);

    AlertDialog dialog = new AlertDialog.Builder(context)
        .setTitle("Kasa hareketi ekle")
        .setView(scroll)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton("Kaydet", null)
        .create();
    dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
      long amountMinor = parseAmountMinor(amount.getText().toString());
      if (amountMinor <= 0) {
        status.setText("Geçerli bir tutar girin.");
        return;
      }
      String normalizedDescription = description.getText().toString().trim().replaceAll("\\s+", " ");
      if (normalizedDescription.length() > 160) {
        status.setText("Açıklama en fazla 160 karakter olabilir.");
        return;
      }
      Choice selectedDirection = (Choice) direction.getSelectedItem();
      Choice selectedPayment = (Choice) payment.getSelectedItem();
      Choice selectedCategory = (Choice) category.getSelectedItem();
      JSONObject payload = new JSONObject();
      try {
        payload.put("direction", selectedDirection.value);
        payload.put("amount_minor", amountMinor);
        payload.put("payment_method", selectedPayment.value);
        payload.put("category", selectedCategory.value);
        payload.put("description", normalizedDescription);
      } catch (Exception error) {
        status.setText("Kasa bilgileri hazırlanamadı.");
        return;
      }
      dialog.dismiss();
      listener.onCreate(payload);
    }));
    dialog.show();
  }

  static long parseAmountMinor(String raw) {
    if (raw == null) return -1;
    String normalized = raw.trim().replace(" ", "").replace(',', '.');
    if (normalized.isEmpty()) return -1;
    try {
      double amount = Double.parseDouble(normalized);
      if (!Double.isFinite(amount) || amount <= 0 || amount > 100_000_000) return -1;
      return Math.round(amount * 100d);
    } catch (NumberFormatException error) {
      return -1;
    }
  }

  private static Choice[] incomeCategories(OperationData data) {
    ArrayList<Choice> choices = new ArrayList<>();
    choices.add(new Choice("Diğer gelir", "other_income"));
    if (hasAnyFoodServiceCapability(data)) {
      choices.add(new Choice("Restoran", "restaurant"));
    }
    if (hasAnyAccommodationCapability(data)) {
      choices.add(new Choice("Pansiyon", "pension"));
    }
    return choices.toArray(new Choice[0]);
  }

  private static boolean hasAnyAccommodationCapability(OperationData data) {
    return data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ROOMS)
        || data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS)
        || data.hasBusinessCapability(AndroidUiRules.CAPABILITY_STAYS)
        || data.hasBusinessCapability(AndroidUiRules.CAPABILITY_FOLIO);
  }

  private static boolean hasAnyFoodServiceCapability(OperationData data) {
    return data.hasBusinessCapability(AndroidUiRules.CAPABILITY_TABLES)
        || data.hasBusinessCapability(AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS)
        || data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS)
        || data.hasBusinessCapability(AndroidUiRules.CAPABILITY_MENU);
  }

  private static Choice[] expenseCategories() {
    return new Choice[] {
        new Choice("Diğer gider", "other_expense"),
        new Choice("Stok / Alım", "stock"),
        new Choice("Faturalar", "utilities"),
        new Choice("Personel", "staff"),
        new Choice("Bakım", "maintenance"),
        new Choice("Ulaşım", "transport"),
        new Choice("Resmî gider", "official")
    };
  }

  private static Spinner spinner(Context context, LinearLayout form, String label, Choice[] choices) {
    addLabel(context, form, label);
    Spinner spinner = new Spinner(context);
    setChoices(context, spinner, choices);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(context, 50));
    params.setMargins(0, 0, 0, dp(context, 10));
    spinner.setLayoutParams(params);
    form.addView(spinner);
    return spinner;
  }

  private static void setChoices(Context context, Spinner spinner, Choice[] choices) {
    ArrayAdapter<Choice> adapter = new ArrayAdapter<>(context, android.R.layout.simple_spinner_item, choices);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    spinner.setAdapter(adapter);
  }

  private static EditText input(Context context, LinearLayout form, String label, String hint) {
    addLabel(context, form, label);
    EditText field = new EditText(context);
    field.setSingleLine(true);
    field.setHint(hint);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(context, 50));
    params.setMargins(0, 0, 0, dp(context, 10));
    field.setLayoutParams(params);
    form.addView(field);
    return field;
  }

  private static void addLabel(Context context, LinearLayout form, String label) {
    TextView text = new TextView(context);
    text.setText(label);
    text.setTextSize(12);
    text.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    form.addView(text);
  }

  private static String money(long minor) {
    NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("tr", "TR"));
    return format.format(Math.max(0, minor) / 100d);
  }

  private static String signedMoney(long minor) {
    NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("tr", "TR"));
    return format.format(minor / 100d);
  }

  private static String paymentLabel(String value) {
    if ("card".equals(value)) return "Kart";
    if ("bank".equals(value)) return "Banka";
    if ("other".equals(value)) return "Diğer";
    return "Nakit";
  }

  private static String shortTime(String value) {
    if (value == null) return "";
    String text = value.trim().replace('T', ' ');
    return text.length() > 16 ? text.substring(0, 16) : text;
  }

  private static String join(String separator, String... values) {
    List<String> nonEmpty = new ArrayList<>();
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) nonEmpty.add(value.trim());
    }
    return String.join(separator, nonEmpty);
  }

  private static int dp(Context context, int value) {
    return Math.round(value * context.getResources().getDisplayMetrics().density);
  }

  private static final class Choice {
    final String label;
    final String value;

    Choice(String label, String value) {
      this.label = label;
      this.value = value;
    }

    @Override
    public String toString() {
      return label;
    }
  }

  private interface PositionListener {
    void onSelected(int position);
  }

  private static final class SimpleItemSelectedListener implements android.widget.AdapterView.OnItemSelectedListener {
    private final PositionListener listener;

    SimpleItemSelectedListener(PositionListener listener) {
      this.listener = listener;
    }

    @Override
    public void onItemSelected(android.widget.AdapterView<?> parent, android.view.View view, int position, long id) {
      listener.onSelected(position);
    }

    @Override
    public void onNothingSelected(android.widget.AdapterView<?> parent) {}
  }
}

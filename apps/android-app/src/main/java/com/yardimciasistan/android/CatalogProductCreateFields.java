package com.yardimciasistan.android;

import android.content.Context;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import java.util.Arrays;
import java.util.function.Consumer;

/** Shared canonical creation controls, composed by retail and Menu channel creation. */
final class CatalogProductCreateFields {
  static final String[] UNITS = { "piece", "kg", "g", "l", "ml", "pack", "box", "meter", "other" };

  static EditText name(LinearLayout parent, String value, Consumer<String> changed) {
    return input(parent, "Ürün adı", "Örn. Test Kola 330 ml", value, changed, false);
  }

  static EditText salePrice(LinearLayout parent, String value, Consumer<String> changed) {
    return input(parent, "Satış fiyatı (isteğe bağlı)", "0,00", value, changed, true);
  }

  static Spinner unit(LinearLayout parent, String value, Consumer<String> changed) {
    Context context = parent.getContext();
    label(parent, "Birim");
    Spinner spinner = new Spinner(context);
    ArrayAdapter<String> adapter = new ArrayAdapter<>(context, android.R.layout.simple_spinner_item,
        new String[] { "Adet", "Kilogram", "Gram", "Litre", "Mililitre", "Paket", "Kutu", "Metre", "Diğer" });
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    spinner.setAdapter(adapter);
    spinner.setSelection(Math.max(0, Arrays.asList(UNITS).indexOf(value)));
    spinner.setBackground(UiKit.rounded(context, UiKit.SURFACE, UiKit.BORDER, 11));
    spinner.setLayoutParams(params(context));
    spinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
      @Override public void onItemSelected(AdapterView<?> view, View selected, int position, long id) { changed.accept(UNITS[position]); }
      @Override public void onNothingSelected(AdapterView<?> view) {}
    });
    parent.addView(spinner);
    return spinner;
  }

  private static EditText input(LinearLayout parent, String title, String hint, String value, Consumer<String> changed, boolean decimal) {
    label(parent, title);
    EditText input = UiKit.input(parent.getContext(), hint);
    input.setLayoutParams(params(parent.getContext()));
    if (decimal) input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    input.setText(value == null ? "" : value);
    input.addTextChangedListener(new TextWatcher() {
      @Override public void beforeTextChanged(CharSequence text, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence text, int start, int before, int count) { changed.accept(text.toString()); }
      @Override public void afterTextChanged(Editable text) {}
    });
    parent.addView(input);
    return input;
  }

  private static void label(LinearLayout parent, String title) {
    parent.addView(UiKit.text(parent.getContext(), title, 12, UiKit.SECONDARY, Typeface.BOLD));
  }

  private static LinearLayout.LayoutParams params(Context context) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(context, 50));
    params.setMargins(0, 0, 0, UiKit.dp(context, 9));
    return params;
  }
}

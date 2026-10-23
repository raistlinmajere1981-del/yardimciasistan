package com.yardimciasistan.dealer;

import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.*;

/** Native primitives and semantic colors for the entire independent Dealer application. */
final class DealerUi {
  final Context context;
  final DealerAppearance appearance;
  final boolean dark;
  final int background, surface, ink, muted, accent, onAccent, soft, border, danger;
  private android.graphics.Bitmap logoBitmap;
  DealerUi(Context context) {
    this.context = context;
    appearance = appearance(context);
    dark = appearance.theme.equals("dark")
        || appearance.theme.equals("system")
            && (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    background = dark ? 0xff0c1523 : 0xfff4f7fa;
    surface = dark ? 0xff172638 : 0xffffffff;
    ink = dark ? 0xfff2f6fc : 0xff14283e;
    muted = appearance.highContrast ? ink : dark ? 0xffbccbdd : 0xff536578;
    border = appearance.highContrast ? ink : dark ? 0xff31445b : 0xffdce5ee;
    int index = java.util.Arrays.asList(DealerAppearance.ACCENTS).indexOf(appearance.accent);
    accent = (dark ? new int[] {0xff78b9ff, 0xff75dbb4, 0xffffb27d, 0xffd0a5ff}
                   : new int[] {0xff1869cc, 0xff116d61, 0xffa64319, 0xff7038bd})[index];
    onAccent = dark ? 0xff10213a : 0xffffffff;
    soft = dark ? 0xff20364c : 0xffeaf3ff;
    danger = dark ? 0xffffb0a9 : 0xffab2f2f;
  }
  static DealerAppearance appearance(Context context) {
    return DealerAppearance.decode(context.getSharedPreferences("appearance", Context.MODE_PRIVATE)
            .getString("profile", "{}"));
  }
  static boolean save(Context context, DealerAppearance next) {
    return context.getSharedPreferences("appearance", Context.MODE_PRIVATE)
        .edit()
        .putString("profile", next.encode())
        .commit();
  }
  int dp(int value) {
    return Math.round(value * context.getResources().getDisplayMetrics().density);
  }
  LinearLayout column() {
    LinearLayout view = new LinearLayout(context);
    view.setOrientation(LinearLayout.VERTICAL);
    return view;
  }
  LinearLayout row() {
    LinearLayout view = new LinearLayout(context);
    view.setOrientation(LinearLayout.HORIZONTAL);
    view.setGravity(Gravity.CENTER_VERTICAL);
    return view;
  }
  TextView text(String value, int size, int color) {
    TextView view = new TextView(context);
    view.setText(value);
    view.setTextSize(size);
    view.setTextColor(color);
    view.setLineSpacing(0, 1.08f);
    return view;
  }
  TextView label(LinearLayout parent, String value, int size, int color) {
    TextView view = text(value, size, color);
    view.setPadding(0, dp(4), 0, dp(4));
    parent.addView(view);
    return view;
  }
  GradientDrawable shape(int fill, int stroke, int radius) {
    GradientDrawable drawable = new GradientDrawable();
    drawable.setColor(fill);
    drawable.setCornerRadius(dp(radius));
    if (stroke != 0)
      drawable.setStroke(dp(1), stroke);
    return drawable;
  }
  Button button(String caption, Runnable action, boolean primary) {
    Button view = new Button(context);
    view.setText(caption);
    view.setAllCaps(false);
    view.setTextSize(15);
    view.setTypeface(null, Typeface.NORMAL);
    view.setMinHeight(dp(48));
    view.setMinimumHeight(dp(48));
    view.setMinWidth(dp(48));
    view.setMinimumWidth(dp(48));
    view.setPadding(dp(12), dp(10), dp(12), dp(10));
    view.setTextColor(primary ? onAccent : accent);
    view.setBackground(new RippleDrawable(ColorStateList.valueOf(dark ? 0x22ffffff : 0x18000000),
        shape(primary ? accent : surface, primary ? accent : border, 12), null));
    view.setOnClickListener(v -> action.run());
    return view;
  }
  Button button(LinearLayout parent, String caption, Runnable action, boolean primary) {
    Button view = button(caption, action, primary);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        parent.getOrientation() == LinearLayout.HORIZONTAL ? -2 : -1, -2);
    params.setMargins(dp(2), dp(5), dp(2), dp(5));
    parent.addView(view, params);
    return view;
  }
  Button choice(LinearLayout parent, String caption, boolean selected, Runnable action) {
    Button view = button(parent, caption, action, false);
    view.setSelected(selected);
    view.setTypeface(null, selected ? Typeface.BOLD : Typeface.NORMAL);
    view.setBackground(shape(selected ? soft : surface, selected ? accent : border, 12));
    view.setTextColor(selected ? accent : ink);
    view.setContentDescription(caption + (selected ? ", seçili" : ""));
    return view;
  }
  LinearLayout card(LinearLayout parent) {
    LinearLayout view = column();
    view.setPadding(dp(16), dp(12), dp(16), dp(12));
    view.setBackground(shape(surface, border, 16));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.setMargins(0, dp(8), 0, dp(8));
    parent.addView(view, p);
    return view;
  }
  EditText field(LinearLayout parent, String caption, String value, int inputType, int max) {
    TextView label = label(parent, caption, 13, muted);
    EditText view = new EditText(context);
    view.setId(View.generateViewId());
    label.setLabelFor(view.getId());
    view.setContentDescription(caption);
    view.setTextSize(16);
    view.setTextColor(ink);
    view.setHintTextColor(muted);
    view.setInputType(inputType);
    view.setSingleLine((inputType & android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE) == 0);
    view.setMinHeight(dp(52));
    view.setPadding(dp(12), dp(10), dp(12), dp(10));
    view.setBackground(shape(surface, border, 12));
    view.setFilters(
        new android.text.InputFilter[] {new android.text.InputFilter.LengthFilter(max)});
    view.setText(value);
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.setMargins(0, dp(4), 0, dp(12));
    parent.addView(view, p);
    return view;
  }
  Spinner selector(LinearLayout parent, String caption, java.util.List<String> values,
      String selected, java.util.function.Consumer<String> change) {
    label(parent, caption, 13, muted);
    Spinner view = new Spinner(context);
    view.setContentDescription(caption);
    java.util.List<String> options =
        values.isEmpty() ? java.util.Collections.singletonList("Şu anda sunulmuyor") : values;
    ArrayAdapter<String> adapter =
        new ArrayAdapter<String>(context, android.R.layout.simple_spinner_dropdown_item, options) {
          @Override
          public View getView(int p, View reusable, android.view.ViewGroup group) {
            TextView text = (TextView) super.getView(p, reusable, group);
            text.setTextColor(ink);
            text.setTextSize(16);
            return text;
          }
          @Override
          public View getDropDownView(int p, View reusable, android.view.ViewGroup group) {
            TextView text = (TextView) super.getDropDownView(p, reusable, group);
            text.setTextColor(ink);
            text.setBackgroundColor(surface);
            text.setMinHeight(dp(48));
            text.setTextSize(16);
            return text;
          }
        };
    view.setAdapter(adapter);
    int position = Math.max(0, options.indexOf(selected));
    view.setSelection(position);
    parent.addView(view, new LinearLayout.LayoutParams(-1, -2));
    view.setMinimumHeight(dp(48));
    final String[] previous = {options.get(position)};
    view.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
      public void onNothingSelected(AdapterView<?> p) {}
      public void onItemSelected(AdapterView<?> p, View item, int index, long id) {
        String next = options.get(index);
        if (!next.equals(previous[0])) {
          previous[0] = next;
          change.accept(next);
        }
      }
    });
    return view;
  }
  ImageView logo(int size) {
    ImageView view = new ImageView(context);
    if (logoBitmap == null) {
      android.graphics.BitmapFactory.Options options = new android.graphics.BitmapFactory.Options();
      options.inSampleSize = 4;
      logoBitmap = android.graphics.BitmapFactory.decodeResource(
          context.getResources(), R.drawable.dealer_mascot, options);
    }
    view.setImageBitmap(logoBitmap);
    view.setContentDescription("Yardımcı Asistan Bayi");
    view.setScaleType(ImageView.ScaleType.FIT_CENTER);
    view.setLayoutParams(new LinearLayout.LayoutParams(dp(size), dp(size)));
    view.setClipToOutline(true);
    view.setBackground(shape(surface, 0, 12));
    return view;
  }
  void insets(View root) {
    androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
      androidx.core.graphics.Insets bars =
          insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()
              | androidx.core.view.WindowInsetsCompat.Type.ime());
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      return insets;
    });
    androidx.core.view.ViewCompat.requestApplyInsets(root);
  }
}

package com.yardimciasistan.android;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

final class UiKit {
  static final int BG = Color.rgb(9, 15, 27);
  static final int SURFACE = Color.rgb(18, 28, 46);
  static final int SURFACE_ALT = Color.rgb(24, 36, 58);
  static final int BORDER = Color.rgb(43, 58, 82);
  static final int TEXT = Color.rgb(248, 250, 252);
  static final int MUTED = Color.rgb(148, 163, 184);
  static final int PRIMARY = Color.rgb(45, 212, 191);
  static final int PRIMARY_DARK = Color.rgb(19, 78, 74);
  static final int ACCENT = Color.rgb(251, 146, 60);
  static final int SUCCESS = Color.rgb(74, 222, 128);
  static final int WARNING = Color.rgb(250, 204, 21);
  static final int DANGER = Color.rgb(248, 113, 113);
  static final int INFO = Color.rgb(96, 165, 250);

  private UiKit() {}

  static int dp(Context context, int value) {
    return Math.round(value * context.getResources().getDisplayMetrics().density);
  }

  static GradientDrawable rounded(Context context, int fill, int stroke, int radius) {
    GradientDrawable drawable = new GradientDrawable();
    drawable.setColor(fill);
    drawable.setCornerRadius(dp(context, radius));
    if (stroke != Color.TRANSPARENT) {
      drawable.setStroke(dp(context, 1), stroke);
    }
    return drawable;
  }

  static TextView text(Context context, String value, int sizeSp, int color, int style) {
    TextView text = new TextView(context);
    text.setText(value);
    text.setTextSize(sizeSp);
    text.setTextColor(color);
    text.setTypeface(Typeface.create("sans", style));
    text.setLineSpacing(0, 1.08f);
    return text;
  }

  static TextView title(Context context, String value) {
    TextView text = text(context, value, 22, TEXT, Typeface.BOLD);
    text.setPadding(0, 0, 0, dp(context, 3));
    return text;
  }

  static TextView sectionTitle(Context context, String value) {
    TextView text = text(context, value, 17, TEXT, Typeface.BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, dp(context, 16), 0, dp(context, 8));
    text.setLayoutParams(params);
    return text;
  }

  static TextView eyebrow(Context context, String value) {
    TextView text = text(context, value.toUpperCase(), 11, PRIMARY, Typeface.BOLD);
    text.setLetterSpacing(0.08f);
    return text;
  }

  static LinearLayout column(Context context) {
    LinearLayout layout = new LinearLayout(context);
    layout.setOrientation(LinearLayout.VERTICAL);
    return layout;
  }

  static LinearLayout row(Context context) {
    LinearLayout layout = new LinearLayout(context);
    layout.setOrientation(LinearLayout.HORIZONTAL);
    layout.setGravity(Gravity.CENTER_VERTICAL);
    return layout;
  }

  static LinearLayout card(Context context) {
    LinearLayout card = column(context);
    card.setPadding(dp(context, 14), dp(context, 13), dp(context, 14), dp(context, 13));
    card.setBackground(rounded(context, SURFACE, BORDER, 14));
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, 0, 0, dp(context, 9));
    card.setLayoutParams(params);
    return card;
  }

  static View divider(Context context) {
    View divider = new View(context);
    divider.setBackgroundColor(BORDER);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(context, 1));
    params.setMargins(0, dp(context, 10), 0, dp(context, 10));
    divider.setLayoutParams(params);
    return divider;
  }

  static Button button(Context context, String label, int tone, View.OnClickListener listener) {
    Button button = new Button(context);
    button.setText(label);
    button.setTextSize(13);
    button.setTextColor(tone == PRIMARY ? Color.rgb(4, 47, 46) : TEXT);
    button.setTypeface(Typeface.create("sans", Typeface.BOLD));
    button.setAllCaps(false);
    button.setGravity(Gravity.CENTER);
    button.setMinHeight(dp(context, 44));
    button.setMinimumHeight(dp(context, 44));
    button.setPadding(dp(context, 12), 0, dp(context, 12), 0);
    int fill = tone == PRIMARY ? PRIMARY : tone;
    button.setBackground(rounded(context, fill, Color.TRANSPARENT, 11));
    button.setOnClickListener(listener);
    return button;
  }

  static Button outlineButton(Context context, String label, View.OnClickListener listener) {
    Button button = button(context, label, SURFACE_ALT, listener);
    button.setBackground(rounded(context, SURFACE_ALT, BORDER, 11));
    return button;
  }

  static Button dangerButton(Context context, String label, View.OnClickListener listener) {
    Button button = button(context, label, Color.rgb(127, 29, 29), listener);
    button.setBackground(rounded(context, Color.rgb(69, 24, 32), Color.rgb(127, 29, 29), 11));
    return button;
  }

  static Button chip(Context context, String label, boolean selected, View.OnClickListener listener) {
    Button button = new Button(context);
    button.setText(label);
    button.setTextSize(12);
    button.setTextColor(selected ? Color.rgb(4, 47, 46) : TEXT);
    button.setTypeface(Typeface.create("sans", Typeface.BOLD));
    button.setAllCaps(false);
    button.setMinHeight(dp(context, 38));
    button.setMinimumHeight(dp(context, 38));
    button.setPadding(dp(context, 13), 0, dp(context, 13), 0);
    button.setBackground(rounded(context, selected ? PRIMARY : SURFACE_ALT, selected ? PRIMARY : BORDER, 18));
    button.setOnClickListener(listener);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, dp(context, 40));
    params.setMargins(0, 0, dp(context, 7), 0);
    button.setLayoutParams(params);
    return button;
  }

  static Button iconButton(Context context, String glyph, String description, boolean selected, View.OnClickListener listener) {
    Button button = new Button(context);
    button.setText(glyph);
    button.setContentDescription(description);
    button.setTextSize(18);
    button.setTextColor(selected ? PRIMARY : TEXT);
    button.setTypeface(Typeface.create("sans", Typeface.BOLD));
    button.setAllCaps(false);
    button.setGravity(Gravity.CENTER);
    button.setMinWidth(dp(context, 44));
    button.setMinimumWidth(dp(context, 44));
    button.setMinHeight(dp(context, 44));
    button.setMinimumHeight(dp(context, 44));
    button.setPadding(0, 0, 0, 0);
    button.setBackground(rounded(context, selected ? PRIMARY_DARK : SURFACE_ALT, selected ? PRIMARY : BORDER, 11));
    button.setOnClickListener(listener);
    return button;
  }

  static Button counterChip(Context context, String label, int value, int tone, View.OnClickListener listener) {
    Button button = new Button(context);
    button.setText(label + " " + value);
    button.setTextSize(12);
    button.setTextColor(tone);
    button.setTypeface(Typeface.create("sans", Typeface.BOLD));
    button.setAllCaps(false);
    button.setSingleLine(true);
    button.setMinWidth(0);
    button.setMinimumWidth(0);
    button.setGravity(Gravity.CENTER);
    button.setMinHeight(dp(context, 34));
    button.setMinimumHeight(dp(context, 34));
    button.setPadding(dp(context, 10), 0, dp(context, 10), 0);
    button.setBackground(rounded(context, withAlpha(tone, 24), withAlpha(tone, 84), 17));
    button.setOnClickListener(listener);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, dp(context, 36));
    params.setMargins(0, 0, dp(context, 7), 0);
    button.setLayoutParams(params);
    return button;
  }

  static TextView badge(Context context, String label, int tone) {
    TextView badge = text(context, label, 11, tone, Typeface.BOLD);
    badge.setGravity(Gravity.CENTER);
    badge.setPadding(dp(context, 9), dp(context, 4), dp(context, 9), dp(context, 4));
    badge.setBackground(rounded(context, withAlpha(tone, 34), withAlpha(tone, 105), 12));
    return badge;
  }

  static ScrollView scroll(Context context, View content) {
    return scroll(context, content, 24);
  }

  static ScrollView scroll(Context context, View content, int bottomPaddingDp) {
    ScrollView scroll = new ScrollView(context);
    scroll.setFillViewport(true);
    scroll.setClipToPadding(false);
    scroll.setPadding(dp(context, 14), 0, dp(context, 14), dp(context, bottomPaddingDp));
    scroll.addView(content);
    return scroll;
  }

  static EditText input(Context context, String hint) {
    EditText input = new EditText(context);
    input.setHint(hint);
    input.setHintTextColor(MUTED);
    input.setTextColor(TEXT);
    input.setTextSize(15);
    input.setSingleLine(true);
    input.setPadding(dp(context, 12), 0, dp(context, 12), 0);
    input.setMinHeight(dp(context, 50));
    input.setBackground(rounded(context, BG, BORDER, 11));
    return input;
  }

  static void addAction(LinearLayout row, View action, Context context) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(context, 44), 1f);
    if (row.getChildCount() > 0) {
      params.setMargins(dp(context, 7), 0, 0, 0);
    }
    action.setLayoutParams(params);
    row.addView(action);
  }

  static int withAlpha(int color, int alpha) {
    return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
  }
}

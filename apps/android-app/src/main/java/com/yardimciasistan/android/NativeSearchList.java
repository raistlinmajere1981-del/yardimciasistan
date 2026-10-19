package com.yardimciasistan.android;

import android.content.Context;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Button;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Screen-local filtering of already authorized rows. Never queries the network. */
final class NativeSearchList {
  private static final Locale TR = new Locale("tr", "TR");

  private static final class Entry {
    final View view;
    final String text;
    Entry(View view, String text) {
      this.view = view;
      this.text = text == null ? "" : text;
    }
  }

  private final List<Entry> entries = new ArrayList<>();
  private final EditText search;
  private final LinearLayout field;
  private final Button clear;
  private TextView emptyNotice;

  private NativeSearchList(Context context, String hint) {
    field = UiKit.row(context);
    search = UiKit.input(context, hint);
    search.setContentDescription(hint);
    field.addView(search, new LinearLayout.LayoutParams(0, -2, 1f));
    clear = UiKit.iconButton(context, "×", "Aramayı temizle", false, view -> {
      search.setText("");
      search.requestFocus();
    });
    LinearLayout.LayoutParams clearParams = new LinearLayout.LayoutParams(UiKit.dp(context, 48), UiKit.dp(context, 48));
    clearParams.setMarginStart(UiKit.dp(context, 6));
    field.addView(clear, clearParams);
    clear.setVisibility(View.INVISIBLE);
    search.addTextChangedListener(new TextWatcher() {
      @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence s, int start, int before, int count) { refresh(); }
      @Override public void afterTextChanged(Editable s) {}
    });
  }

  static NativeSearchList attachTo(LinearLayout page, String hint) {
    NativeSearchList list = new NativeSearchList(page.getContext(), hint);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(page.getContext(), 5), 0, UiKit.dp(page.getContext(), 12));
    page.addView(list.field, params);
    return list;
  }

  void add(View view, String searchableText) {
    entries.add(new Entry(view, searchableText));
    view.setVisibility(matches(search.getText().toString(), searchableText) ? View.VISIBLE : View.GONE);
  }

  void showNoMatchesIn(LinearLayout page, String message) {
    emptyNotice = UiKit.text(page.getContext(), message, 13, UiKit.MUTED, Typeface.NORMAL);
    page.addView(emptyNotice);
    refresh();
  }

  private void refresh() {
    String query = search.getText().toString();
    clear.setVisibility(query.isEmpty() ? View.INVISIBLE : View.VISIBLE);
    int visible = 0;
    for (Entry entry : entries) {
      boolean found = matches(query, entry.text);
      entry.view.setVisibility(found ? View.VISIBLE : View.GONE);
      if (found) visible++;
    }
    if (emptyNotice != null) {
      emptyNotice.setVisibility(!query.trim().isEmpty() && visible == 0 ? View.VISIBLE : View.GONE);
    }
  }

  static boolean matches(String query, String text) {
    String needle = query == null ? "" : query.trim().toLowerCase(TR);
    if (needle.isEmpty()) return true;
    return text != null && text.toLowerCase(TR).contains(needle);
  }
}

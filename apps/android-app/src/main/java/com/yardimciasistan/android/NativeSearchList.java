package com.yardimciasistan.android;

import android.content.Context;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.EditText;
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
  private TextView emptyNotice;

  NativeSearchList(Context context, String hint) {
    search = UiKit.input(context, hint);
    search.setContentDescription(hint);
    search.setSingleLine(true);
    search.addTextChangedListener(new TextWatcher() {
      @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence s, int start, int before, int count) { refresh(); }
      @Override public void afterTextChanged(Editable s) {}
    });
  }

  EditText input() { return search; }

  void add(View view, String searchableText) {
    entries.add(new Entry(view, searchableText));
    view.setVisibility(matches(search.getText().toString(), searchableText) ? View.VISIBLE : View.GONE);
  }

  void setNoMatchesNotice(TextView notice) {
    emptyNotice = notice;
    refresh();
  }

  private void refresh() {
    String query = search.getText().toString();
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

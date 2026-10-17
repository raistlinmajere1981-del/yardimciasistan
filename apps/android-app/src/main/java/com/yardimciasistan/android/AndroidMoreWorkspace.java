package com.yardimciasistan.android;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.RippleDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

/** A launcher only: existing domain workspaces retain all operations and drafts. */
final class AndroidMoreWorkspace {
  interface Listener { void open(String route); }
  static View create(Context context, OperationData data, Listener listener, int bottomPaddingDp) {
    LinearLayout page = UiKit.column(context);
    TextView heading = UiKit.title(context, "Diğer");
    heading.setPadding(0, UiKit.dp(context, 4), 0, UiKit.dp(context, 16));
    page.addView(heading);
    for (AndroidUiRules.NavigationItem item : AndroidUiRules.moreNavigation(data)) {
      LinearLayout row = UiKit.row(context);
      row.setGravity(Gravity.CENTER_VERTICAL);
      row.setPadding(UiKit.dp(context, 16), UiKit.dp(context, 14), UiKit.dp(context, 16), UiKit.dp(context, 14));
      row.setMinimumHeight(UiKit.dp(context, 76));
      row.setBackground(new RippleDrawable(ColorStateList.valueOf(UiKit.withAlpha(UiKit.PRIMARY, 40)),
          UiKit.rounded(context, UiKit.SURFACE, UiKit.BORDER, 16), null));
      LinearLayout text = UiKit.column(context);
      text.addView(UiKit.text(context, item.label, 15, UiKit.TEXT, Typeface.BOLD));
      text.addView(UiKit.text(context, item.description, 12, UiKit.SECONDARY, Typeface.NORMAL));
      row.addView(text, new LinearLayout.LayoutParams(0, -2, 1f));
      row.addView(UiKit.text(context, "›", 28, UiKit.PRIMARY, Typeface.NORMAL));
      row.setFocusable(true); row.setContentDescription(item.label + ", " + item.description + ", bölümü aç");
      row.setOnClickListener(view -> listener.open(item.route));
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, 0, 0, UiKit.dp(context, 10)); page.addView(row, params);
    }
    return UiKit.scroll(context, page, bottomPaddingDp);
  }
}

package com.yardimciasistan.android;

import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import java.util.HashMap;
import java.util.Map;

final class AndroidShellController {
  interface Listener {
    void onRefresh();
    void onThemeToggle();
    void onSettingsToggle();
    void onTabSelected(String tab);
    boolean canOpenTab(String tab);
    AppTheme.Mode themeMode();
  }

  private static final int BOTTOM_NAV_HEIGHT_DP = 70;
  private static final int MAIN_CONTENT_BOTTOM_PADDING_DP = BOTTOM_NAV_HEIGHT_DP + 24;
  private static final int LANDSCAPE_CONTENT_BOTTOM_PADDING_DP = 18;
  private static final int LANDSCAPE_SIDE_NAV_WIDTH_DP = 112;
  private static final int PORTRAIT_HEADER_HEIGHT_DP = 72;
  private static final int LANDSCAPE_HEADER_HEIGHT_DP = 60;
  private static final int HEADER_ACTION_SIZE_DP = 44;

  private final ComponentActivity activity;
  private final Listener listener;
  private final Map<String, Integer> screenScrollPositions = new HashMap<>();

  private FrameLayout content;
  private LinearLayout bottomNavigation;
  private TextView headerTitle;
  private TextView headerMeta;
  private TextView errorBanner;
  private Button refreshButton;
  private Button settingsButton;
  private boolean landscapeLayout;
  private String renderedScreenKey = "";
  private String currentError = "";

  AndroidShellController(ComponentActivity activity, Listener listener) {
    this.activity = activity;
    this.listener = listener;
  }

  void build() {
    landscapeLayout = activity.getResources().getConfiguration().orientation
        == android.content.res.Configuration.ORIENTATION_LANDSCAPE;

    LinearLayout root = UiKit.column(activity);
    root.setBackgroundColor(UiKit.BG);

    LinearLayout header = UiKit.row(activity);
    int headerVerticalPadding = landscapeLayout ? 4 : 8;
    header.setPadding(
        UiKit.dp(activity, 14),
        UiKit.dp(activity, headerVerticalPadding),
        UiKit.dp(activity, 10),
        UiKit.dp(activity, headerVerticalPadding)
    );
    header.setBackgroundColor(UiKit.BG);
    header.setLayoutParams(new LinearLayout.LayoutParams(
        -1,
        UiKit.dp(activity, landscapeLayout ? LANDSCAPE_HEADER_HEIGHT_DP : PORTRAIT_HEADER_HEIGHT_DP)
    ));

    LinearLayout titleGroup = UiKit.column(activity);
    titleGroup.setGravity(Gravity.CENTER_VERTICAL);
    headerTitle = UiKit.text(activity, "Bugün", 20, UiKit.TEXT, Typeface.BOLD);
    titleGroup.addView(headerTitle);
    headerMeta = UiKit.text(activity, "Personel · Henüz sync yok", 11, UiKit.MUTED, Typeface.NORMAL);
    titleGroup.addView(headerMeta);
    titleGroup.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    header.addView(titleGroup);

    LinearLayout headerActions = UiKit.row(activity);
    refreshButton = UiKit.iconButton(activity, "↻", "Yenile", false, view -> listener.onRefresh());
    headerActions.addView(refreshButton, headerActionParams(false));

    ImageButton themeButton = createThemeButton(null);
    headerActions.addView(themeButton, headerActionParams(true));

    settingsButton = UiKit.iconButton(activity, "⚙", "Ayarlar", false, view -> listener.onSettingsToggle());
    headerActions.addView(settingsButton, headerActionParams(true));
    header.addView(headerActions);
    root.addView(header);

    errorBanner = UiKit.text(activity, "", 12, UiKit.TEXT, Typeface.BOLD);
    errorBanner.setPadding(UiKit.dp(activity, 14), UiKit.dp(activity, 9), UiKit.dp(activity, 14), UiKit.dp(activity, 9));
    errorBanner.setVisibility(View.GONE);
    LinearLayout.LayoutParams bannerParams = new LinearLayout.LayoutParams(-1, -2);
    bannerParams.setMargins(UiKit.dp(activity, 14), 0, UiKit.dp(activity, 14), UiKit.dp(activity, 8));
    errorBanner.setLayoutParams(bannerParams);
    root.addView(errorBanner);

    content = new FrameLayout(activity);
    bottomNavigation = landscapeLayout ? UiKit.column(activity) : UiKit.row(activity);
    bottomNavigation.setBackground(UiKit.rounded(activity, UiKit.BOTTOM_NAV_BACKGROUND, UiKit.BORDER, 0));

    if (landscapeLayout) {
      LinearLayout body = UiKit.row(activity);
      body.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
      bottomNavigation.setPadding(
          UiKit.dp(activity, 6),
          UiKit.dp(activity, 5),
          UiKit.dp(activity, 6),
          UiKit.dp(activity, 5)
      );
      bottomNavigation.setLayoutParams(new LinearLayout.LayoutParams(
          UiKit.dp(activity, LANDSCAPE_SIDE_NAV_WIDTH_DP),
          -1
      ));
      content.setLayoutParams(new LinearLayout.LayoutParams(0, -1, 1f));
      body.addView(bottomNavigation);
      body.addView(content);
      root.addView(body);
    } else {
      content.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
      root.addView(content);
      bottomNavigation.setPadding(
          UiKit.dp(activity, 5),
          UiKit.dp(activity, 6),
          UiKit.dp(activity, 5),
          UiKit.dp(activity, 7)
      );
      bottomNavigation.setLayoutParams(new LinearLayout.LayoutParams(
          -1,
          UiKit.dp(activity, BOTTOM_NAV_HEIGHT_DP)
      ));
      root.addView(bottomNavigation);
    }

    activity.setContentView(root);
    updateError(currentError);
  }

  int contentBottomPaddingDp() {
    return landscapeLayout
        ? LANDSCAPE_CONTENT_BOTTOM_PADDING_DP
        : MAIN_CONTENT_BOTTOM_PADDING_DP;
  }

  void updateChrome(
      String activeTab,
      boolean settingsOpen,
      boolean inactiveDevice,
      boolean canOpenSettings,
      boolean loading,
      boolean hasConnectionSettings
  ) {
    if (refreshButton == null || settingsButton == null || bottomNavigation == null) return;
    refreshButton.setVisibility(inactiveDevice ? View.GONE : View.VISIBLE);
    refreshButton.setEnabled(!loading && hasConnectionSettings);
    refreshButton.setContentDescription(loading ? "Yenileniyor" : "Yenile");
    settingsButton.setVisibility(canOpenSettings ? View.VISIBLE : View.GONE);
    styleHeaderAction(settingsButton, settingsOpen);
    bottomNavigation.setVisibility(
        settingsOpen
            || inactiveDevice
            || AndroidUiRules.TAB_REPORTS.equals(activeTab)
            || AndroidUiRules.TAB_CASH.equals(activeTab)
        ? View.GONE
        : View.VISIBLE
    );
    renderBottomNavigation(activeTab, settingsOpen);
  }

  void showScreen(String title, String meta, View screen, String screenKey) {
    if (content == null || headerTitle == null || headerMeta == null) return;
    headerTitle.setText(title);
    headerMeta.setText(meta);
    content.removeAllViews();
    content.addView(screen);
    renderedScreenKey = screenKey;
    restoreScrollPosition(screen, screenKey);
  }

  void rememberCurrentScrollPosition() {
    if (renderedScreenKey.isEmpty() || content == null || content.getChildCount() == 0) {
      return;
    }
    View currentScreen = content.getChildAt(0);
    if (currentScreen instanceof ScrollView) {
      screenScrollPositions.put(renderedScreenKey, ((ScrollView) currentScreen).getScrollY());
    }
  }

  void updateError(String message) {
    currentError = message == null ? "" : message;
    if (errorBanner == null) return;
    errorBanner.setText(currentError);
    errorBanner.setTextColor(UiKit.DANGER);
    errorBanner.setBackground(UiKit.rounded(
        activity,
        UiKit.withAlpha(UiKit.DANGER, 26),
        UiKit.withAlpha(UiKit.DANGER, 100),
        11
    ));
    errorBanner.setVisibility(currentError.isEmpty() ? View.GONE : View.VISIBLE);
  }

  void addDetailHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen) {
    ImageButton quickTheme = createThemeButton(() -> {
      dialog.dismiss();
      reopen.run();
    });
    header.addView(quickTheme, headerActionParams(true));
    Button close = UiKit.outlineButton(activity, "Kapat", view -> dialog.dismiss());
    LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(-2, UiKit.dp(activity, 44));
    closeParams.setMargins(UiKit.dp(activity, 6), 0, 0, 0);
    close.setLayoutParams(closeParams);
    header.addView(close);
  }

  private ImageButton createThemeButton(Runnable afterApplied) {
    AppTheme.Mode themeMode = listener.themeMode();
    int icon = themeMode == AppTheme.Mode.NIGHT
        ? R.drawable.ic_theme_day
        : R.drawable.ic_theme_night;
    return UiKit.themeIconButton(activity, icon, themeMode.switchDescription, view -> {
      listener.onThemeToggle();
      if (afterApplied != null) {
        afterApplied.run();
      }
    });
  }

  private LinearLayout.LayoutParams headerActionParams(boolean withMargin) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        UiKit.dp(activity, HEADER_ACTION_SIZE_DP),
        UiKit.dp(activity, HEADER_ACTION_SIZE_DP)
    );
    if (withMargin) {
      params.setMargins(UiKit.dp(activity, 6), 0, 0, 0);
    }
    return params;
  }

  private void styleHeaderAction(Button button, boolean selected) {
    button.setTextColor(selected ? UiKit.PRIMARY : UiKit.TEXT);
    button.setBackground(UiKit.rounded(
        activity,
        selected ? UiKit.PRIMARY_DARK : UiKit.SURFACE_ALT,
        selected ? UiKit.PRIMARY : UiKit.BORDER,
        11
    ));
  }

  private void restoreScrollPosition(View screen, String screenKey) {
    if (!(screen instanceof ScrollView)) return;
    ScrollView scrollView = (ScrollView) screen;
    int scrollY = Math.max(0, screenScrollPositions.getOrDefault(screenKey, 0));
    scrollView.post(() -> {
      if (screenKey.equals(renderedScreenKey)
          && content != null
          && content.getChildCount() > 0
          && content.getChildAt(0) == scrollView) {
        scrollView.scrollTo(0, scrollY);
      }
    });
  }

  private void renderBottomNavigation(String activeTab, boolean settingsOpen) {
    bottomNavigation.removeAllViews();
    addNavButton("Bugün", AndroidUiRules.TAB_TODAY, activeTab, settingsOpen);
    if (listener.canOpenTab(AndroidUiRules.TAB_CUSTOMERS)) {
      addNavButton("Müşteri", AndroidUiRules.TAB_CUSTOMERS, activeTab, settingsOpen);
    }
    if (listener.canOpenTab(AndroidUiRules.TAB_PENSION)) {
      addNavButton("Pansiyon", AndroidUiRules.TAB_PENSION, activeTab, settingsOpen);
    }
    if (listener.canOpenTab(AndroidUiRules.TAB_RESTAURANT)) {
      addNavButton("Restoran", AndroidUiRules.TAB_RESTAURANT, activeTab, settingsOpen);
    }
    if (listener.canOpenTab(AndroidUiRules.TAB_MARKET)) {
      addNavButton("Market", AndroidUiRules.TAB_MARKET, activeTab, settingsOpen);
    }
    if (listener.canOpenTab(AndroidUiRules.TAB_MESSAGES)) {
      addNavButton("Mesajlar", AndroidUiRules.TAB_MESSAGES, activeTab, settingsOpen);
    }
  }

  private void addNavButton(
      String label,
      String tab,
      String activeTab,
      boolean settingsOpen
  ) {
    boolean selected = tab.equals(activeTab) && !settingsOpen;
    Button button = new Button(activity);
    button.setText(label);
    button.setTextSize(11);
    button.setTextColor(selected ? UiKit.BOTTOM_NAV_ACTIVE : UiKit.BOTTOM_NAV_INACTIVE);
    button.setTypeface(Typeface.create("sans", selected ? Typeface.BOLD : Typeface.NORMAL));
    button.setAllCaps(false);
    button.setGravity(Gravity.CENTER);
    button.setPadding(1, 0, 1, 0);
    button.setMinWidth(0);
    button.setMinimumWidth(0);
    button.setMinHeight(0);
    button.setMinimumHeight(0);
    button.setBackground(UiKit.rounded(
        activity,
        selected ? UiKit.SURFACE_ALT : Color.TRANSPARENT,
        Color.TRANSPARENT,
        11
    ));
    button.setOnClickListener(view -> listener.onTabSelected(tab));
    button.setLayoutParams(
        landscapeLayout
            ? new LinearLayout.LayoutParams(-1, 0, 1f)
            : new LinearLayout.LayoutParams(0, -1, 1f)
    );
    bottomNavigation.addView(button);
  }
}

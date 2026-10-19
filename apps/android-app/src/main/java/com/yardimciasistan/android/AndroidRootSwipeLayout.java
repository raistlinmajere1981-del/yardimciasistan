package com.yardimciasistan.android;

import android.content.Context;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.TextView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/** Intercepts only a deliberate root gesture; child forms, horizontal controls and system edges win. */
// Created only by AndroidShellController with its required navigation listener;
// never inflated from XML. A tools-only constructor cannot supply that contract.
@android.annotation.SuppressLint("ViewConstructor")
final class AndroidRootSwipeLayout extends FrameLayout {
  interface Listener {
    boolean canSwipeRoot();
    void onRootSwipe(int direction);
  }
  private final Listener listener;
  private final AndroidRootSwipeRules gesture = new AndroidRootSwipeRules();
  private final float density;
  private boolean claimed;

  AndroidRootSwipeLayout(Context context, Listener listener) {
    super(context); this.listener = listener; density = getResources().getDisplayMetrics().density;
  }

  @Override public boolean onInterceptTouchEvent(MotionEvent event) {
    if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
      claimed = false;
      gesture.begin(event.getX() / density, event.getY() / density, eligible(event));
    } else if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
      claimed = gesture.move(event.getX() / density, event.getY() / density, event.getPointerCount()) != 0;
      return claimed;
    } else if (event.getActionMasked() == MotionEvent.ACTION_POINTER_DOWN || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
      gesture.cancel();
    }
    return false;
  }

  // This container has no click action. Root navigation is available through the
  // accessible tab/rail buttons; eligible() disables swipe during touch exploration.
  // Do not synthesize performClick() for a directional gesture or consume child taps.
  @android.annotation.SuppressLint("ClickableViewAccessibility")
  @Override public boolean onTouchEvent(MotionEvent event) {
    if (!claimed) return super.onTouchEvent(event);
    if (event.getActionMasked() == MotionEvent.ACTION_MOVE) gesture.move(event.getX() / density, event.getY() / density, event.getPointerCount());
    if (event.getActionMasked() == MotionEvent.ACTION_POINTER_DOWN || event.getActionMasked() == MotionEvent.ACTION_CANCEL) gesture.cancel();
    if (event.getActionMasked() == MotionEvent.ACTION_UP) {
      gesture.move(event.getX() / density, event.getY() / density, event.getPointerCount());
      int direction = gesture.finish(); claimed = false;
      if (direction != 0 && listener.canSwipeRoot() && hasWindowFocus()) listener.onRootSwipe(direction);
    }
    return true;
  }

  private boolean eligible(MotionEvent event) {
    if (event.getPointerCount() != 1 || !hasWindowFocus() || !listener.canSwipeRoot()) return false;
    AccessibilityManager access = (AccessibilityManager) getContext().getSystemService(Context.ACCESSIBILITY_SERVICE);
    if (access != null && access.isTouchExplorationEnabled()) return false;
    View focus = getRootView().findFocus();
    if (focus instanceof EditText) return false;
    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(this);
    if (insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())) return false;
    int left = UiKit.dp(getContext(), 24), right = left;
    if (insets != null) {
      left = Math.max(left, insets.getInsets(WindowInsetsCompat.Type.systemGestures()).left);
      right = Math.max(right, insets.getInsets(WindowInsetsCompat.Type.systemGestures()).right);
    }
    return event.getX() > left && event.getX() < getWidth() - right
        && !childOwnsGesture(this, event.getX(), event.getY());
  }

  private boolean childOwnsGesture(View view, float x, float y) {
    if (view != this && (view instanceof HorizontalScrollView || view instanceof EditText
        || view.canScrollHorizontally(-1) || view.canScrollHorizontally(1)
        || view.isClickable() || view.isLongClickable()
        || view instanceof TextView && ((TextView) view).isTextSelectable())) return true;
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      for (int i = group.getChildCount() - 1; i >= 0; i--) {
        View child = group.getChildAt(i);
        float cx = x + group.getScrollX() - child.getLeft() - child.getTranslationX();
        float cy = y + group.getScrollY() - child.getTop() - child.getTranslationY();
        if (child.getVisibility() == VISIBLE && cx >= 0 && cy >= 0 && cx < child.getWidth() && cy < child.getHeight()
            && childOwnsGesture(child, cx, cy)) return true;
      }
    }
    return false;
  }
}

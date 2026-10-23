package com.yardimciasistan.dealer;

import android.content.Context;
import android.graphics.*;
import android.view.*;

/** A single gesture owner: a zoomed image pans; only a fitted image can change gallery page. */
final class DealerPhotoView extends View {
  interface Swipe {
    void change(int direction);
  }
  private Bitmap picture;
  final DealerPhotoTransform transform;
  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
  private final ScaleGestureDetector scale;
  private final GestureDetector taps;
  private float downX, downY, lastX, lastY;
  private boolean multi;
  Swipe swipe;
  Runnable changed = () -> {};
  public DealerPhotoView(Context context) {
    this(context, new DealerPhotoTransform());
  }
  DealerPhotoView(Context context, DealerPhotoTransform transform) {
    super(context);
    this.transform = transform;
    setFocusable(true);
    setClickable(true);
    setContentDescription("Fotoğraf. İki parmakla yakınlaştırın; sürükleyerek inceleyin.");
    scale =
        new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
          @Override
          public boolean onScaleBegin(ScaleGestureDetector d) {
            multi = true;
            return true;
          }
          @Override
          public boolean onScale(ScaleGestureDetector d) {
            transform.scale(d.getScaleFactor(), d.getFocusX(), d.getFocusY());
            update();
            return true;
          }
        });
    scale.setQuickScaleEnabled(false);
    taps = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
      @Override
      public boolean onDown(android.view.MotionEvent e) {
        return true;
      }
      @Override
      public boolean onDoubleTap(android.view.MotionEvent e) {
        transform.scale(transform.zoom > 1.01f ? 1 / transform.zoom : 2.5f, e.getX(), e.getY());
        update();
        return true;
      }
    });
  }
  void picture(Bitmap value) {
    picture = value;
    resize();
    invalidate();
  }
  void rotate() {
    transform.rotate();
    update();
  }
  void fit() {
    transform.reset();
    update();
  }
  void zoom(float factor) {
    transform.scale(factor, getWidth() / 2f, getHeight() / 2f);
    update();
  }
  void update() {
    invalidate();
    changed.run();
  }
  private void resize() {
    if (picture != null && getWidth() > 0 && getHeight() > 0)
      transform.size(getWidth(), getHeight(), picture.getWidth(), picture.getHeight());
  }
  @Override
  protected void onSizeChanged(int w, int h, int oldW, int oldH) {
    super.onSizeChanged(w, h, oldW, oldH);
    resize();
  }
  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    if (picture == null || picture.isRecycled())
      return;
    int save = canvas.save();
    canvas.translate(getWidth() / 2f + transform.x, getHeight() / 2f + transform.y);
    canvas.rotate(transform.rotation);
    canvas.scale(transform.fit() * transform.zoom, transform.fit() * transform.zoom);
    canvas.drawBitmap(picture, -picture.getWidth() / 2f, -picture.getHeight() / 2f, paint);
    canvas.restoreToCount(save);
  }
  @Override
  public boolean onTouchEvent(MotionEvent event) {
    if (!isEnabled() || picture == null)
      return false;
    scale.onTouchEvent(event);
    taps.onTouchEvent(event);
    int action = event.getActionMasked();
    if (action == MotionEvent.ACTION_DOWN) {
      downX = lastX = event.getX();
      downY = lastY = event.getY();
      multi = false;
      getParent().requestDisallowInterceptTouchEvent(true);
    } else if (action == MotionEvent.ACTION_POINTER_DOWN) {
      multi = true;
    } else if (action == MotionEvent.ACTION_MOVE) {
      if (event.getPointerCount() == 1 && !multi && !scale.isInProgress())
        transform.pan(event.getX() - lastX, event.getY() - lastY);
      lastX = event.getX();
      lastY = event.getY();
      update();
    } else if (action == MotionEvent.ACTION_POINTER_UP) {
      lastX = event.getX(event.getActionIndex() == 0 ? 1 : 0);
      lastY = event.getY(event.getActionIndex() == 0 ? 1 : 0);
    } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
      getParent().requestDisallowInterceptTouchEvent(false);
      float dx = event.getX() - downX, dy = event.getY() - downY;
      if (action == MotionEvent.ACTION_UP && !multi
          && Math.abs(dx) < 8 * getResources().getDisplayMetrics().density
          && Math.abs(dy) < 8 * getResources().getDisplayMetrics().density)
        performClick();
      if (action == MotionEvent.ACTION_UP && !multi && transform.zoom <= 1.01f
          && !transform.alignment && Math.abs(dx) > 64 * getResources().getDisplayMetrics().density
          && Math.abs(dx) > Math.abs(dy) * 1.4f && swipe != null)
        swipe.change(dx < 0 ? 1 : -1);
    }
    return true;
  }
  @Override
  public boolean performClick() {
    super.performClick();
    return true;
  }
}

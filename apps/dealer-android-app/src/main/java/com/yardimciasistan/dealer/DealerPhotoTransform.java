package com.yardimciasistan.dealer;

/** Viewport math in screen coordinates; independent from bitmap lifetime and Android gestures. */
final class DealerPhotoTransform {
  float zoom = 1, x, y;
  int rotation;
  private float width = 1, height = 1, imageWidth = 1, imageHeight = 1;
  boolean alignment;
  void size(float width, float height, float imageWidth, float imageHeight) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.imageWidth = Math.max(1, imageWidth);
    this.imageHeight = Math.max(1, imageHeight);
    clamp();
  }
  float fit() {
    float w = rotation % 180 == 0 ? imageWidth : imageHeight,
          h = rotation % 180 == 0 ? imageHeight : imageWidth;
    return Math.min(width / w, height / h);
  }
  void scale(float factor, float focusX, float focusY) {
    float next = Math.max(1, Math.min(8, zoom * factor));
    float ratio = next / zoom;
    x = (focusX - width / 2) - (focusX - width / 2 - x) * ratio;
    y = (focusY - height / 2) - (focusY - height / 2 - y) * ratio;
    zoom = next;
    clamp();
  }
  void pan(float dx, float dy) {
    x += dx;
    y += dy;
    clamp();
  }
  void rotate() {
    rotation = (rotation + 90) % 360;
    x = y = 0;
    clamp();
  }
  void reset() {
    zoom = 1;
    x = y = 0;
    rotation = 0;
  }
  private void clamp() {
    float w = (rotation % 180 == 0 ? imageWidth : imageHeight) * fit() * zoom,
          h = (rotation % 180 == 0 ? imageHeight : imageWidth) * fit() * zoom;
    float maxX = alignment ? width : Math.max(0, (w - width) / 2),
          maxY = alignment ? height : Math.max(0, (h - height) / 2);
    x = Math.max(-maxX, Math.min(maxX, x));
    y = Math.max(-maxY, Math.min(maxY, y));
  }
}

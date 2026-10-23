package com.yardimciasistan.dealer;

import java.util.function.BooleanSupplier;

/** Bounded local pixel presets; input pixels are always immutable. */
final class DealerPhotoPixels {
  enum Mode {
    NORMAL("Normal"),
    DETAIL("Detay"),
    CODE("Kod okuma"),
    NEGATIVE("Negatif"),
    EDGE("Kenar");
    final String label;
    Mode(String label) {
      this.label = label;
    }
  }
  static int sample(int width, int height, int edge) {
    if (width < 1 || height < 1 || edge < 1 || (long) width * height > 100_000_000L)
      throw new IllegalArgumentException("Fotoğraf boyutu desteklenmiyor.");
    int sample = 1;
    while ((width + sample - 1) / sample > edge || (height + sample - 1) / sample > edge)
      sample *= 2;
    return sample;
  }
  static int[] apply(int[] source, int width, int height, Mode mode, BooleanSupplier cancelled) {
    if (width < 1 || height < 1 || (long) width * height != source.length)
      throw new IllegalArgumentException("Geçersiz fotoğraf.");
    if (mode == Mode.NORMAL)
      return source;
    int[] output = new int[source.length];
    for (int y = 0; y < height; y++) {
      if (cancelled.getAsBoolean())
        throw new java.util.concurrent.CancellationException();
      for (int x = 0; x < width; x++) {
        int i = y * width + x, p = source[i], a = p & 0xff000000, r = p >> 16 & 255,
            g = p >> 8 & 255, b = p & 255;
        switch (mode) {
          case NEGATIVE:
            r = 255 - r;
            g = 255 - g;
            b = 255 - b;
            break;
          case CODE:
            r = g = b = clip((luma(p) - 128) * 1.75 + 128);
            break;
          case DETAIL:
            int left = source[y * width + Math.max(0, x - 1)],
                right = source[y * width + Math.min(width - 1, x + 1)],
                top = source[Math.max(0, y - 1) * width + x],
                bottom = source[Math.min(height - 1, y + 1) * width + x];
            r = detail(r, left >> 16 & 255, right >> 16 & 255, top >> 16 & 255, bottom >> 16 & 255);
            g = detail(g, left >> 8 & 255, right >> 8 & 255, top >> 8 & 255, bottom >> 8 & 255);
            b = detail(b, left & 255, right & 255, top & 255, bottom & 255);
            break;
          case EDGE:
            int x0 = Math.max(0, x - 1), x1 = Math.min(width - 1, x + 1), y0 = Math.max(0, y - 1),
                y1 = Math.min(height - 1, y + 1);
            int tl = luma(source[y0 * width + x0]), tr = luma(source[y0 * width + x1]),
                bl = luma(source[y1 * width + x0]), br = luma(source[y1 * width + x1]);
            int gx = -tl + tr - 2 * luma(source[y * width + x0]) + 2 * luma(source[y * width + x1])
                - bl + br;
            int gy = -tl - 2 * luma(source[y0 * width + x]) - tr + bl
                + 2 * luma(source[y1 * width + x]) + br;
            r = g = b = clip(Math.hypot(gx, gy) * .75);
            break;
          default:
            break;
        }
        output[i] = a | (r << 16) | (g << 8) | b;
      }
    }
    return output;
  }
  private static int detail(int center, int a, int b, int c, int d) {
    double sharpened = 1.8 * center - .2 * (a + b + c + d);
    double contrasted = (sharpened - 128) * 1.08 + 128;
    return clip(contrasted + 18 * Math.pow(1 - Math.max(0, Math.min(255, contrasted)) / 255, 2));
  }
  private static int luma(int p) {
    return ((p >> 16 & 255) * 77 + (p >> 8 & 255) * 150 + (p & 255) * 29) >> 8;
  }
  private static int clip(double value) {
    return (int) Math.round(Math.max(0, Math.min(255, value)));
  }
}

package com.yardimciasistan.android;

/** Logical dp gesture arbitration, independent of Android event dispatch. */
final class AndroidRootSwipeRules {
  private float startX, startY;
  private boolean blocked = true;
  private int direction;

  void begin(float x, float y, boolean eligible) {
    startX = x; startY = y; blocked = !eligible; direction = 0;
  }

  int move(float x, float y, int pointers) {
    if (pointers != 1) cancel();
    if (blocked) return 0;
    float dx = x - startX, dy = y - startY;
    if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { cancel(); return 0; }
    direction = Math.abs(dx) >= 68 && Math.abs(dx) >= Math.abs(dy) * 1.4f ? (dx < 0 ? 1 : -1) : 0;
    return direction;
  }

  void cancel() { blocked = true; direction = 0; }
  int finish() { int result = blocked ? 0 : direction; cancel(); return result; }

  static boolean usesRail(int widthDp, int heightDp) {
    return widthDp >= 840 && widthDp > heightDp;
  }
}

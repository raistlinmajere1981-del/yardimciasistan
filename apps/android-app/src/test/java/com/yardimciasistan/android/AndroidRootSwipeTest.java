package com.yardimciasistan.android;

import static org.junit.Assert.*;
import org.junit.Test;

public final class AndroidRootSwipeTest {
  @Test public void deliberateSingleFingerHorizontalGestureNeedsDistanceAndDirectionRatio() {
    AndroidRootSwipeRules rules = new AndroidRootSwipeRules();
    rules.begin(200, 200, true); assertEquals(0, rules.move(133, 200, 1));
    assertEquals(1, rules.move(132, 240, 1)); assertEquals(1, rules.finish());
    rules.begin(100, 200, true); assertEquals(-1, rules.move(190, 240, 1)); assertEquals(-1, rules.finish());
    rules.begin(200, 200, true); assertEquals(0, rules.move(130, 255, 1)); assertEquals(0, rules.finish());
  }
  @Test public void verticalScrollLocksGestureForTheWholeSequence() {
    AndroidRootSwipeRules rules = new AndroidRootSwipeRules();
    rules.begin(200, 200, true); assertEquals(0, rules.move(195, 230, 1));
    assertEquals(0, rules.move(20, 230, 1)); assertEquals(0, rules.finish());
  }
  @Test public void excludedStartMultiTouchAndSystemCancellationCannotNavigate() {
    AndroidRootSwipeRules rules = new AndroidRootSwipeRules();
    rules.begin(200, 200, false); assertEquals(0, rules.move(10, 200, 1)); assertEquals(0, rules.finish());
    rules.begin(200, 200, true); assertEquals(0, rules.move(10, 200, 2)); assertEquals(0, rules.move(10, 200, 1));
    rules.begin(200, 200, true); assertEquals(1, rules.move(10, 200, 1)); rules.cancel(); assertEquals(0, rules.finish());
  }
  @Test public void returningToOriginDoesNotCompleteAnAbandonedSwipe() {
    AndroidRootSwipeRules rules = new AndroidRootSwipeRules();
    rules.begin(200, 200, true); assertEquals(1, rules.move(100, 200, 1));
    assertEquals(0, rules.move(180, 200, 1)); assertEquals(0, rules.finish());
  }
  @Test public void layoutUsesAvailableWindowWidthRatherThanDeviceOrOrientationAlone() {
    assertFalse(AndroidRootSwipeRules.usesRail(360, 640)); assertFalse(AndroidRootSwipeRules.usesRail(393, 700));
    assertFalse(AndroidRootSwipeRules.usesRail(700, 400)); assertFalse(AndroidRootSwipeRules.usesRail(839, 400));
    assertFalse(AndroidRootSwipeRules.usesRail(900, 1200));
    assertTrue(AndroidRootSwipeRules.usesRail(840, 600)); assertTrue(AndroidRootSwipeRules.usesRail(1280, 800));
  }
}

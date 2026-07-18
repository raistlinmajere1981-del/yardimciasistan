package com.yardimciasistan.android;

public final class StockRulesSmoke {
  private StockRulesSmoke() {}

  public static void main(String[] args) {
    OperationData data = new OperationData();
    assertTrue(data.hasPermission("menu.stock_view"), "default service staff should see tracked stock");
    assertFalse(data.hasPermission("menu.stock_update"), "default service staff must not update stock manually");

    OperationData.MenuItem untracked = new OperationData.MenuItem();
    untracked.id = "untracked";
    untracked.stockQuantity = null;
    assertFalse(untracked.outOfStock(), "null stock means tracking is disabled");

    OperationData.MenuItem zero = new OperationData.MenuItem();
    zero.id = "zero";
    zero.stockQuantity = 0d;
    assertTrue(zero.outOfStock(), "zero stock must remain tracked and out of stock");

    OperationData.MenuItem stocked = new OperationData.MenuItem();
    stocked.id = "stocked";
    stocked.stockQuantity = 100d;
    assertFalse(stocked.outOfStock(), "positive stock should be orderable");
    data.menuItems.add(zero);
    assertSame(zero, data.menuItemById("zero"), "order screen lookup should resolve stock-aware menu items");

    OperationData.TrackedStockItem out = stock("out", 0d, 2d);
    OperationData.TrackedStockItem low = stock("low", 2d, 2d);
    OperationData.TrackedStockItem in = stock("in", 100d, 2d);
    assertEquals("out_of_stock", out.derivedStatus(), "zero stock status");
    assertEquals("low_stock", low.derivedStatus(), "minimum threshold status");
    assertEquals("in_stock", in.derivedStatus(), "positive stock status");
    data.trackedStockItems.add(low);
    assertSame(low, data.trackedStockByMenuItemId("low"), "tracked stock list lookup");

    data.permissions.add("menu.stock_update");
    assertTrue(data.hasPermission("menu.stock_update"), "explicit update permission should enable manual stock actions");
    System.out.println("stock-rules-smoke-ok");
  }

  private static OperationData.TrackedStockItem stock(String id, double quantity, Double minimum) {
    OperationData.TrackedStockItem item = new OperationData.TrackedStockItem();
    item.menuItemId = id;
    item.stockQuantity = quantity;
    item.stockMinQuantity = minimum;
    return item;
  }

  private static void assertTrue(boolean value, String message) {
    if (!value) throw new AssertionError(message);
  }

  private static void assertFalse(boolean value, String message) {
    assertTrue(!value, message);
  }

  private static void assertEquals(Object expected, Object actual, String message) {
    if (expected == null ? actual != null : !expected.equals(actual)) {
      throw new AssertionError(message + ": expected=" + expected + " actual=" + actual);
    }
  }

  private static void assertSame(Object expected, Object actual, String message) {
    if (expected != actual) {
      throw new AssertionError(message);
    }
  }
}

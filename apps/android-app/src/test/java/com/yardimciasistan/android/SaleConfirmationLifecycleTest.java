package com.yardimciasistan.android;

import static org.junit.Assert.*;
import org.junit.Test;

public final class SaleConfirmationLifecycleTest {
  @Test public void submitConsumesIdButKeepsGenerationDuringAction() {
    SaleConfirmationLifecycle lifecycle = new SaleConfirmationLifecycle();
    long id = lifecycle.open();
    assertTrue(lifecycle.submit(id, () -> {
      assertEquals(id, lifecycle.generation());
      assertFalse(lifecycle.submit(id, () -> fail("reentrant submission")));
      lifecycle.dismiss(id);
      assertEquals(id, lifecycle.generation());
    }));
    assertTrue(lifecycle.generation() > id);
    assertFalse(lifecycle.submit(id, () -> fail()));
  }

  @Test public void throwingActionStillInvalidatesConfirmation() {
    SaleConfirmationLifecycle lifecycle = new SaleConfirmationLifecycle();
    long id = lifecycle.open();
    try { lifecycle.submit(id, () -> { assertEquals(id, lifecycle.generation()); throw new IllegalStateException(); }); fail(); }
    catch (IllegalStateException expected) {}
    assertTrue(lifecycle.generation() > id);
    assertFalse(lifecycle.submit(id, () -> fail()));
  }

  @Test public void newConfirmationCannotSubmitReentrantly() {
    SaleConfirmationLifecycle lifecycle = new SaleConfirmationLifecycle();
    long id = lifecycle.open();
    assertTrue(lifecycle.submit(id, () -> {
      long nested = lifecycle.open();
      assertFalse(lifecycle.submit(nested, () -> fail("nested confirmation")));
    }));
  }
  @Test public void onlyCurrentShowingConfirmationSubmitsOnce() {
    SaleConfirmationLifecycle lifecycle = new SaleConfirmationLifecycle();
    int[] calls = {0};
    long first = lifecycle.open();
    assertTrue(lifecycle.isShowing(first));
    lifecycle.dismiss(first);
    assertFalse(lifecycle.isShowing(first));
    assertFalse(lifecycle.submit(first, () -> calls[0]++));
    long second = lifecycle.open();
    assertFalse(lifecycle.submit(first, () -> calls[0]++));
    assertTrue(lifecycle.submit(second, () -> calls[0]++));
    assertFalse(lifecycle.submit(second, () -> calls[0]++));
    assertEquals(1, calls[0]);
  }

  @Test public void checkoutWiresDismissNavigationAndForegroundInvalidation() throws Exception {
    java.nio.file.Path root = java.nio.file.Paths.get("src/main/java/com/yardimciasistan/android");
    String flow = new String(java.nio.file.Files.readAllBytes(root.resolve("MarketCheckoutFlow.java")), java.nio.charset.StandardCharsets.UTF_8);
    String form = new String(java.nio.file.Files.readAllBytes(root.resolve("MarketFormUi.java")), java.nio.charset.StandardCharsets.UTF_8);
    String workspace = new String(java.nio.file.Files.readAllBytes(root.resolve("MarketWorkspace.java")), java.nio.charset.StandardCharsets.UTF_8);
    String activity = new String(java.nio.file.Files.readAllBytes(root.resolve("MainActivity.java")), java.nio.charset.StandardCharsets.UTF_8);
    assertTrue(flow.contains("saleLifecycle.submit(confirmationId"));
    assertTrue(flow.contains("saleLifecycle.dismiss(confirmationId)"));
    assertTrue(form.contains("dialog.setOnDismissListener"));
    assertTrue(workspace.contains("!observedSnapshotVersion.equals(nextSnapshotVersion)"));
    assertTrue(workspace.contains("if (!next.equals(screen)) {"));
    assertTrue(workspace.contains("checkout.invalidateSale();"));
    assertTrue(activity.contains("marketWorkspace.invalidateSaleLifecycle()"));
    assertFalse(flow.contains("fetchCustomerSalePreview("));
  }

  @Test public void invalidationAndOldDismissalCannotAffectNewConfirmation() {
    SaleConfirmationLifecycle lifecycle = new SaleConfirmationLifecycle();
    long first = lifecycle.open(), before = lifecycle.generation();
    lifecycle.invalidate(); assertTrue(lifecycle.generation() > before);
    assertFalse(lifecycle.submit(first, () -> fail()));
    long second = lifecycle.open(); lifecycle.dismiss(first);
    assertTrue(lifecycle.submit(second, () -> {}));
  }
}

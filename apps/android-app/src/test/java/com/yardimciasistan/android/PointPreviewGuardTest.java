package com.yardimciasistan.android;

import static org.junit.Assert.*;
import org.junit.Test;

public final class PointPreviewGuardTest {
  private ConnectionSettings.LocalConnection pairing(String token) {
    return new ConnectionSettings.LocalConnection("desktop-12345678-1234-1234-1234-123456789abc",
        "https://192.168.1.2:3456", token, "target", "", LocalTlsTestCertificates.pin("leaf"));
  }

  @Test public void onlyCurrentPairedCapabilityAndDialogCanReceiveResult() {
    String token = "yal_" + String.join("", java.util.Collections.nCopies(64, "a"));
    ConnectionSettings.LocalConnection paired = pairing(token);
    assertFalse(PointPreviewGuard.available(ConnectionSettings.LocalConnection.empty(), true, true));
    assertFalse(PointPreviewGuard.available(paired, false, true));
    assertFalse(PointPreviewGuard.available(paired, true, false));
    assertTrue(PointPreviewGuard.available(paired, true, true));
    PointPreviewGuard guard = new PointPreviewGuard(paired, true, "target", "customer", 3);
    assertTrue(guard.matches(paired, true, "target", "customer", 3, true, true));
    assertFalse(guard.matches(pairing("yal_" + String.join("", java.util.Collections.nCopies(64, "b"))), true, "target", "customer", 3, true, true));
    assertFalse(guard.matches(paired, false, "target", "customer", 3, true, true));
    assertFalse(guard.matches(paired, true, "other", "customer", 3, true, true));
    assertFalse(guard.matches(paired, true, "target", "other", 3, true, true));
    assertFalse(guard.matches(paired, true, "target", "customer", 4, true, true));
    assertFalse(guard.matches(paired, true, "target", "customer", 3, false, true));
    assertFalse(guard.matches(paired, true, "target", "customer", 3, true, false));
  }

  @Test public void customerActionIsExplicitAndPreviewStaysOutOfPersistence() throws Exception {
    java.nio.file.Path source = java.nio.file.Paths.get("src/main/java/com/yardimciasistan/android");
    String dialog = new String(java.nio.file.Files.readAllBytes(source.resolve("CustomerDetailDialog.java")), java.nio.charset.StandardCharsets.UTF_8);
    String activity = new String(java.nio.file.Files.readAllBytes(source.resolve("MainActivity.java")), java.nio.charset.StandardCharsets.UTF_8);
    assertTrue(dialog.contains("listener.canQueryPoints() ? View.VISIBLE : View.GONE"));
    assertTrue(dialog.contains("listener.onQueryPoints(dialog, customer)"));
    int start = activity.indexOf("private void queryCustomerPoints(");
    int end = activity.indexOf("\n  private ", start + 1);
    assertTrue(start >= 0 && end > start);
    String method = activity.substring(start, end);
    assertTrue(method.contains("new String[]{\"TRY\", \"USD\", \"EUR\", \"GBP\"}"));
    assertTrue(method.contains("dialog.isShowing()"));
    assertTrue(method.contains("guard.matches("));
    assertTrue(method.contains("executor.execute("));
    assertTrue(method.contains("fetchPointBalance("));
    assertFalse(method.contains("operationCache"));
    assertFalse(method.contains("actionOutbox"));
    assertFalse(method.contains("preferences.edit("));
  }

  @Test public void salePreviewScopeRejectsChangedLifecyclePairingAndCart() throws Exception {
    String token = "yal_" + String.join("", java.util.Collections.nCopies(64, "a"));
    ConnectionSettings.LocalConnection paired = pairing(token);
    org.json.JSONArray lines = new org.json.JSONArray().put(new org.json.JSONObject().put("productId", "p1").put("quantity", 1));
    MarketSalePreviewGuard guard = new MarketSalePreviewGuard(paired, true, "target", "customer", "cash", "snapshot-1", lines, 3);
    assertTrue(guard.matches(paired, true, "target", "customer", "cash", "snapshot-1", lines, 3, true, true));
    assertFalse(guard.matches(paired, true, "target", "customer", "card", "snapshot-1", lines, 3, true, true));
    assertFalse(guard.matches(paired, true, "target", "customer", "cash", "snapshot-2", lines, 3, true, true));
    assertFalse(guard.matches(paired, true, "target", "customer", "cash", "snapshot-1", new org.json.JSONArray().put(new org.json.JSONObject().put("productId", "p1").put("quantity", 2)), 3, true, true));
    assertFalse(guard.matches(paired, true, "target", "customer", "cash", "snapshot-1", lines, 4, true, true));
    assertFalse(guard.matches(paired, true, "target", "customer", "cash", "snapshot-1", lines, 3, false, true));
    assertFalse(guard.matches(paired, true, "target", "customer", "cash", "snapshot-1", lines, 3, true, false));
    assertFalse(guard.matches(pairing("yal_" + String.join("", java.util.Collections.nCopies(64, "b"))), true, "target", "customer", "cash", "snapshot-1", lines, 3, true, true));
    assertFalse(guard.matches(paired, true, "other", "customer", "cash", "snapshot-1", lines, 3, true, true));
    assertFalse(guard.matches(paired, true, "target", "other", "cash", "snapshot-1", lines, 3, true, true));
    lines.getJSONObject(0).put("quantity", 2);
    assertFalse(guard.matches(paired, true, "target", "customer", "cash", "snapshot-1", lines, 3, true, true));
    MarketSalePreviewGuard missingPairing = new MarketSalePreviewGuard(null, true, "target", "customer", "cash", "snapshot-1", lines, 3);
    assertFalse(missingPairing.matches(paired, true, "target", "customer", "cash", "snapshot-1", lines, 3, true, true));
  }

  @Test public void salePreviewCheckoutUsesScopedApprovalAndPinnedBridge() throws Exception {
    java.nio.file.Path source = java.nio.file.Paths.get("src/main/java/com/yardimciasistan/android");
    String flow = new String(java.nio.file.Files.readAllBytes(source.resolve("MarketCheckoutFlow.java")), java.nio.charset.StandardCharsets.UTF_8);
    String activity = new String(java.nio.file.Files.readAllBytes(source.resolve("MainActivity.java")), java.nio.charset.StandardCharsets.UTF_8);
    assertTrue(flow.contains("onCustomerSalePreviewRequested("));
    assertTrue(flow.contains("approval.isCurrent()"));
    assertTrue(flow.contains("matchesSalePreviewScope(request)"));
    assertTrue(flow.contains("Puan harcama iznini kontrol"));
    assertTrue(flow.contains("saleLifecycle.submit(request.generation"));
    assertTrue(flow.contains("previewPending"));
    assertTrue(flow.contains("if (previewPending != request) return"));
    assertTrue(flow.contains("isSaleConfirmationShowing(request.generation)"));
    assertTrue(flow.contains("preview.getLong(\"subtotalMinor\")"));
    assertTrue(flow.contains("external, approval.preview(), requestedPointsMinor)"));
    assertTrue(flow.indexOf("approval.isCurrent()") != flow.lastIndexOf("approval.isCurrent()"));
    assertFalse(flow.contains("fetchCustomerSalePreview("));
    int start = activity.indexOf("private void requestCustomerSalePreview(");
    int end = activity.indexOf("\n  private ", start + 1);
    assertTrue(start >= 0 && end > start);
    String bridge = activity.substring(start, end);
    assertTrue(bridge.contains("executor.execute("));
    assertTrue(bridge.contains("new LocalDesktopOperationsTransport("));
    assertTrue(bridge.contains("fetchCustomerSalePreview("));
    assertTrue(bridge.contains("runOnUiThread("));
    assertTrue(bridge.contains("guard.matches("));
    assertTrue(bridge.contains("matchesSalePreviewScope("));
    assertTrue(bridge.contains("new SalePreviewApproval("));
    assertTrue(bridge.contains("connectionGeneration == pointConnectionGeneration"));
    assertFalse(bridge.contains("actionOutbox"));
    assertFalse(bridge.contains("HttpURLConnection"));
  }

  @Test public void approvalCopiesPreviewAndRechecksLiveScope() throws Exception {
    org.json.JSONObject preview = new org.json.JSONObject().put("nested", new org.json.JSONObject().put("price", 9));
    boolean[] current = {true};
    SalePreviewApproval approval = new SalePreviewApproval(preview, () -> current[0]);
    preview.getJSONObject("nested").put("price", 1);
    org.json.JSONObject copy = approval.preview();
    assertEquals(9, copy.getJSONObject("nested").getInt("price"));
    copy.getJSONObject("nested").put("price", 2);
    assertEquals(9, approval.preview().getJSONObject("nested").getInt("price"));
    assertTrue(approval.isCurrent());
    current[0] = false;
    assertFalse(approval.isCurrent());
  }

  @Test public void salePreviewRequestCopiesMutableLines() throws Exception {
    org.json.JSONArray lines = new org.json.JSONArray().put(new org.json.JSONObject().put("productId", "p1").put("quantity", 1));
    SalePreviewRequest request = new SalePreviewRequest("customer", "cash", "snapshot", 3, lines);
    lines.getJSONObject(0).put("quantity", 2);
    assertEquals(1, request.lines().getJSONObject(0).getInt("quantity"));
    request.lines().getJSONObject(0).put("quantity", 3);
    assertEquals(1, request.lines().getJSONObject(0).getInt("quantity"));
  }

  @Test public void checkoutSourceInvalidatesPendingAndChecksBeforeDialogAndEnqueue() throws Exception {
    java.nio.file.Path source = java.nio.file.Paths.get("src/main/java/com/yardimciasistan/android");
    String flow = new String(java.nio.file.Files.readAllBytes(source.resolve("MarketCheckoutFlow.java")), java.nio.charset.StandardCharsets.UTF_8);
    String workspace = new String(java.nio.file.Files.readAllBytes(source.resolve("MarketWorkspace.java")), java.nio.charset.StandardCharsets.UTF_8);
    int invalidate = flow.indexOf("void invalidateSale()"), request = flow.indexOf("private void requestCustomerPreview(");
    assertTrue(invalidate >= 0 && request > invalidate);
    String invalidation = flow.substring(invalidate, flow.indexOf("long saleGeneration()", invalidate));
    assertTrue(invalidation.contains("previewPending = null"));
    assertTrue(invalidation.contains("previewButton.setEnabled("));
    String checkout = flow.substring(request);
    int stale = checkout.indexOf("if (previewPending != request) return"), dialog = checkout.indexOf("ui.confirmFinancial(");
    int submit = checkout.indexOf("listener.onSubmit(");
    assertTrue(stale >= 0 && stale < dialog && dialog < submit);
    assertTrue(checkout.contains("if (previewPending != null || feedback.submissionBlocked()) return"));
    assertTrue(checkout.contains("external != saleExternalConfirmed"));
    assertTrue(checkout.contains("approval == null || !approval.isCurrent()"));
    assertTrue(checkout.indexOf("!approval.isCurrent()", dialog) < submit);
    // A renderer-only OperationData replacement must not dismiss the financial
    // confirmation. A genuinely newer snapshot still invalidates it.
    assertTrue(workspace.contains("if (!observedSnapshotVersion.equals(nextSnapshotVersion)) checkout.invalidateSale()"));
    assertFalse(workspace.contains("data != nextData ||"));
    assertTrue(workspace.contains("checkout.invalidateSale();"));
    String form = new String(java.nio.file.Files.readAllBytes(source.resolve("MarketFormUi.java")), java.nio.charset.StandardCharsets.UTF_8);
    assertTrue(form.contains("setPositiveButton(\"Onayla\", null)"));
    assertTrue(form.contains("if (blocked.getAsBoolean())"));
    assertTrue(form.contains("return;"));
    assertTrue(form.contains("dialog.dismiss();"));
  }
}

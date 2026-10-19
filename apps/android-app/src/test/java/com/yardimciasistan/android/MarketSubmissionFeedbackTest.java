package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

public final class MarketSubmissionFeedbackTest {
  private final OperationData[] snapshot = {new OperationData()};
  private int renders;
  private final MarketSubmissionFeedback feedback = new MarketSubmissionFeedback(() -> snapshot[0], new MarketWorkspace.Listener() {
    @Override public boolean onSubmit(String type, JSONObject payload, String accepted, String queued) { throw new AssertionError("feedback must not submit"); }
    @Override public boolean onBarcodeScan(String barcode, JSONObject payload) { throw new AssertionError("feedback must not submit"); }
    @Override public void onProductLookupRequested(String provider, String barcode, boolean images) { throw new AssertionError("feedback must not fetch"); }
    @Override public void onProductImageRequested(String productId, String provider, String imageUrl) { throw new AssertionError("feedback must not fetch"); }
    @Override public void onRenderRequested() { renders++; }
  }, null);

  @Test public void submissionGuardReadsCurrentSnapshotAndIndependentLocalState() {
    feedback.update(0, false); assertFalse(feedback.submissionBlocked());
    snapshot[0] = new OperationData(); snapshot[0].pendingActions = 1;
    assertTrue(feedback.submissionBlocked());
    snapshot[0].pendingActions = 0; feedback.update(1, false); assertTrue(feedback.submissionBlocked());
    feedback.update(0, true); assertTrue(feedback.submissionBlocked());
    feedback.update(-1, false); assertFalse(feedback.submissionBlocked());
  }

  @Test public void onlyMatchingFinancialAcknowledgementChangesPendingPresentation() {
    feedback.onSubmissionAccepted(MarketUiRules.ACTION_SALE, "Bekliyor", "sale-1");
    OperationData.ActionRecord unrelated = new OperationData.ActionRecord();
    unrelated.id = "other"; unrelated.type = MarketUiRules.ACTION_SALE; unrelated.status = "applied";
    snapshot[0].actions.add(unrelated); feedback.update(0, false);
    assertEquals("Bekliyor", feedback.visibleMessage); assertTrue(feedback.visibleMessagePending);
    unrelated.id = "sale-1"; feedback.update(0, false);
    assertEquals("Satış masaüstünde kaydedildi.", feedback.visibleMessage); assertFalse(feedback.visibleMessagePending);
    unrelated.status = "failed"; feedback.update(0, false);
    assertTrue(feedback.visibleMessagePending);
    feedback.onSubmissionQueued(MarketUiRules.ACTION_CREDIT_PAYMENT, "Çevrimdışı");
    unrelated.status = "applied"; feedback.update(0, false);
    assertEquals("Çevrimdışı", feedback.visibleMessage); assertTrue(feedback.visibleMessagePending);
  }

  @Test public void unrelatedActionsDoNotOverwriteMarketFeedbackAndErrorsOnlyRequestRendering() {
    feedback.onSubmissionAccepted(MarketUiRules.ACTION_STOCK_COUNT, "Sayım gönderildi", "count");
    assertFalse(feedback.visibleMessagePending);
    feedback.onSubmissionQueued("table_order_open", "Adisyon");
    assertEquals("Sayım gönderildi", feedback.visibleMessage);
    feedback.showFormError(null);
    assertEquals("Bilgileri kontrol edin.", feedback.formError); assertEquals(1, renders);
  }
}

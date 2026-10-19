package com.yardimciasistan.android;

import android.widget.LinearLayout;
import java.util.function.Supplier;

/** Pending/acknowledgement presentation. Domain submissions still go through Listener. */
final class MarketSubmissionFeedback {
  private final Supplier<OperationData> snapshot;
  private final MarketWorkspace.Listener listener;
  private final MarketFormUi ui;
  String visibleMessage = "";
  boolean visibleMessagePending;
  String formError = "";
  private int localPendingCount;
  private boolean loading;
  String lastFinancialActionId = "";
  MarketSubmissionFeedback(Supplier<OperationData> snapshot, MarketWorkspace.Listener listener, MarketFormUi ui) {
    this.snapshot = snapshot; this.listener = listener; this.ui = ui;
  }
  void update(int pending, boolean loading) {
    this.localPendingCount = Math.max(0, pending);
    this.loading = loading;
    for (OperationData.ActionRecord action : snapshot.get().actions) {
      if (action.id.equals(lastFinancialActionId)) {
        visibleMessage = MarketUiRules.financialFeedback(action.type, action.status);
        visibleMessagePending = !"applied".equals(action.status);
      }
    }
  }
  void addPendingState(LinearLayout page) {
    String outboxState = MarketUiRules.pendingStatus(localPendingCount, snapshot.get().pendingActions);
    if (!outboxState.isEmpty()) {
      page.addView(ui.messageCard(outboxState, true));
    }
    if (!visibleMessage.isEmpty() && !visibleMessage.equals(outboxState)) {
      page.addView(ui.messageCard(visibleMessage, visibleMessagePending));
    }
  }

  void addFormError(LinearLayout page) {
    if (!formError.isEmpty()) {
      page.addView(ui.messageCard(formError, true));
    }
  }

  void showFormError(String message) {
    formError = message == null ? "Bilgileri kontrol edin." : message;
    listener.onRenderRequested();
  }

  boolean submissionBlocked() {
    return loading || localPendingCount > 0 || snapshot.get().pendingActions > 0;
  }

  void onSubmissionAccepted(String actionType, String message, String actionId) {
    if (MarketUiRules.requiredPermissionForAction(actionType) == null) return;
    visibleMessage = message;
    visibleMessagePending = MarketUiRules.ACTION_SALE.equals(actionType) || MarketUiRules.ACTION_CREDIT_PAYMENT.equals(actionType);
    lastFinancialActionId = visibleMessagePending ? actionId : "";
  }

  void onSubmissionQueued(String actionType, String message) {
    if (MarketUiRules.requiredPermissionForAction(actionType) == null) return;
    visibleMessage = message;
    visibleMessagePending = true;
    lastFinancialActionId = "";
  }

}

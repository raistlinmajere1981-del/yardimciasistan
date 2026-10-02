package com.yardimciasistan.android;

import android.view.View;
import android.widget.ScrollView;

import androidx.activity.ComponentActivity;

final class AndroidTodayCoordinator {
  interface Listener {
    void openRoute(String route);
    int localPendingActionCount();
  }

  private final ComponentActivity activity;
  private final AndroidOperationCards cards;
  private final Listener listener;

  AndroidTodayCoordinator(
      ComponentActivity activity,
      AndroidOperationCards cards,
      Listener listener
  ) {
    this.activity = activity;
    this.cards = cards;
    this.listener = listener;
  }

  View build(OperationData data, int bottomPaddingDp) {
    return new TodayWorkspace(
        activity,
        data,
        new TodayWorkspace.Listener() {
          @Override
          public View requestCard(OperationData.RequestRecord request) {
            return cards.todayRequestCard(request);
          }

          @Override
          public View reservationCard(OperationData.ReservationRecord reservation) {
            return cards.reservationCard(reservation);
          }

          @Override
          public View orderCard(OperationData.TableOrder order) {
            return cards.activeOrderCard(order);
          }

          @Override
          public View tableCard(OperationData.TableRecord table) {
            return cards.tableCard(table);
          }

          @Override
          public View taskCard(OperationData.TaskRecord task) {
            return cards.taskCard(task, true);
          }

          @Override
          public View stockCard(OperationData.TrackedStockItem item) {
            return cards.priorityStockCard(item);
          }

          @Override
          public View actionCard(OperationData.ActionRecord action) {
            return cards.actionCard(action);
          }

          @Override
          public void openRoute(String route) {
            listener.openRoute(route);
          }

          @Override
          public ScrollView wrap(View page) {
            return UiKit.scroll(activity, page, bottomPaddingDp);
          }

          @Override
          public int localPendingActionCount() {
            return listener.localPendingActionCount();
          }
        }
    ).build();
  }
}

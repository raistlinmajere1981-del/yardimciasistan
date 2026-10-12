package com.yardimciasistan.android;

import android.view.View;
import android.widget.ScrollView;

import androidx.activity.ComponentActivity;

final class AndroidTodayCoordinator {
  interface Listener {
    void openRoute(String route);
    void render();
    int localPendingActionCount();
  }

  private final ComponentActivity activity;
  private final AndroidOperationCards cards;
  private final Listener listener;
  private String mode = "";
  private String source = CompanionUiRules.ALL;
  private String notice = "";

  AndroidTodayCoordinator(
      ComponentActivity activity,
      AndroidOperationCards cards,
      Listener listener
  ) {
    this.activity = activity;
    this.cards = cards;
    this.listener = listener;
  }

  void applyDestination(OperationData data, AndroidUiRules.Destination destination) {
    if (!AndroidUiRules.TAB_TODAY.equals(destination.tab)) return;
    mode = CompanionUiRules.canOpen(data, destination.mode) ? destination.mode : "";
    notice = CompanionUiRules.isMode(destination.mode) && mode.isEmpty() ? "Bu cihazın bu görünüm için yetkisi yok." : "";
    source = CompanionUiRules.ALL;
  }

  void normalize(OperationData data) {
    data.companion.redact(data);
    if (!mode.isEmpty() && !CompanionUiRules.canOpen(data, mode)) {
      mode = "";
      notice = "Bu görünümün izni kaldırıldı veya işletme yeteneği kapatıldı.";
    }
    if (!CompanionUiRules.sourceFilterAvailable(data, source)) source = CompanionUiRules.ALL;
  }

  boolean handleBack() {
    if (mode.isEmpty()) return false;
    mode = "";
    notice = "";
    source = CompanionUiRules.ALL;
    return true;
  }

  String title() { return CompanionUiRules.title(mode); }
  boolean isCompanionViewOpen() { return !mode.isEmpty(); }
  String screenKey() { return "today:" + mode + ":" + source + (notice.isEmpty() ? "" : ":denied"); }

  View build(OperationData data, int bottomPaddingDp, boolean loading, boolean syncFailed) {
    if (!mode.isEmpty()) {
      return new CompanionWorkspace(activity, data, new CompanionWorkspace.Listener() {
        @Override public void openRoute(String route) { listener.openRoute(route); }
        @Override public void selectSource(String selected) {
          if (!CompanionUiRules.sourceFilterAvailable(data, selected)) return;
          source = selected;
          listener.render();
        }
      }).build(mode, source, loading, syncFailed, data.pendingActions + listener.localPendingActionCount(), bottomPaddingDp);
    }
    return new TodayWorkspace(
        activity,
        data,
        notice,
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

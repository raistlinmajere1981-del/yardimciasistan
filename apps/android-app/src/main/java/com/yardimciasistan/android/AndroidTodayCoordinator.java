package com.yardimciasistan.android;

import android.view.View;
import android.widget.ScrollView;

import androidx.activity.ComponentActivity;
import org.json.JSONObject;
import java.util.List;

final class AndroidTodayCoordinator {
  interface Listener {
    void openRoute(String route);
    void render();
    int localPendingActionCount();
    List<ActionOutbox.PendingAction> localActions();
    void confirmDecision(String type, String orderId, Runnable action);
    void sendDecision(String type, JSONObject payload);
    void openTracking(String url);
    void dial(String phone);
  }

  private final ComponentActivity activity;
  private final AndroidOperationCards cards;
  private final Listener listener;
  private String mode = "";
  private String source = CompanionUiRules.ALL;
  private String notice = "";
  private String permissionNoticeMode = "";
  private String orderId = "";

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
    permissionNoticeMode = "";
    source = CompanionUiRules.ALL;
    orderId = "";
  }

  void normalize(OperationData data) {
    data.companion.redact(data);
    if (!mode.isEmpty() && !CompanionUiRules.canOpen(data, mode)) {
      permissionNoticeMode = mode;
      mode = "";
      notice = "Bu görünümün izni kaldırıldı veya işletme yeteneği kapatıldı.";
      orderId = "";
    } else if (!permissionNoticeMode.isEmpty() && CompanionUiRules.canOpen(data, permissionNoticeMode)) {
      permissionNoticeMode = "";
      notice = "";
    }
    if (!orderId.isEmpty() && data.companion.orderById(orderId) == null) {
      orderId = "";
      permissionNoticeMode = "";
      notice = "Sipariş bu eşitlemede görüntülenemiyor.";
    }
    if (!CompanionUiRules.sourceFilterAvailable(data, source)) source = CompanionUiRules.ALL;
  }

  boolean handleBack() {
    if (!orderId.isEmpty()) { orderId = ""; return true; }
    if (mode.isEmpty()) return false;
    mode = "";
    notice = "";
    permissionNoticeMode = "";
    source = CompanionUiRules.ALL;
    return true;
  }

  String title() { return orderId.isEmpty() ? CompanionUiRules.title(mode) : "Sipariş ayrıntısı"; }
  boolean isCompanionViewOpen() { return !mode.isEmpty(); }
  boolean isOrderDetailOpen() { return !orderId.isEmpty(); }
  String mode() { return mode; }
  String screenKey() { return "today:" + mode + ":" + source + ":" + orderId + (notice.isEmpty() ? "" : ":denied"); }

  void openOrder(OperationData data, String id) {
    if (!CompanionUiRules.canOpen(data, mode) || data.companion.orderById(id) == null) return;
    orderId = id; notice = ""; permissionNoticeMode = "";
  }

  View build(OperationData data, int bottomPaddingDp, boolean loading, boolean syncFailed) {
    if (!mode.isEmpty()) {
      return new CompanionWorkspace(activity, data, new CompanionWorkspace.Listener() {
        @Override public void openRoute(String route) { listener.openRoute(route); }
        @Override public void selectSource(String selected) {
          if (!CompanionUiRules.sourceFilterAvailable(data, selected)) return;
          source = selected;
          orderId = ""; notice = "";
          listener.render();
        }
        @Override public void openOrder(String id) { AndroidTodayCoordinator.this.openOrder(data, id); listener.render(); }
        @Override public void backToList() { orderId = ""; listener.render(); }
        @Override public void decide(CompanionData.Order order, String type) {
          if (!CompanionUiRules.canDecide(data, order, type, listener.localActions())) return;
          try {
            JSONObject payload = CompanionUiRules.decisionPayload(order);
            listener.confirmDecision(type, order.id, () -> listener.sendDecision(type, payload));
          } catch (org.json.JSONException ignored) { /* No action can be sent with an incomplete precondition. */ }
        }
        @Override public void openTracking(String url) { listener.openTracking(url); }
        @Override public void dial(String phone) { listener.dial(phone); }
      }).build(mode, source, orderId, loading, syncFailed, data.pendingActions + listener.localPendingActionCount(),
          listener.localActions(), notice, bottomPaddingDp);
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

package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.app.Dialog;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

final class AndroidMutationDialogCoordinator {
  interface Listener {
    void updateRoom(OperationData.RoomRecord room, String status);
    void updateTable(OperationData.TableRecord table, String status);
    void sendAction(String actionType, JSONObject payload, String successMessage);
    void configureBottomDialog(Dialog dialog);
    AlertDialog.Builder alertDialogBuilder();
  }

  private final ComponentActivity activity;
  private final Listener listener;

  AndroidMutationDialogCoordinator(
      ComponentActivity activity,
      Listener listener
  ) {
    this.activity = activity;
    this.listener = listener;
  }

  void showRoomStatus(OperationData.RoomRecord room) {
    OperationMutationDialogs.showRoomStatus(
        activity,
        room,
        operationListener()
    );
  }

  void showTableStatus(OperationData data, OperationData.TableRecord table) {
    OperationMutationDialogs.showTableStatus(
        activity,
        data,
        table,
        operationListener()
    );
  }

  void showStockActions(OperationData.TrackedStockItem item) {
    OperationMutationDialogs.showStockActions(
        activity,
        item,
        operationListener()
    );
  }

  private OperationMutationDialogs.Listener operationListener() {
    return new OperationMutationDialogs.Listener() {
      @Override
      public void updateRoom(OperationData.RoomRecord selected, String status) {
        listener.updateRoom(selected, status);
      }

      @Override
      public void updateTable(OperationData.TableRecord selected, String status) {
        listener.updateTable(selected, status);
      }

      @Override
      public void sendAction(
          String actionType,
          JSONObject actionPayload,
          String successMessage
      ) {
        listener.sendAction(actionType, actionPayload, successMessage);
      }

      @Override
      public void configureBottomDialog(Dialog dialog) {
        listener.configureBottomDialog(dialog);
      }

      @Override
      public AlertDialog.Builder alertDialogBuilder() {
        return listener.alertDialogBuilder();
      }
    };
  }
}

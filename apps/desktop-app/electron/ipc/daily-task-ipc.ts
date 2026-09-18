import { ipcMain } from "electron";
import type {
  DesktopDatabase,
  DesktopStatusUpdateResult,
  SaveDailyTaskInput,
  UpdateDailyTaskStatusInput
} from "../database";

export function registerDailyTaskIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertTaskScope: (
    taskType: string,
    relatedType?: string,
    relatedReservationType?: string,
    relatedReservationRoomIds?: readonly unknown[],
    relatedReservationTableIds?: readonly unknown[]
  ) => void;
  finalizeOperationMutation: (result: DesktopStatusUpdateResult) => DesktopStatusUpdateResult;
}) {
  const { getDatabase, assertTaskScope, finalizeOperationMutation } = options;

  ipcMain.handle("dailyTask:save", (_event, input: SaveDailyTaskInput): DesktopStatusUpdateResult => {
    const dashboard = getDatabase().getDashboardData();
    const existingTask = input?.id
      ? dashboard.dailyTasks.find((item) => item.id === String(input.id))
      : undefined;
    const existingReservation = existingTask?.relatedType === "reservation"
      ? dashboard.reservations.find((reservation) => reservation.id === existingTask.relatedId)
      : undefined;
    if (existingTask) {
      assertTaskScope(
        existingTask.taskType,
        existingTask.relatedType,
        existingReservation?.reservationType ?? "",
        existingReservation?.roomIds,
        existingReservation?.tableIds
      );
    }
    assertTaskScope(String(input?.taskType ?? ""));
    return finalizeOperationMutation(getDatabase().saveDailyTask(input));
  });

  ipcMain.handle("dailyTask:delete", (_event, taskId: unknown): DesktopStatusUpdateResult => {
    const dashboard = getDatabase().getDashboardData();
    const task = dashboard.dailyTasks.find((item) => item.id === String(taskId ?? ""));
    const reservation = task?.relatedType === "reservation"
      ? dashboard.reservations.find((item) => item.id === task.relatedId)
      : undefined;
    assertTaskScope(
      task?.taskType ?? "",
      task?.relatedType ?? "",
      reservation?.reservationType ?? "",
      reservation?.roomIds,
      reservation?.tableIds
    );
    return finalizeOperationMutation(getDatabase().deleteDailyTask(String(taskId ?? "")));
  });

  ipcMain.handle("dailyTask:updateStatus", (_event, input: UpdateDailyTaskStatusInput): DesktopStatusUpdateResult => {
    const dashboard = getDatabase().getDashboardData();
    const task = dashboard.dailyTasks.find((item) => item.id === String(input?.taskId ?? ""));
    const reservation = task?.relatedType === "reservation"
      ? dashboard.reservations.find((item) => item.id === task.relatedId)
      : undefined;
    assertTaskScope(
      task?.taskType ?? "",
      task?.relatedType ?? "",
      reservation?.reservationType ?? "",
      reservation?.roomIds,
      reservation?.tableIds
    );
    return getDatabase().updateDailyTaskStatus(input);
  });
}

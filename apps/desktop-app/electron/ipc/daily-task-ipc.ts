import { ipcMain } from "electron";
import type {
  DesktopDatabase,
  DesktopStatusUpdateResult,
  SaveDailyTaskInput,
  UpdateDailyTaskStatusInput
} from "../database";

export function registerDailyTaskIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
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
    options.assertUnlocked();
    const taskId = String(input?.id ?? "").trim();
    const existingTask = taskId
      ? getDatabase().getDailyTaskById(taskId)
      : undefined;
    // A missing update ID is rejected by the mutation owner, preserving input
    // validation/not-found precedence without falling back to core task scope.
    if (taskId && !existingTask) return finalizeOperationMutation(getDatabase().saveDailyTask(input));
    const existingReservation = existingTask?.relatedType === "reservation"
      ? getDatabase().getReservationById(existingTask.relatedId)
      : undefined;
    if (existingTask?.relatedType === "reservation" && !existingReservation) {
      return { ok: false, message: "Rezervasyon bulunamadı." };
    }
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
    options.assertUnlocked();
    const task = getDatabase().getDailyTaskById(String(taskId ?? ""));
    if (!task) return finalizeOperationMutation(getDatabase().deleteDailyTask(String(taskId ?? "")));
    const reservation = task?.relatedType === "reservation"
      ? getDatabase().getReservationById(task.relatedId)
      : undefined;
    if (task.relatedType === "reservation" && !reservation) return { ok: false, message: "Rezervasyon bulunamadı." };
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
    options.assertUnlocked();
    const task = getDatabase().getDailyTaskById(String(input?.taskId ?? ""));
    if (!task) return getDatabase().updateDailyTaskStatus(input);
    const reservation = task?.relatedType === "reservation"
      ? getDatabase().getReservationById(task.relatedId)
      : undefined;
    if (task.relatedType === "reservation" && !reservation) return { ok: false, message: "Rezervasyon bulunamadı." };
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

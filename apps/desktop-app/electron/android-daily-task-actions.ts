import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";

export type AndroidDailyTaskMutationResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export interface AndroidDailyTaskActionContext {
  db: DatabaseSync;
  action: AndroidSyncAction;
  now: string;
  insertEvent: (type: string, entityId: string, payload: Record<string, unknown>) => void;
}

const MANUAL_TASK_TYPES = new Set(["manual_pension", "manual_restaurant"]);

export function applyAndroidDailyTaskAction(
  context: AndroidDailyTaskActionContext
): AndroidDailyTaskMutationResult {
  const actionType = String(context.action.action_type ?? "").trim();
  if (actionType === "daily_task_create") {
    return saveDailyTask(context, false);
  }
  if (actionType === "daily_task_update") {
    return saveDailyTask(context, true);
  }
  if (actionType === "daily_task_delete") {
    return deleteDailyTask(context);
  }
  return { ok: false, message: "Telefon günlük iş işlem türü desteklenmiyor." };
}

function saveDailyTask(
  context: AndroidDailyTaskActionContext,
  editing: boolean
): AndroidDailyTaskMutationResult {
  const { db, action, now, insertEvent } = context;
  const payload = action.payload;
  const taskId = editing ? text(payload.task_id) : androidEntityId("task_", action.id);
  const existing = editing ? taskRow(db, taskId) : undefined;
  if (editing && !existing) {
    return { ok: false, message: "Düzenlenecek günlük iş masaüstü kayıtlarında bulunamadı." };
  }
  if (existing && !isManualTaskType(existing.task_type)) {
    return { ok: false, message: "Otomatik oluşturulan günlük işler telefondan düzenlenemez." };
  }

  const versionError = editing ? versionConflict(payload, existing?.updated_at, "Günlük iş") : "";
  if (versionError) {
    return { ok: false, message: versionError };
  }

  const requestedTaskType = text(payload.task_type);
  const taskType = editing ? text(existing?.task_type) : requestedTaskType;
  if (!isManualTaskType(taskType)) {
    return { ok: false, message: "Günlük iş alanı pansiyon veya restoran olmalı." };
  }
  if (editing && requestedTaskType && requestedTaskType !== taskType) {
    return { ok: false, message: "Günlük iş alanı düzenleme sırasında değiştirilemez." };
  }

  const title = normalizeTitle(payload.title);
  const description = text(payload.description);
  const dueDate = text(payload.due_date);
  const dueTime = text(payload.due_time);
  const validation = validateTaskInput({ title, description, dueDate, dueTime });
  if (validation) {
    return { ok: false, message: validation };
  }

  const updatedAt = editing ? nextTimestamp(existing?.updated_at, now) : now;
  if (editing) {
    db.prepare(`
      UPDATE daily_tasks
      SET title = ?, description = ?, due_date = ?, due_time = ?,
          updated_at = ?, sync_status = 'local_only'
      WHERE id = ? AND deleted_at = ''
    `).run(title, description, dueDate, dueTime, updatedAt, taskId);
  } else {
    db.prepare(`
      INSERT INTO daily_tasks (
        id, title, description, task_type, status, due_date, due_time,
        related_type, related_id, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, '', '', ?, ?, '', 'local_only')
    `).run(taskId, title, description, taskType, dueDate, dueTime, now, updatedAt);
  }

  insertEvent(editing ? "task.updated" : "task.created", taskId, {
    source: "android",
    title,
    task_type: taskType,
    due_date: dueDate,
    due_time: dueTime
  });
  return {
    ok: true,
    message: editing
      ? "Günlük iş telefondan güncellendi."
      : "Günlük iş telefondan eklendi."
  };
}

function deleteDailyTask(context: AndroidDailyTaskActionContext): AndroidDailyTaskMutationResult {
  const { db, action, now, insertEvent } = context;
  const payload = action.payload;
  const taskId = text(payload.task_id);
  if (!taskId) {
    return { ok: false, message: "Silinecek günlük iş seçilmemiş." };
  }
  const existing = taskRow(db, taskId);
  if (!existing) {
    return { ok: false, message: "Silinecek günlük iş masaüstü kayıtlarında bulunamadı." };
  }
  const taskType = text(existing.task_type);
  if (!isManualTaskType(taskType)) {
    return { ok: false, message: "Otomatik oluşturulan günlük işler silinemez." };
  }
  const requestedTaskType = text(payload.task_type);
  if (requestedTaskType && requestedTaskType !== taskType) {
    return { ok: false, message: "Günlük iş alanı canlı kayıtla eşleşmiyor." };
  }
  const versionError = versionConflict(payload, existing.updated_at, "Günlük iş");
  if (versionError) {
    return { ok: false, message: versionError };
  }

  const updatedAt = nextTimestamp(existing.updated_at, now);
  db.prepare(`
    UPDATE daily_tasks
    SET deleted_at = ?, updated_at = ?, sync_status = 'local_only'
    WHERE id = ? AND deleted_at = ''
  `).run(updatedAt, updatedAt, taskId);
  insertEvent("task.deleted", taskId, {
    source: "android",
    title: text(existing.title),
    task_type: taskType
  });
  return { ok: true, message: "Günlük iş telefondan silindi." };
}

function taskRow(db: DatabaseSync, taskId: string): Record<string, unknown> | undefined {
  if (!taskId) return undefined;
  return db.prepare("SELECT * FROM daily_tasks WHERE id = ? AND deleted_at = ''")
    .get(taskId) as Record<string, unknown> | undefined;
}

function validateTaskInput(input: {
  title: string;
  description: string;
  dueDate: string;
  dueTime: string;
}): string {
  if (!input.title) {
    return "Günlük iş başlığı boş olamaz.";
  }
  if (input.title.length > 160) {
    return "Günlük iş başlığı en fazla 160 karakter olabilir.";
  }
  if (input.description.length > 1000) {
    return "Günlük iş notu en fazla 1000 karakter olabilir.";
  }
  if (input.dueDate && !validDate(input.dueDate)) {
    return "Günlük iş tarihi geçersiz.";
  }
  if (input.dueTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)) {
    return "Günlük iş saati geçersiz.";
  }
  return "";
}

function isManualTaskType(value: unknown): boolean {
  return MANUAL_TASK_TYPES.has(text(value));
}

function normalizeTitle(value: unknown): string {
  return text(value).replace(/\s+/g, " ");
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function versionConflict(payload: Record<string, unknown>, actualValue: unknown, label: string): string {
  const expected = text(payload.expected_updated_at);
  const actual = text(actualValue);
  if (!expected || !actual || expected === actual) return "";
  return `${label} masaüstünde değişmiş. Canlı veriyi yenileyip tekrar deneyin.`;
}

function nextTimestamp(previousValue: unknown, candidateValue: string): string {
  const previous = Date.parse(text(previousValue));
  const candidate = Date.parse(candidateValue);
  if (!Number.isFinite(previous) || !Number.isFinite(candidate) || candidate > previous) {
    return candidateValue;
  }
  return new Date(previous + 1).toISOString();
}

function androidEntityId(prefix: string, actionId: string): string {
  const digest = createHash("sha256").update(actionId).digest("hex").slice(0, 48);
  return `${prefix}android_${digest}`;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

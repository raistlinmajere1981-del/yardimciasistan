import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type {
  DesktopDailyTask,
  SaveDailyTaskInput,
  UpdateDailyTaskStatusInput
} from "../database-types.js";
import { insertDatabaseEvent } from "./event-store.js";
import { normalizeStatus } from "./request-utils.js";

export function getDailyTasks(db: DatabaseSync): DesktopDailyTask[] {
  const rows = db
    .prepare(`
        SELECT
          id,
          title,
          description,
          task_type,
          status,
          due_date,
          due_time,
          related_type,
          related_id,
          updated_at
        FROM daily_tasks
        WHERE deleted_at = ''
        ORDER BY
          CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END ASC,
          due_date ASC,
          due_time ASC,
          created_at DESC
        LIMIT 80
      `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    taskType: String(row.task_type ?? "note"),
    status: String(row.status ?? "pending"),
    dueDate: String(row.due_date ?? ""),
    dueTime: String(row.due_time ?? ""),
    relatedType: String(row.related_type ?? ""),
    relatedId: String(row.related_id ?? ""),
    updatedAt: String(row.updated_at ?? "")
  }));
}

export function saveDailyTask(db: DatabaseSync, input: SaveDailyTaskInput): { ok: true; message: string } | { ok: false; message: string } {
  const taskIdInput = String(input?.id ?? "").trim();
  const title = String(input?.title ?? "").trim().replace(/\s+/g, " ");
  const description = String(input?.description ?? "").trim();
  const taskType = input?.taskType === "manual_pension" || input?.taskType === "manual_restaurant"
    ? input.taskType
    : "";
  const dueDate = String(input?.dueDate ?? "").trim();
  const dueTime = String(input?.dueTime ?? "").trim();

  if (!title) {
    return { ok: false, message: "Günlük iş başlığı boş olamaz." };
  }
  if (title.length > 160) {
    return { ok: false, message: "Günlük iş başlığı en fazla 160 karakter olabilir." };
  }
  if (description.length > 1000) {
    return { ok: false, message: "Günlük iş notu en fazla 1000 karakter olabilir." };
  }
  if (!taskType) {
    return { ok: false, message: "Günlük iş alanı seçilemedi." };
  }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { ok: false, message: "Günlük iş tarihi geçersiz." };
  }
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) {
    return { ok: false, message: "Günlük iş saati geçersiz." };
  }

  const now = new Date().toISOString();
  const taskId = taskIdInput || createId("task_");
  const existing = taskIdInput
    ? db.prepare("SELECT task_type FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as { task_type?: string } | undefined
    : undefined;
  if (taskIdInput && !existing) {
    return { ok: false, message: "Düzenlenecek günlük iş bulunamadı." };
  }
  if (existing && !String(existing.task_type ?? "").startsWith("manual_")) {
    return { ok: false, message: "Otomatik oluşturulan günlük işler yalnız durum işlemleriyle yönetilebilir." };
  }

  db.exec("BEGIN");
  try {
    if (existing) {
      db.prepare(`
          UPDATE daily_tasks
          SET title = ?, description = ?, task_type = ?, due_date = ?, due_time = ?, updated_at = ?, sync_status = 'local_only'
          WHERE id = ? AND deleted_at = ''
        `).run(title, description, taskType, dueDate, dueTime, now, taskId);
    } else {
      db.prepare(`
          INSERT INTO daily_tasks (
            id, title, description, task_type, status, due_date, due_time, related_type, related_id,
            created_at, updated_at, deleted_at, sync_status
          ) VALUES (?, ?, ?, ?, 'pending', ?, ?, '', '', ?, ?, '', 'local_only')
        `).run(taskId, title, description, taskType, dueDate, dueTime, now, now);
    }
    insertDatabaseEvent(db, {
      type: existing ? "task.updated" : "task.created",
      entityType: "daily_task",
      entityId: taskId,
      payload: { title, task_type: taskType, due_date: dueDate, due_time: dueTime },
      now
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Günlük iş kaydedilemedi."
    };
  }

  return {
    ok: true,
    message: existing ? "Günlük iş güncellendi." : "Günlük iş eklendi."
  };
}

export function deleteDailyTask(db: DatabaseSync, taskIdInput: string): { ok: true; message: string } | { ok: false; message: string } {
  const taskId = String(taskIdInput ?? "").trim();
  if (!taskId) {
    return { ok: false, message: "Silinecek günlük iş seçilmeli." };
  }
  const task = db.prepare("SELECT task_type, title FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as { task_type?: string; title?: string } | undefined;
  if (!task) {
    return { ok: false, message: "Günlük iş bulunamadı." };
  }
  if (!String(task.task_type ?? "").startsWith("manual_")) {
    return { ok: false, message: "Otomatik oluşturulan günlük işler silinemez; durumunu tamamlandı veya iptal olarak değiştirin." };
  }

  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE daily_tasks SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(now, now, taskId);
    insertDatabaseEvent(db, {
      type: "task.deleted",
      entityType: "daily_task",
      entityId: taskId,
      payload: { title: String(task.title ?? "") },
      now
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Günlük iş silinemedi."
    };
  }

  return { ok: true, message: "Günlük iş silindi." };
}

export function updateDailyTaskStatus(db: DatabaseSync, input: UpdateDailyTaskStatusInput): { ok: true; message: string } | { ok: false; message: string } {
  const taskId = input.taskId.trim();
  const status = normalizeStatus(input.status, ["pending", "done", "cancelled", "archived"]);
  if (!taskId || !status) {
    return {
      ok: false,
      message: "Günlük iş için geçerli kayıt ve durum seçilmeli."
    };
  }

  const task = db.prepare("SELECT status FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as { status?: string } | undefined;
  if (!task) {
    return {
      ok: false,
      message: "Günlük iş bulunamadı."
    };
  }

  const now = new Date().toISOString();
  const eventType = status === "done" ? "task.completed" : status === "cancelled" ? "task.cancelled" : "task.status_changed";
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE daily_tasks SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, taskId);
    insertDatabaseEvent(db, {
      type: eventType,
      entityType: "daily_task",
      entityId: taskId,
      payload: {
        previous_status: String(task.status ?? ""),
        status
      },
      now
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    message: "Günlük iş durumu güncellendi."
  };
}

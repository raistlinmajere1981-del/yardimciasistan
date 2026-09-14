import { useEffect, useState } from "react";
import { Save, X } from "lucide-react";
import type {
  DesktopDashboardData,
  DesktopStatusUpdateResult,
  SaveDailyTaskInput
} from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";

export type DailyTaskScope = "pension" | "restaurant";

type EditorState = "idle" | "loading" | "error";

interface DailyTaskEditorProps {
  open: boolean;
  scope: DailyTaskScope;
  task: DesktopDashboardData["dailyTasks"][number] | null;
  onClose: () => void;
  onSave: (input: SaveDailyTaskInput) => Promise<DesktopStatusUpdateResult>;
}

interface DailyTaskFormState {
  title: string;
  description: string;
  dueDate: string;
  dueTime: string;
}

function localTodayKey() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function toForm(task: DesktopDashboardData["dailyTasks"][number] | null): DailyTaskFormState {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    dueDate: task?.dueDate || localTodayKey(),
    dueTime: task?.dueTime ?? ""
  };
}

export function DailyTaskEditor({ open, scope, task, onClose, onSave }: DailyTaskEditorProps) {
  const [form, setForm] = useState<DailyTaskFormState>(() => toForm(task));
  const [state, setState] = useState<EditorState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(toForm(task));
    setState("idle");
    setMessage("");
  }, [open, task]);

  if (!open) {
    return null;
  }

  const areaLabel = scope === "pension" ? "Pansiyon" : "Restoran";
  const taskType = scope === "pension" ? "manual_pension" : "manual_restaurant";

  return (
    <div
      className="manual-request-backdrop overlay overlay--drawer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && state !== "loading") onClose();
      }}
    >
      <aside className="manual-request-drawer drawer drawer--scroll" role="dialog" aria-modal="true" aria-labelledby="daily-task-editor-title">
        <header className="manual-request-drawer-header overlay-header overlay-header--sticky">
          <div className="manual-request-heading">
            <p>{areaLabel} günlük işleri</p>
            <h2 id="daily-task-editor-title">{task ? "Günlük işi düzenle" : "Yeni günlük iş ekle"}</h2>
          </div>
          <button
            className="drawer-close-button"
            type="button"
            aria-label="Günlük iş formunu kapat"
            onClick={onClose}
            disabled={state === "loading"}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form
          className="manager-form manual-request-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setState("loading");
            setMessage("Günlük iş kaydediliyor...");
            const result = await onSave({
              id: task?.id,
              title: form.title,
              description: form.description,
              taskType,
              dueDate: form.dueDate,
              dueTime: form.dueTime
            });
            if (!result.ok) {
              setState("error");
              setMessage(result.message);
              return;
            }
            onClose();
          }}
        >
          <div className="manual-request-core-grid">
            <label className="manual-request-note-field">
              İş / not başlığı
              <input
                autoFocus
                required
                maxLength={160}
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder={scope === "pension" ? "Örn. Oda 4 klimayı kontrol et" : "Örn. Akşam servisi için masa düzenini hazırla"}
              />
            </label>
            <label>
              Tarih
              <input
                type="date"
                lang="tr"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
              />
            </label>
            <label>
              Saat
              <input
                type="time"
                value={form.dueTime}
                onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))}
              />
            </label>
            <label className="manual-request-note-field">
              Not
              <textarea
                maxLength={1000}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="İsterseniz kısa bir açıklama ekleyin."
              />
            </label>
          </div>

          {message && <p className={`form-status sync-${state}`}>{message}</p>}

          <div className="manual-request-actions">
            <ActionButton variant="secondary" type="button" onClick={onClose} disabled={state === "loading"}>
              Vazgeç
            </ActionButton>
            <ActionButton type="submit" disabled={state === "loading" || !form.title.trim()}>
              <Save size={16} aria-hidden="true" />
              {state === "loading" ? "Kaydediliyor" : "Kaydet"}
            </ActionButton>
          </div>
        </form>
      </aside>
    </div>
  );
}

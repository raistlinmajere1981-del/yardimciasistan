import type { DesktopDashboardData } from "../../../electron/database";
import { formatDateForDisplay } from "../../app/record-formatters";

export function formatTaskDue(task: DesktopDashboardData["dailyTasks"][number]) {
  return [formatDateForDisplay(task.dueDate), task.dueTime].filter(Boolean).join(" · ") || "Zaman yok";
}

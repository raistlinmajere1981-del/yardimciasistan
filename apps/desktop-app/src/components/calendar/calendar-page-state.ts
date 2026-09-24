import { useState } from "react";

export type CalendarViewMode = "day" | "week";

/** Calendar page context survives ordinary page navigation because the controller lives in DesktopWorkspaceRouter. */
export function useCalendarPageController() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [selectedDate, setSelectedDate] = useState(() => calendarLocalDateKey(new Date()));

  return {
    viewMode,
    setViewMode,
    selectedDate,
    setSelectedDate
  };
}

export function calendarLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

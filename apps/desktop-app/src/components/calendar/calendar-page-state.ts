import { usePageViewState } from "../../app/page-view-state";

export type CalendarViewMode = "day" | "week" | "month";

/** Calendar page context survives ordinary page navigation because the controller lives in DesktopWorkspaceRouter. */
export function useCalendarPageController() {
  const [viewMode, setViewMode] = usePageViewState<CalendarViewMode>("calendar.view", "week");
  const [selectedDate, setSelectedDate] = usePageViewState("calendar.date", () => calendarLocalDateKey(new Date()));

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

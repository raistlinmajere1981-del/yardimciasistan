import { ui, locale } from "./site-language";
export type DatePreset = "today" | "tomorrow" | "custom";

export function readGuestCount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(30, Math.floor(parsed)) : 1;
}

export function addLocalDays(date: Date, amount: number) {
  const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

export function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTurkishMonth(value: Date) {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
    .format(value)
    .replace(/^./u, (letter) => letter.toLocaleUpperCase(locale));
}

export function formatTurkishCalendarDate(value: string) {
  const date = parseLocalIsoDate(value);
  if (!date) {
    return ui("Tarih seç");
  }

  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" as const } : {})
  }).format(date);
}

export function formatDateForRequest(value: string, preset: DatePreset) {
  const calendarDate = formatTurkishCalendarDate(value);
  if (preset === "today") {
    return ui("Bugün, {0}", {0: calendarDate});
  }
  if (preset === "tomorrow") {
    return ui("Yarın, {0}", {0: calendarDate});
  }
  return calendarDate;
}

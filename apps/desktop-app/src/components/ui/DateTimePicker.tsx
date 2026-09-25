import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";

interface DatePickerPreset {
  label: string;
  value: string;
}

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  presets?: DatePickerPreset[];
  clearable?: boolean;
}

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  minuteStep?: number;
  clearable?: boolean;
}

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const DEFAULT_DATE_PRESETS = (): DatePickerPreset[] => [
  { label: "Bugün", value: localDateKey(new Date()) },
  { label: "Yarın", value: addDays(localDateKey(new Date()), 1) }
];

export function DatePicker({
  value,
  onChange,
  ariaLabel,
  disabled = false,
  min,
  max,
  placeholder = "GG.AA.YYYY",
  presets,
  clearable = true
}: DatePickerProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(value || localDateKey(new Date())));
  const position = useAnchoredPopover(open, anchorRef, popoverRef);

  useEffect(() => {
    if (!open) return;
    setVisibleMonth(monthStart(value || localDateKey(new Date())));
  }, [open, value]);

  useDismissPopover(open, setOpen, anchorRef, popoverRef);

  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);
  const quickPresets = presets ?? DEFAULT_DATE_PRESETS();

  const choose = (next: string) => {
    if (next && isDateDisabled(next, min, max)) return;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => anchorRef.current?.focus());
  };

  return (
    <div className="date-time-picker">
      <button
        ref={anchorRef}
        type="button"
        className="date-time-picker-trigger"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-picker-value={value}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={value ? undefined : "is-placeholder"}>{value ? formatDate(value) : placeholder}</span>
        <CalendarDays size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="date-time-popover date-picker-popover"
          role="dialog"
          aria-label={`${ariaLabel} seçici`}
          style={position}
          data-picker-month={monthKey(visibleMonth)}
        >
          <div className="date-picker-toolbar">
            <button type="button" className="picker-icon-button" aria-label="Önceki ay" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <strong>{formatMonth(visibleMonth)}</strong>
            <button type="button" className="picker-icon-button" aria-label="Sonraki ay" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <button type="button" className="picker-icon-button picker-close-button" aria-label="Tarih seçiciyi kapat" onClick={() => setOpen(false)}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          {(clearable || quickPresets.length > 0) && (
            <div className="date-picker-presets">
              {clearable && <button type="button" onClick={() => choose("")} disabled={!value}>Temizle</button>}
              {quickPresets.map((preset) => (
                <button
                  type="button"
                  key={`${preset.label}:${preset.value}`}
                  disabled={isDateDisabled(preset.value, min, max)}
                  onClick={() => choose(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          <div className="date-picker-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="date-picker-grid">
            {days.map((day) => {
              const key = localDateKey(day);
              const outside = day.getMonth() !== visibleMonth.getMonth();
              const selected = key === value;
              const today = key === localDateKey(new Date());
              return (
                <button
                  type="button"
                  key={key}
                  data-date={key}
                  className={[
                    outside ? "is-outside" : "",
                    selected ? "is-selected" : "",
                    today ? "is-today" : ""
                  ].filter(Boolean).join(" ")}
                  disabled={isDateDisabled(key, min, max)}
                  aria-pressed={selected}
                  onClick={() => choose(key)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function TimePicker({
  value,
  onChange,
  ariaLabel,
  disabled = false,
  minuteStep = 1,
  clearable = true
}: TimePickerProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState("");
  const [draftMinute, setDraftMinute] = useState("");
  const position = useAnchoredPopover(open, anchorRef, popoverRef);

  useEffect(() => {
    if (!open) return;
    const parsed = parseTime(value);
    setDraftHour(parsed?.hour ?? "");
    setDraftMinute(parsed?.minute ?? "");
    requestAnimationFrame(() => {
      popoverRef.current?.querySelector<HTMLElement>(".is-selected")?.scrollIntoView({ block: "center" });
    });
  }, [open, value]);

  useDismissPopover(open, setOpen, anchorRef, popoverRef);

  const minutes = useMemo(() => {
    const safeStep = Math.min(30, Math.max(1, Math.round(minuteStep)));
    const values = Array.from({ length: Math.ceil(60 / safeStep) }, (_, index) => pad(index * safeStep)).filter((item) => Number(item) < 60);
    const current = parseTime(value)?.minute;
    return current && !values.includes(current) ? [...values, current].sort() : values;
  }, [minuteStep, value]);

  const chooseMinute = (minute: string) => {
    const hour = draftHour || parseTime(value)?.hour || pad(new Date().getHours());
    onChange(`${hour}:${minute}`);
    setOpen(false);
    requestAnimationFrame(() => anchorRef.current?.focus());
  };

  const clear = () => {
    onChange("");
    setOpen(false);
    requestAnimationFrame(() => anchorRef.current?.focus());
  };

  return (
    <div className="date-time-picker">
      <button
        ref={anchorRef}
        type="button"
        className="date-time-picker-trigger"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-picker-value={value}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={value ? undefined : "is-placeholder"}>{value || "--:--"}</span>
        <Clock3 size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="date-time-popover time-picker-popover"
          role="dialog"
          aria-label={`${ariaLabel} seçici`}
          style={position}
        >
          <div className="time-picker-toolbar">
            <div>
              <small>Saat seçimi</small>
              <strong>{draftHour && draftMinute ? `${draftHour}:${draftMinute}` : value || "--:--"}</strong>
            </div>
            {clearable && <button type="button" className="picker-text-button" onClick={clear} disabled={!value}>Temizle</button>}
            <button type="button" className="picker-icon-button" aria-label="Saat seçiciyi kapat" onClick={() => setOpen(false)}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="time-picker-columns">
            <div>
              <span>Saat</span>
              <div className="time-picker-list" role="listbox" aria-label="Saat">
                {Array.from({ length: 24 }, (_, hour) => pad(hour)).map((hour) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={hour === draftHour}
                    className={hour === draftHour ? "is-selected" : ""}
                    key={hour}
                    onClick={() => setDraftHour(hour)}
                  >
                    {hour}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span>Dakika</span>
              <div className="time-picker-list" role="listbox" aria-label="Dakika">
                {minutes.map((minute) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={minute === draftMinute}
                    className={minute === draftMinute ? "is-selected" : ""}
                    key={minute}
                    onClick={() => {
                      setDraftMinute(minute);
                      chooseMinute(minute);
                    }}
                  >
                    {minute}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function useDismissPopover(
  open: boolean,
  setOpen: (open: boolean) => void,
  anchorRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (anchorRef.current?.contains(target) || popoverRef.current?.contains(target))) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => anchorRef.current?.focus());
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchorRef, open, popoverRef, setOpen]);
}

function useAnchoredPopover(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>
): CSSProperties {
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) return;
      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const gap = 6;
      const edge = 8;
      let top = anchorRect.bottom + gap;
      if (top + popoverRect.height > window.innerHeight - edge) {
        top = Math.max(edge, anchorRect.top - popoverRect.height - gap);
      }
      let left = anchorRect.left;
      if (left + popoverRect.width > window.innerWidth - edge) {
        left = Math.max(edge, window.innerWidth - popoverRect.width - edge);
      }
      setPosition({ top, left, visibility: "visible" });
    };
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, open, popoverRef]);

  return position;
}

function monthStart(value: string): Date {
  const parsed = parseDate(value) ?? new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function addMonths(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function monthKey(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}`;
}

function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateKey(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function formatDate(value: string): string {
  const parsed = parseDate(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
}

function formatMonth(value: Date): string {
  const formatted = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(value);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function isDateDisabled(value: string, min?: string, max?: string) {
  if (!value) return false;
  return Boolean((min && value < min) || (max && value > max));
}

function parseTime(value: string): { hour: string; minute: string } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour: pad(hour), minute: pad(minute) };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

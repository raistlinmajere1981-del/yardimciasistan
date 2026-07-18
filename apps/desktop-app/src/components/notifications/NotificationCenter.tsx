import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  MessageCircle,
  RefreshCw,
  UtensilsCrossed
} from "lucide-react";
import type { DesktopNotificationItem } from "../../app/notifications";

interface NotificationCenterProps {
  items: DesktopNotificationItem[];
  onOpen: (item: DesktopNotificationItem) => void;
}

export function NotificationCenter({ items, onOpen }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        className={open ? "notification-bell is-open" : "notification-bell"}
        type="button"
        aria-label={`Bildirimler, ${items.length} uyarı`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={18} aria-hidden="true" />
        {items.length > 0 && <span className="notification-count">{items.length > 99 ? "99+" : items.length}</span>}
      </button>

      {open && (
        <section className="notification-popover" role="dialog" aria-label="Bildirim merkezi">
          <header>
            <div><span>Uyarılar</span><h2>Bildirim merkezi</h2></div>
            <strong>{items.length}</strong>
          </header>
          {items.length === 0 ? (
            <div className="notification-empty">
              <Bell size={24} aria-hidden="true" />
              <strong>Açık uyarı yok</strong>
              <span>Yeni bir konu oluştuğunda burada görünecek.</span>
            </div>
          ) : (
            <ol className="notification-list">
              {items.slice(0, 30).map((item) => {
                const Icon = notificationIcon(item);
                return (
                  <li className={`notification-item priority-${item.priority}`} key={item.key}>
                    <span className="notification-item-icon" aria-hidden="true"><Icon size={17} /></span>
                    <div className="notification-item-copy">
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <time dateTime={item.occurredAt}>{formatNotificationTime(item.occurredAt)}</time>
                    </div>
                    <button
                      type="button"
                      aria-label={`${item.title}: ilgili sayfaya git`}
                      onClick={() => {
                        setOpen(false);
                        onOpen(item);
                      }}
                    >
                      Git<ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {items.length > 30 && <p className="notification-overflow">İlk 30 uyarı gösteriliyor.</p>}
        </section>
      )}
    </div>
  );
}

function notificationIcon(item: DesktopNotificationItem) {
  if (item.kind === "request") return MessageCircle;
  if (item.kind === "reservation") return CalendarClock;
  if (item.kind === "table") return UtensilsCrossed;
  if (item.kind === "task") return ClipboardList;
  if (item.kind === "sync") return RefreshCw;
  return AlertTriangle;
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Zaman bilgisi yok";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

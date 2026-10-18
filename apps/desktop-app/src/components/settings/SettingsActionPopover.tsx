import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "../ui/IconButton";

/** A non-modal action surface; existing global confirmations retain modal ownership. */
export function SettingsActionPopover({ id, label, open, onOpenChange, children, sidebar = false, trigger }: {
  id: string; label: string; open: boolean; onOpenChange: (open: boolean) => void;
  children: ReactNode; sidebar?: boolean; trigger?: ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const change = useRef(onOpenChange);
  useEffect(() => { change.current = onOpenChange; }, [onOpenChange]);
  const [position, setPosition] = useState<{ left: number; top?: number | undefined; bottom?: number | undefined; maxHeight: number }>({ left: 0, top: 0, maxHeight: 0 });
  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = Number(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
      const width = Math.min(520, window.innerWidth / scale - 24);
      const height = window.innerHeight / scale;
      const top = sidebar ? 12 : Math.min(rect.bottom / scale + 8, height - 200);
      setPosition({
        left: Math.max(12, Math.min(sidebar ? rect.right / scale + 8 : rect.right / scale - width, window.innerWidth / scale - width - 12)),
        top: sidebar ? undefined : top,
        bottom: sidebar ? Math.max(12, height - rect.bottom / scale) : undefined,
        maxHeight: sidebar ? rect.bottom / scale - 12 : height - top - 12
      });
    }
    place();
    panel.current?.focus({ preventScroll: true });
    function dismiss(event: PointerEvent) {
      if (document.querySelector('dialog[open]')) return;
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !button.current?.contains(event.target)) change.current(false);
    }
    function key(event: KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      event.stopPropagation();
      change.current(false);
      button.current?.focus({ preventScroll: true });
    }
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", key);
    };
  }, [open, sidebar]);
  return <>
    <button ref={button} id={id} type="button" className={sidebar ? "nav-item sidebar-update-trigger" : "action-button action-button-secondary"}
      aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined}
      onClick={() => onOpenChange(!open)}>{trigger ?? label}</button>
    {open && createPortal(<section ref={panel} id={`${id}-panel`} role="dialog" aria-label={label} tabIndex={-1}
      className="settings-action-popover" style={position}>
      <header className="settings-action-popover-header"><strong>{label}</strong>
        <IconButton aria-label={`${label} kapat`} onClick={() => { onOpenChange(false); button.current?.focus(); }}><X size={18} /></IconButton>
      </header>
      {children}
    </section>, document.body)}
  </>;
}

import { useEffect, useRef } from "react";

/** Keeps keyboard focus in the visible modal and restores the invoking control. */
export function useDialogFocus(open: boolean) {
  const ref = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  if (open && !wasOpen.current) returnFocus.current = document.activeElement as HTMLElement;
  wasOpen.current = open;

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]'
    )).filter(element => element.getClientRects().length > 0);
    if (!dialog.contains(document.activeElement)) controls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const dialogs = Array.from(document.querySelectorAll('[aria-modal="true"]'));
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        if (event.defaultPrevented || event.target instanceof Element && event.target.closest("[popover]:popover-open")) return;
        const close = dialog.querySelector<HTMLButtonElement>('[data-dialog-close], .drawer-close-button, .overlay-close');
        if (close && !close.disabled) { event.preventDefault(); event.stopPropagation(); close.click(); }
      }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0], last = items.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    };
  }, [open]);
  return ref;
}

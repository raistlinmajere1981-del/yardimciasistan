import { IconButton } from "./IconButton";
import { ActionButton } from "./ActionButton";
import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

export interface SearchSelectOption {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
  disabled?: boolean;
  leading?: ReactNode;
}
interface SearchSelectProps {
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  clearable?: boolean;
  autoFocus?: boolean;
  onCreate?: () => void;
  createLabel?: string;
}

/** Non-modal top-layer picker: also works inside the one canonical modal boundary. */
export function SearchSelect({ value, options, onChange, ariaLabel, placeholder = "Seçin", searchPlaceholder = "Ara",
  emptyMessage = "Eşleşen kayıt yok.", disabled = false, clearable = true, autoFocus = false, onCreate, createLabel = "Yeni ekle" }: SearchSelectProps) {
  const anchorRef = useRef<HTMLButtonElement>(null), popoverRef = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null);
  const id = useId(), listId = `${id}-options`;
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [activeId, setActiveId] = useState("");
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const selected = options.find(option => option.id === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR"), digits = needle.replace(/\D/g, "");
    return options.filter(option => !needle || `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle)
      || /^\+?[\d\s()-]+$/.test(needle) && digits.length > 0 && `${option.description ?? ""} ${option.keywords ?? ""}`.replace(/\D/g, "").includes(digits));
  }, [options, query]);
  const enabledOptions = filtered.filter(option => !option.disabled);
  const active = enabledOptions.find(option => option.id === activeId) ?? enabledOptions.find(option => option.id === value) ?? enabledOptions[0];
  const optionId = (option: SearchSelectOption) => `${id}-${options.indexOf(option)}`;
  const close = (restore = true) => { setOpen(false); if (restore) anchorRef.current?.focus({ preventScroll: true }); };
  const choose = (next: string) => { close(); onChange(next); };
  function show() { if (disabled) return; setQuery(""); setActiveId(value); setOpen(true); }

  useLayoutEffect(() => {
    if (!open) return;
    const popover = popoverRef.current!, anchor = anchorRef.current!;
    popover.showPopover();
    function place() {
      const rect = anchor.getBoundingClientRect(), edge = 8, gap = 6;
      const below = window.innerHeight - rect.bottom - gap - edge, above = rect.top - gap - edge;
      const height = Math.min(430, Math.max(below, above), window.innerHeight - edge * 2);
      const width = Math.min(Math.max(rect.width, 320), 420, window.innerWidth - edge * 2);
      const actualHeight = Math.min(popover.scrollHeight, height);
      setPosition({ width, maxHeight: height, left: Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge)),
        top: Math.max(edge, below >= actualHeight ? rect.bottom + gap : rect.top - gap - actualHeight), visibility: "visible" });
    }
    place();
    const focusFrame = requestAnimationFrame(() => searchRef.current?.focus());
    const observer = new ResizeObserver(place); observer.observe(popover);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(focusFrame); observer.disconnect(); if (popover.matches(":popover-open")) popover.hidePopover(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  useEffect(() => {
    if (open && active?.id) {
      const index = options.findIndex((option) => option.id === active.id);
      if (index >= 0) document.getElementById(`${id}-${index}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active?.id, query, options, id]);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => { const target = event.target as Node; if (!anchorRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false); };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation(); close();
    };
    const focus = (event: FocusEvent) => { if (!popoverRef.current?.contains(event.target as Node) && event.target !== anchorRef.current) setOpen(false); };
    document.addEventListener("pointerdown", pointer, true); document.addEventListener("keydown", escape, true); document.addEventListener("focusin", focus);
    return () => { document.removeEventListener("pointerdown", pointer, true); document.removeEventListener("keydown", escape, true); document.removeEventListener("focusin", focus); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  function navigate(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    const index = enabledOptions.findIndex(option => option.id === active?.id);
    const next = event.key === "ArrowDown" ? Math.min(index + 1, enabledOptions.length - 1) : event.key === "ArrowUp" ? Math.max(index - 1, 0)
      : event.key === "Home" ? 0 : event.key === "End" ? enabledOptions.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); const target = enabledOptions[next]; if (target) setActiveId(target.id); }
    else if (event.key === "Enter") { event.preventDefault(); if (active) choose(active.id); }
  }
  return <div className="search-select">
    <button ref={anchorRef} type="button" className="search-select-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? `${id}-picker` : undefined} disabled={disabled} autoFocus={autoFocus} onClick={() => open ? close() : show()}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); } }}>
      <span className={selected ? undefined : "is-placeholder"}>{selected?.label ?? placeholder}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div ref={popoverRef} id={`${id}-picker`} popover="manual" className="search-select-popover" role="dialog" aria-label={`${ariaLabel} seçici`} style={position}>
      <div className="search-select-search"><Search size={16} aria-hidden="true" />
        <input ref={searchRef} role="combobox" aria-label={`${ariaLabel} ara`} aria-expanded="true" aria-autocomplete="list" aria-controls={listId}
          aria-activedescendant={active ? optionId(active) : undefined} value={query} onChange={event => { setQuery(event.target.value); setActiveId(""); }} onKeyDown={navigate} placeholder={searchPlaceholder} />
        {query && <IconButton size="sm" variant="quiet" aria-label="Aramayı temizle" onClick={() => { setQuery(""); setActiveId(value); searchRef.current?.focus(); }}><X size={15} aria-hidden="true" /></IconButton>}
      </div>
      {clearable && value && <ActionButton size="sm" variant="ghost" fullWidth className="search-select-clear" onClick={() => choose("")}>Seçimi temizle</ActionButton>}
      <div id={listId} className="search-select-options" role="listbox" aria-label={ariaLabel}>
        {!filtered.length && <p role="status">{emptyMessage}</p>}
        {filtered.map(option => <button key={option.id} id={optionId(option)} type="button" role="option" data-value={option.id} aria-selected={option.id === value} tabIndex={-1}
          className={`${option.id === value ? "is-selected" : ""} ${option.id === active?.id ? "is-active" : ""}`} disabled={option.disabled} title={[option.label, option.description].filter(Boolean).join(" · ")}
          onPointerMove={() => { if (!option.disabled) setActiveId(option.id); }} onClick={() => choose(option.id)}>
          {option.leading && <span className="search-select-option-leading" aria-hidden="true">{option.leading}</span>}
          <span className="search-select-option-copy"><span>{option.label}</span>{option.description && <small>{option.description}</small>}</span>
        </button>)}
      </div>
      {onCreate && <button type="button" className="search-select-clear" onClick={() => { close(); onCreate(); }}>{createLabel}</button>}
    </div>}
  </div>;
}

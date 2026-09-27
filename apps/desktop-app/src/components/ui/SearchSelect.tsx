import { ChevronDown, Search, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject
} from "react";

export interface SearchSelectOption {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
  disabled?: boolean;
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
}

export function SearchSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "Seçin",
  searchPlaceholder = "Ara",
  emptyMessage = "Eşleşen kayıt yok.",
  disabled = false,
  clearable = true,
  autoFocus = false
}: SearchSelectProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const position = useAnchoredPopover(open, anchorRef, popoverRef);
  const selected = options.find((option) => option.id === value);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(normalized)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useDismissPopover(open, setOpen, anchorRef, popoverRef);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => anchorRef.current?.focus());
  };

  return (
    <div className="search-select">
      <button
        ref={anchorRef}
        type="button"
        className="search-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? undefined : "is-placeholder"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="search-select-popover"
          role="dialog"
          aria-label={`${ariaLabel} seçici`}
          style={position}
        >
          <div className="search-select-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              aria-label={`${ariaLabel} ara`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />
            {query && (
              <button
                type="button"
                className="picker-icon-button"
                aria-label="Aramayı temizle"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>
          {clearable && value && (
            <button type="button" className="search-select-clear" onClick={() => choose("")}>
              Seçimi temizle
            </button>
          )}
          <div className="search-select-options" role="listbox" aria-label={ariaLabel}>
            {filtered.length === 0 && <p>{emptyMessage}</p>}
            {filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                className={option.id === value ? "is-selected" : ""}
                disabled={option.disabled}
                onClick={() => choose(option.id)}
              >
                <span>{option.label}</span>
                {option.description && <small>{option.description}</small>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
      setPosition({
        top,
        left,
        minWidth: Math.min(Math.max(anchorRect.width, 260), window.innerWidth - edge * 2),
        visibility: "visible"
      });
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

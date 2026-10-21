import { Check, ChevronRight, LayoutGrid, List, Minus, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { pickerScreenClass, readRecordPickerPreference, saveRecordPickerPreference, type RecordPickerPreference, type RecordPickerType } from "../../ui-preferences";
import { WorkspaceSubflowOverlay } from "../workspace/WorkspaceSubflowOverlay";
import { ModalSurface, useInsideModalSurface } from "./ModalSurface";
import { SearchSelect, type SearchSelectOption, type SearchSelectPage } from "./SearchSelect";

interface RecordPickerProps {
  withinWorkspace?: boolean;
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  pickerType: RecordPickerType;
  alphabetical?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  clearable?: boolean;
  loadPage?: (query: string, offset: number) => Promise<SearchSelectPage>;
  loadOptions?: (query: string) => Promise<SearchSelectOption[]>;
  resultLimit?: number;
}

const LETTER_GROUPS = ["ABC", "ÇDE", "FGH", "IİJ", "KLM", "NOÖ", "PRS", "ŞTU", "ÜVY", "Z"];
const PAGE_SIZE = 60;
const MIN_CARD_WIDTH = 155;

/** Pages use a modal; opted-in workspaces reuse the same picker in their subflow overlay. */
export function RecordPicker(props: RecordPickerProps) {
  const insideModal = useInsideModalSurface();
  if (insideModal && !props.withinWorkspace) return <SearchSelect {...props} />;
  return <PageRecordPicker {...props} />;
}

function PageRecordPicker({ withinWorkspace = false, value, options, onChange, ariaLabel, pickerType, alphabetical = false,
  placeholder = "Seçin", searchPlaceholder = "Ara", emptyMessage = "Eşleşen kayıt yok.", disabled = false, clearable = true, loadOptions, loadPage, resultLimit }: RecordPickerProps) {
  const id = useId(), titleId = `${id}-title`, listId = `${id}-options`;
  const trigger = useRef<HTMLButtonElement>(null), field = useRef<HTMLInputElement>(null), results = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [group, setGroup] = useState("");
  const [page, setPage] = useState(0), [activeId, setActiveId] = useState("");
  const [remote, setRemote] = useState<{ query: string; options: SearchSelectOption[] } | null>(null);
  const pendingActiveIndex = useRef(0);
  const [remotePage, setRemotePage] = useState<SearchSelectPage | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [picked, setPicked] = useState<SearchSelectOption | null>(null);
  const [viewport, setViewport] = useState(() => window.innerWidth), [panelWidth, setPanelWidth] = useState(0);
  const screen = pickerScreenClass(viewport);
  const [preferences, setPreferences] = useState(() => readRecordPickerPreference(pickerType, screen));
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => { setPreferences(readRecordPickerPreference(pickerType, screen)); }, [pickerType, screen]);
  useLayoutEffect(() => {
    if (!open || !results.current) return;
    const node = results.current;
    const measure = () => {
      const style = getComputedStyle(node);
      setPanelWidth(node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    setRemote(null); setError("");
    if (!open || loadPage || !loadOptions || !query.trim()) { setLoading(false); return; }
    let disposed = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void loadOptions(query.trim()).then(next => {
        if (!disposed) { setRemote({ query, options: next }); setPage(0); setActiveId(""); }
      }).catch(() => { if (!disposed) setError("Kayıtlar aranamadı. Tekrar deneyin."); })
        .finally(() => { if (!disposed) setLoading(false); });
    }, 180);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [open, query, loadOptions, loadPage, searchAttempt]);
  useEffect(() => {
    if (!open || !loadPage) return;
    let current = true;
    setLoading(true); setError("");
    const timer = window.setTimeout(() => {
      void loadPage(query.trim(), page * PAGE_SIZE).then(next => {
        if (current) { setRemotePage(next); setActiveId(next.options[pendingActiveIndex.current]?.id ?? ""); }
      }).catch(() => { if (current) setError("Kayıtlar yüklenemedi. Tekrar deneyin."); })
        .finally(() => { if (current) setLoading(false); });
    }, query.trim() ? 180 : 0);
    return () => { current = false; window.clearTimeout(timer); };
  }, [open, loadPage, query, page, searchAttempt]);
  const maxColumns = Math.max(1, Math.min(4, Math.floor((panelWidth + 12) / (MIN_CARD_WIDTH + 12))));
  const columns = Math.min(preferences.columns, maxColumns);
  function changePreference(next: RecordPickerPreference) {
    setPreferences(next); saveRecordPickerPreference(pickerType, screen, next);
  }
  const selected = options.find(option => option.id === value) ?? (picked?.id === value ? picked : null);
  const available = loadPage && remotePage ? remotePage.options : remote?.query === query ? remote.options : options;
  const filtered = useMemo(() => {
    if (loadPage) return available;
    const needle = query.trim().toLocaleLowerCase("tr-TR"), digits = needle.replace(/\D/g, "");
    return available.filter(option => needle
      ? `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle)
        || /^\+?[\d\s()-]+$/.test(needle) && digits.length > 0 && `${option.description ?? ""} ${option.keywords ?? ""}`.replace(/\D/g, "").includes(digits)
      : !alphabetical || !group || group.includes((option.label.trim()[0] ?? "").toLocaleUpperCase("tr-TR")));
  }, [available, query, alphabetical, group, loadPage]);
  const resultCount = loadPage ? remotePage?.total ?? 0 : filtered.length;
  const pageCount = Math.max(1, Math.ceil(resultCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = loadPage ? filtered : filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const active = shown.find(option => option.id === activeId && !option.disabled) ?? shown.find(option => option.id === value && !option.disabled) ?? shown.find(option => !option.disabled);
  const optionId = (option: SearchSelectOption) => `${id}-option-${encodeURIComponent(option.id)}`;
  useEffect(() => {
    if (open && activeId) document.getElementById(`${id}-option-${encodeURIComponent(activeId)}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId, currentPage, preferences.view, columns, id]);
  function resetResults() { setPage(0); setActiveId(""); if (results.current) results.current.scrollTop = 0; }
  function show() { if (disabled) return; setPreferences(readRecordPickerPreference(pickerType, screen)); setQuery(""); setGroup(""); resetResults(); setOpen(true); }
  function choose(next: string) { if (loading || error) return; setPicked(available.find(option => option.id === next) ?? null); setOpen(false); onChange(next); }
  function navigate(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    const stride = preferences.view === "grid" ? columns : 1;
    const delta = event.key === "ArrowDown" ? stride : event.key === "ArrowUp" ? -stride
      : preferences.view === "grid" && event.key === "ArrowRight" ? 1 : preferences.view === "grid" && event.key === "ArrowLeft" ? -1 : 0;
    if (event.key === "Enter") { event.preventDefault(); if (active) choose(active.id); return; }
    if (!delta && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const localIndex = active ? filtered.indexOf(active) : -1;
    if (loadPage) {
      const target = event.key === "Home" ? 0 : event.key === "End" ? Math.max(0, resultCount - 1) : Math.max(0, Math.min(resultCount - 1, currentPage * PAGE_SIZE + localIndex + delta));
      const targetPage = Math.floor(target / PAGE_SIZE);
      if (targetPage !== page) changePage(targetPage, target % PAGE_SIZE);
      else setActiveId(filtered[target % PAGE_SIZE]?.id ?? "");
      return;
    }
    const index = localIndex;
    let next = event.key === "Home" ? 0 : event.key === "End" ? filtered.length - 1 : Math.max(0, Math.min(filtered.length - 1, index + delta));
    const direction = event.key === "End" || delta < 0 ? -1 : 1;
    while (next >= 0 && next < filtered.length && filtered[next]?.disabled) next += direction;
    const target = filtered[next];
    if (target) { setPage(Math.floor(next / PAGE_SIZE)); setActiveId(target.id); }
  }
  function changePage(next: number, activeIndex = 0) { pendingActiveIndex.current = activeIndex; setPage(next); setActiveId(""); field.current?.focus(); if (results.current) results.current.scrollTop = 0; }
  return <div className="search-select record-picker-trigger">
    <button type="button" ref={trigger} className="search-select-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? `${id}-picker` : undefined} disabled={disabled} onClick={show}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); } }}>
      <span className={selected ? undefined : "is-placeholder"}>{selected?.label ?? placeholder}</span><Search size={17} aria-hidden="true" />
    </button>
    {open && createPortal(<PickerSurface withinWorkspace={withinWorkspace} title={`${ariaLabel} seçici`} titleId={titleId} onClose={() => setOpen(false)} field={field} trigger={trigger}>
      <div id={`${id}-picker`} className="record-picker__surface">
        {!withinWorkspace && <header className="record-picker__header"><div><h2 id={titleId}>{ariaLabel} seçici</h2><small>{(loadPage ? resultCount : options.length).toLocaleString("tr-TR")} kayıt</small></div>
          <button type="button" aria-label="Kapat" onClick={() => setOpen(false)}><X size={19} aria-hidden="true" /></button></header>}
        <div className="record-picker__search"><Search size={19} aria-hidden="true" />
          <input ref={field} data-modal-initial-focus role="combobox" aria-label={`${ariaLabel} ara`} aria-expanded="true" aria-autocomplete="list" aria-controls={listId}
            aria-activedescendant={active ? optionId(active) : undefined} placeholder={searchPlaceholder} value={query}
            onChange={event => { setQuery(event.target.value); resetResults(); }} onKeyDown={navigate} />
          {query && <button type="button" aria-label="Aramayı temizle" onClick={() => { setQuery(""); resetResults(); field.current?.focus(); }}><X size={17} aria-hidden="true" /></button>}
        </div>
        <div className="record-picker__filters"><button type="button" aria-pressed={!query.trim() && !group} onClick={() => { setQuery(""); setGroup(""); resetResults(); }}>Tümü</button>
          <span className="record-picker__count" role="status">{loading ? "Aranıyor…" : `${resultCount.toLocaleString("tr-TR")} sonuç`}</span>
          {preferences.view === "grid" && <div role="group" aria-label="Bir satırdaki kart sayısı" className="record-picker__controls">
            <button type="button" aria-label="Kart sayısını azalt" disabled={columns <= 1} onClick={() => changePreference({ ...preferences, columns: columns - 1 })}><Minus size={18} aria-hidden="true" /></button>
            <span role="status" aria-label={`Satırda ${columns} kart`}>{columns} kart</span>
            <button type="button" aria-label="Kart sayısını artır" disabled={columns >= maxColumns} onClick={() => changePreference({ ...preferences, columns: columns + 1 })}><Plus size={18} aria-hidden="true" /></button>
          </div>}
          <div role="group" aria-label="Liste düzeni" className="record-picker__controls">
            <button type="button" aria-label="Liste görünümü" aria-pressed={preferences.view === "list"} onClick={() => changePreference({ ...preferences, view: "list" })}><List size={18} aria-hidden="true" /></button>
            <button type="button" aria-label="Grid görünümü" aria-pressed={preferences.view === "grid"} onClick={() => changePreference({ ...preferences, view: "grid" })}><LayoutGrid size={18} aria-hidden="true" /></button>
          </div>
        </div>
        {alphabetical && <div role="group" aria-label="Harf grupları" className="record-picker__letters">
          {LETTER_GROUPS.map(letter => <button type="button" key={letter} aria-pressed={!query.trim() && group === letter} onClick={() => { setGroup(letter); setQuery(""); resetResults(); }}>{letter}</button>)}
        </div>}
        {error && <div className="record-picker__notice" role="alert">{error} <button type="button" onClick={() => setSearchAttempt(attempt => attempt + 1)}>Yeniden ara</button></div>}
        {resultLimit && available.length >= resultLimit && <p className="record-picker__notice">İlk {resultLimit} kayıt gösteriliyor. Tüm kayıtlarda aramak için ad veya kod yazın; daha az sonuç için aramayı daraltın.</p>}
        <div ref={results} id={listId} role="listbox" aria-label={ariaLabel} aria-busy={loading} className="record-picker__results" data-view={preferences.view}
          data-columns={columns} onKeyDown={navigate}>
          {!shown.length && !loading && !error && <p role="status">{emptyMessage}</p>}
          {shown.map(option => <button type="button" role="option" key={option.id} id={optionId(option)} data-value={option.id} aria-selected={option.id === value} disabled={loading || Boolean(error) || option.disabled} tabIndex={-1}
            className={`record-picker__option ${option.id === value ? "is-selected" : ""} ${option.id === active?.id ? "is-active" : ""}`} aria-disabled={loading || Boolean(error) || option.disabled}
            title={[option.label, option.description].filter(Boolean).join(" · ")} onPointerMove={() => { if (!option.disabled) setActiveId(option.id); }} onClick={() => choose(option.id)}>
            {option.leading && <span className="record-picker__thumb" aria-hidden="true">{option.leading}</span>}
            <span className="record-picker__copy"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
            <span className="record-picker__trailing" aria-hidden="true">{option.id === value ? <Check size={18} /> : <ChevronRight size={17} />}</span>
          </button>)}
        </div>
        <div className="record-picker__pagination" aria-label="Sonuç sayfaları">
          <button type="button" disabled={loading || currentPage === 0} onClick={() => changePage(currentPage - 1)}>Önceki</button>
          <span role="status">{resultCount ? currentPage * PAGE_SIZE + 1 : 0}–{Math.min((currentPage + 1) * PAGE_SIZE, resultCount)} / {resultCount.toLocaleString("tr-TR")}</span>
          <button type="button" disabled={loading || Boolean(error) || currentPage >= pageCount - 1} onClick={() => changePage(currentPage + 1)}>Sonraki</button>
        </div>
        <footer className="record-picker__footer">{clearable && value ? <button type="button" onClick={() => choose("")}>Seçimi temizle</button> : <span />}
          <button type="button" onClick={() => setOpen(false)}>Vazgeç</button></footer>
      </div>
    </PickerSurface>, withinWorkspace ? trigger.current?.closest(".workspace-frame, .workspace-page-frame") ?? document.body : document.body)}
  </div>;
}

function PickerSurface({ withinWorkspace, title, titleId, onClose, field, trigger, children }: {
  withinWorkspace: boolean; title: string; titleId: string; onClose: () => void;
  field: RefObject<HTMLInputElement | null>; trigger: RefObject<HTMLButtonElement | null>; children: ReactNode;
}) {
  useLayoutEffect(() => { if (withinWorkspace) field.current?.focus(); }, [withinWorkspace, field]);
  return withinWorkspace
    ? <WorkspaceSubflowOverlay title={title} onClose={onClose} className="record-picker record-picker--workspace">{children}</WorkspaceSubflowOverlay>
    : <ModalSurface labelledBy={titleId} className="record-picker" onClose={onClose} dismissOnBackdrop initialFocusRef={field} returnFocusRef={trigger}>{children}</ModalSurface>;
}

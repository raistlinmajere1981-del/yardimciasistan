import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, Clipboard, Pause, Play, RefreshCw } from "lucide-react";
import type {
  DesktopDiagnosticEvent,
  DesktopDiagnosticLevel,
  DesktopDiagnosticReadResult,
  DesktopDiagnosticSessionSummary
} from "../../../electron/diagnostics-contract";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import type { WorkspacePresentation } from "../workspace/workspace-intent";
import { SupportReportDialog } from "./SupportReportDialog";
import { ActionButton } from "../ui/ActionButton";

interface DiagnosticsViewerProps {
  onClose: () => void;
}

const LEVELS: DesktopDiagnosticLevel[] = ["INFO", "WARN", "ERROR"];
const LIVE_REFRESH_MS = 1000;
const PAGE_SIZE = 2000;
const CONTEXT_RADIUS = 30;

export function DiagnosticsViewer({ onClose }: DiagnosticsViewerProps) {
  const [presentation, setPresentation] = useState<WorkspacePresentation>("centered");
  const listRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<DesktopDiagnosticSessionSummary[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [result, setResult] = useState<DesktopDiagnosticReadResult | null>(null);
  const [levels, setLevels] = useState<DesktopDiagnosticLevel[]>(LEVELS);
  const [scope, setScope] = useState("");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [supportReportOpen, setSupportReportOpen] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [copyAction, setCopyAction] = useState<"visible" | "session" | "context" | "">("");

  const selectedSession = sessions.find((session) => session.sessionId === sessionId) ?? null;
  const isCurrentSession = Boolean(selectedSession?.current);

  const refreshSessions = useCallback(async (preferredSessionId: string) => {
    const bridge = window.yardimciDesktop;
    if (!bridge?.listDiagnosticSessions) {
      setState("error");
      setMessage("Tanılama bağlantısı hazır değil.");
      return;
    }

    try {
      const nextSessions = await bridge.listDiagnosticSessions();
      setSessions(nextSessions);
      const nextSessionId = nextSessions.some((item) => item.sessionId === preferredSessionId)
        ? preferredSessionId
        : nextSessions.find((item) => item.current)?.sessionId ?? nextSessions[0]?.sessionId ?? "";
      setSessionId(nextSessionId);
      if (!nextSessionId) {
        setResult(null);
        setState("ready");
        setMessage("Henüz log oturumu bulunmuyor.");
      }
    } catch {
      setState("error");
      setMessage("Log oturumları okunamadı.");
    }
  }, []);

  const refreshEvents = useCallback(async (targetSessionId: string, quiet = false) => {
    if (!targetSessionId) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.readDiagnosticSession) {
      setState("error");
      setMessage("Tanılama okuma bağlantısı hazır değil.");
      return;
    }

    if (!quiet) {
      setState("loading");
      setMessage("");
    }
    try {
      const nextResult = await bridge.readDiagnosticSession({
        sessionId: targetSessionId,
        limit: PAGE_SIZE
      });
      setResult(nextResult);
      setState("ready");
      setMessage(nextResult
        ? `${nextResult.events.length} kayıt gösteriliyor${nextResult.hasMore ? " · daha eski kayıtlar mevcut" : ""}.`
        : "Log oturumu okunamadı.");
    } catch {
      setState("error");
      setMessage("Log kayıtları okunamadı.");
    }
  }, []);

  useEffect(() => {
    void refreshSessions("");
  }, [refreshSessions]);

  useEffect(() => {
    if (!sessionId) return;
    setSelectedSequence(null);
    setCopyMessage("");
    void refreshEvents(sessionId);
  }, [refreshEvents, sessionId]);

  useEffect(() => {
    if (!isCurrentSession || paused || !sessionId) return;
    const timer = window.setInterval(() => {
      void refreshEvents(sessionId, true);
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [isCurrentSession, paused, refreshEvents, sessionId]);

  useEffect(() => {
    if (!paused) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "auto" });
    }
  }, [result?.events, paused]);

  const scopes = useMemo(
    () => [...new Set((result?.events ?? []).map((event) => event.scope))].sort((left, right) => left.localeCompare(right, "tr")),
    [result?.events]
  );

  const visibleEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    return (result?.events ?? []).filter((event) => {
      if (!levels.includes(event.level)) return false;
      if (scope && event.scope !== scope) return false;
      if (!normalizedQuery) return true;
      return JSON.stringify(event).toLocaleLowerCase("tr-TR").includes(normalizedQuery);
    });
  }, [levels, query, result?.events, scope]);

  const selectedEvent = (result?.events ?? []).find((event) => event.sequence === selectedSequence) ?? null;

  function toggleLevel(level: DesktopDiagnosticLevel) {
    setLevels((current) => current.includes(level)
      ? current.filter((candidate) => candidate !== level)
      : [...current, level]);
  }

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(successMessage);
    } catch {
      setCopyMessage("Panoya kopyalanamadı.");
    }
  }

  function formatExportHeader(session: DesktopDiagnosticSessionSummary) {
    return [
      "Yardımcı Asistan Tanılama Kayıtları",
      `Oturum: ${session.sessionId}`,
      `Başlangıç: ${session.startedAt}`,
      `Bitiş: ${session.endedAt || "aktif"}`,
      `Uygulama: ${session.appVersion} · Electron ${session.electronVersion} · Node ${session.nodeVersion}`,
      `Platform: ${session.platform} ${session.arch} · ${session.packaged ? "paketlenmiş" : "geliştirme"}`,
      `Kayıtlar: ${session.eventCount} · WARN ${session.warnCount} · ERROR ${session.errorCount}`,
      "---"
    ].join("\n");
  }

  function formatEvent(event: DesktopDiagnosticEvent) {
    const parts = [
      `${event.timestamp} #${event.sequence} [${event.level}] [${event.process}] [${event.scope}] ${event.event}`,
      event.message
    ];
    if (event.operationId) parts.push(`operationId: ${event.operationId}`);
    if (event.meta && Object.keys(event.meta).length) parts.push(`meta: ${JSON.stringify(event.meta)}`);
    if (event.error) {
      parts.push(`error: ${event.error.name}: ${event.error.message}`);
      if (event.error.stack) parts.push(event.error.stack);
    }
    return parts.join("\n");
  }

  function exportEvents(session: DesktopDiagnosticSessionSummary, events: DesktopDiagnosticEvent[]) {
    return [formatExportHeader(session), ...events.map(formatEvent)].join("\n\n");
  }

  async function readAllSessionEvents(targetSessionId: string): Promise<DesktopDiagnosticReadResult | null> {
    const bridge = window.yardimciDesktop;
    if (!bridge?.readDiagnosticSession) return null;

    let beforeSequence: number | undefined;
    let session: DesktopDiagnosticSessionSummary | null = null;
    const pages: DesktopDiagnosticEvent[][] = [];
    for (let page = 0; page < 100; page += 1) {
      const next = await bridge.readDiagnosticSession({
        sessionId: targetSessionId,
        limit: PAGE_SIZE,
        ...(beforeSequence ? { beforeSequence } : {})
      });
      if (!next) return null;
      session = next.session;
      pages.unshift(next.events);
      if (!next.hasMore || next.events.length === 0) break;
      const oldest = next.events[0]?.sequence;
      if (!oldest || oldest <= 1 || oldest === beforeSequence) break;
      beforeSequence = oldest;
    }

    return {
      session: session!,
      events: pages.flat(),
      hasMore: false
    };
  }

  async function handleCopyVisible() {
    if (!result) return;
    setCopyAction("visible");
    try {
      await copyText(exportEvents(result.session, visibleEvents), `${visibleEvents.length} görünür kayıt kopyalandı.`);
    } finally {
      setCopyAction("");
    }
  }

  async function handleCopySession() {
    if (!sessionId) return;
    setCopyAction("session");
    setCopyMessage("Tüm oturum hazırlanıyor...");
    try {
      const full = await readAllSessionEvents(sessionId);
      if (!full) {
        setCopyMessage("Oturum okunamadı.");
        return;
      }
      await copyText(exportEvents(full.session, full.events), `Tüm oturum kopyalandı · ${full.events.length} kayıt.`);
    } catch {
      setCopyMessage("Tüm oturum kopyalanamadı.");
    } finally {
      setCopyAction("");
    }
  }

  async function handleCopyContext() {
    if (!sessionId || !selectedEvent) return;
    setCopyAction("context");
    setCopyMessage("Hata bağlamı hazırlanıyor...");
    try {
      const full = await readAllSessionEvents(sessionId);
      if (!full) {
        setCopyMessage("Oturum okunamadı.");
        return;
      }
      const index = full.events.findIndex((event) => event.sequence === selectedEvent.sequence);
      if (index < 0) {
        setCopyMessage("Seçili kayıt oturum içinde bulunamadı.");
        return;
      }
      const context = full.events.slice(
        Math.max(0, index - CONTEXT_RADIUS),
        Math.min(full.events.length, index + CONTEXT_RADIUS + 1)
      );
      await copyText(exportEvents(full.session, context), `Seçili kayıt çevresi kopyalandı · ${context.length} kayıt.`);
    } catch {
      setCopyMessage("Hata bağlamı kopyalanamadı.");
    } finally {
      setCopyAction("");
    }
  }

  return (
    <>
    <WorkspaceFrame
      title="Uygulama Logları"
      context={<>{selectedSession?.current ? "Aktif oturum" : "Geçmiş oturum"}{message && ` · ${message}`}</>}
      presentation={presentation}
      onPresentationChange={setPresentation}
      onClose={onClose}
      closeLabel="Log görünümünü kapat"
      bodyScroll="panes"
      actions={<>
        <ActionButton
          variant="secondary"
          size="sm"
          busy={state === "loading" || refreshBusy}
          busyLabel="Yenileniyor…"
          type="button"
          onClick={() => {
            setRefreshBusy(true);
            void Promise.all([refreshSessions(sessionId), refreshEvents(sessionId)]).finally(() => setRefreshBusy(false));
          }}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Yenile
        </ActionButton>
        <ActionButton
          size="sm"
          type="button"
          onClick={() => setSupportReportOpen(true)}
        >
          <Bug size={15} aria-hidden="true" />
          Hata Bildir
        </ActionButton>
        {isCurrentSession && (
          <ActionButton
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => setPaused((current) => !current)}
            aria-pressed={paused}
          >
            {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
            {paused ? "Canlı Takip" : "Duraklat"}
          </ActionButton>
        )}
      </>}
      navigation={
        <div className="diagnostics-toolbar">
          <label>
            <span>Oturum</span>
            <select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
              {sessions.map((session) => (
                <option value={session.sessionId} key={session.sessionId}>
                  {session.current ? "● " : ""}{new Date(session.startedAt).toLocaleString("tr-TR")} · {session.errorCount} hata
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Kapsam</span>
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="">Tümü</option>
              {scopes.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <label className="diagnostics-search">
            <span>Ara</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="olay, mesaj, işlem kimliği..." />
          </label>
          <div className="diagnostics-levels" aria-label="Log seviyeleri">
            {LEVELS.map((level) => (
              <button
                className={`diagnostics-level is-${level.toLowerCase()}${levels.includes(level) ? " is-active" : ""}`}
                type="button"
                aria-pressed={levels.includes(level)}
                onClick={() => toggleLevel(level)}
                key={level}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      }
      footer={
        <div className="diagnostics-footer">
          <div className="diagnostics-copy-actions">
            <ActionButton variant="secondary" size="sm" type="button" onClick={() => void handleCopyVisible()} disabled={!result || Boolean(copyAction)} busy={copyAction === "visible"} busyLabel="Kopyalanıyor…">
              <Clipboard size={15} aria-hidden="true" />
              Görünenleri Kopyala
            </ActionButton>
            <ActionButton variant="secondary" size="sm" type="button" onClick={() => void handleCopySession()} disabled={!sessionId || Boolean(copyAction)} busy={copyAction === "session"} busyLabel="Tüm oturum hazırlanıyor...">
              Tüm Oturumu Kopyala
            </ActionButton>
            <ActionButton variant="secondary" size="sm" type="button" onClick={() => void handleCopyContext()} disabled={!selectedEvent || Boolean(copyAction)} busy={copyAction === "context"} busyLabel="Hata bağlamı hazırlanıyor...">
              Bu Kaydın Bağlamını Kopyala
            </ActionButton>
          </div>
          <span role="status" aria-live="polite">{copyMessage || `${visibleEvents.length} / ${result?.events.length ?? 0} kayıt görünür`}</span>
        </div>
      }
    >
      <div className="diagnostics-body">
        <div className="diagnostics-event-list" ref={listRef} role="list" aria-label="Log kayıtları" aria-busy={state === "loading"}>
          {state === "error" ? (
            <div className="diagnostics-empty">{message}</div>
          ) : visibleEvents.length === 0 ? (
            state !== "loading" && <div className="diagnostics-empty">Bu filtrelerle eşleşen kayıt yok.</div>
          ) : visibleEvents.map((event) => (
            <button
              className={`diagnostics-event is-${event.level.toLowerCase()}${selectedSequence === event.sequence ? " is-selected" : ""}`}
              type="button"
              role="listitem"
              onClick={() => setSelectedSequence(event.sequence)}
              key={event.sequence}
            >
              <time>{formatTime(event.timestamp)}</time>
              <span className="diagnostics-event-level">{event.level}</span>
              <span className="diagnostics-event-scope">{event.scope}</span>
              <span className="diagnostics-event-name">{event.event}</span>
              <span className="diagnostics-event-message">{event.message}</span>
            </button>
          ))}
        </div>

        <aside className="diagnostics-detail" aria-label="Seçili log kaydı">
          {selectedEvent ? (
            <>
              <div className="diagnostics-detail-heading">
                <strong>{selectedEvent.event}</strong>
                <span>#{selectedEvent.sequence} · {selectedEvent.process} · {selectedEvent.scope}</span>
              </div>
              <p>{selectedEvent.message}</p>
              {selectedEvent.operationId && <code>operationId: {selectedEvent.operationId}</code>}
              {selectedEvent.meta && Object.keys(selectedEvent.meta).length > 0 && (
                <pre>{JSON.stringify(selectedEvent.meta, null, 2)}</pre>
              )}
              {selectedEvent.error && (
                <pre>{selectedEvent.error.stack || `${selectedEvent.error.name}: ${selectedEvent.error.message}`}</pre>
              )}
            </>
          ) : (
            <div className="diagnostics-empty">Detay ve bağlam kopyalama için bir kayıt seçin.</div>
          )}
        </aside>
      </div>
    </WorkspaceFrame>
    {supportReportOpen && <SupportReportDialog onClose={() => setSupportReportOpen(false)} />}
    </>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
}

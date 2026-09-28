import { roomWorkspaceDefinition, tableWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
// Browser-only contract harness, served by smoke-workspace-platform.mjs. No production entry.
import { Component, StrictMode, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { PageHeader } from "../../apps/desktop-app/src/components/layout/PageHeader";
import { WorkspaceFrame } from "../../apps/desktop-app/src/components/workspace/WorkspaceFrame";
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceCloseGuard, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { WorkspaceTabs, WorkspaceTabList, WorkspaceTabPanel } from "../../apps/desktop-app/src/components/workspace/WorkspaceTabs";
import { useRequestGeneration } from "../../apps/desktop-app/src/components/workspace/use-request-generation";
import type { WorkspaceIntent } from "../../apps/desktop-app/src/components/workspace/workspace-intent";
import { FormDialog } from "../../apps/desktop-app/src/components/ui/FormDialog";
import { DiagnosticsViewer } from "../../apps/desktop-app/src/components/diagnostics/DiagnosticsViewer";
import { applyUiPreferences } from "../../apps/desktop-app/src/ui-preferences";
import "../../apps/desktop-app/src/styles/index.css";

const test = window as unknown as { lock: () => void; mounts: number; returned: unknown; appearance: typeof applyUiPreferences; openOther: () => boolean; changePresentation: () => void; openSame: () => boolean; openTable: () => boolean; openUnknown: () => boolean; presentation?: string; beginGeneration: () => () => boolean; wrongMode: () => void };
test.mounts = 0;
test.appearance = applyUiPreferences;
function FixtureWorkspace() {
  const nav = useWorkspaceNavigation();
  test.beginGeneration = useRequestGeneration();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const blocked = useWorkspaceCloseGuard({ busy, dirty });
  useEffect(() => { test.mounts++; }, []);
  const { intent, presentation } = nav.current!;
  const mode = intent.mode ?? "summary";
  return <WorkspaceTabs value={mode}>
    <WorkspaceFrame title={`${intent.entityType === "room" ? "Room" : "Table"} ${intent.entityId}`} context={intent.action ?? "Inspect"} presentation={presentation}
      onPresentationChange={nav.updateWorkspacePresentation} onClose={() => nav.closeWorkspace()} closeBlocked={blocked}
      returnFocusRef={nav.returnFocusRef} dismissOnBackdrop
      navigation={<WorkspaceTabList label="Room modes" tabs={[{ id: "summary", label: "Summary" }, { id: "account", label: "Account" }, { id: "history", label: "History" }]} onChange={mode => nav.updateWorkspaceMode({ entityType: "room", mode: mode as "summary" | "account" | "history" })} />}
      footer={<button onClick={() => { setBusy(false); setDirty(false); }}>Clear guard</button>}>
      <label><input type="checkbox" checked={busy} onChange={e => setBusy(e.target.checked)} />Busy</label>
      <label><input type="checkbox" checked={dirty} onChange={e => setDirty(e.target.checked)} />Dirty</label>
      <WorkspaceTabPanel value="summary"><p>Summary panel</p></WorkspaceTabPanel>
      <WorkspaceTabPanel value="account">
        <label>Draft<input value={draft} onChange={e => setDraft(e.target.value)} /></label>
        <button onClick={() => nav.updateWorkspaceMode({ entityType: "room", mode: "account", action: intent.action ? undefined : "payment" })}>Toggle payment</button>
        {intent.action && <p>Payment subflow</p>}
        {Array.from({ length: 80 }, (_, i) => <p key={i}>Account row {i}</p>)}
      </WorkspaceTabPanel>
      <WorkspaceTabPanel value="history"><p>History panel</p></WorkspaceTabPanel>
    </WorkspaceFrame>
  </WorkspaceTabs>;
}
function Unlocked() {
  const nav = useWorkspaceNavigation();
  const contentRef = useRef<HTMLElement>(null);
  const [surface, setSurface] = useState<"form" | "diagnostics" | null>(null);
  const [filter, setFilter] = useState("original filter");
  const open = (id: string) => nav.openWorkspace({ entityType: "room", entityId: id, mode: "account", returnContext: { page: "pension", view: "rooms", entityId: "selection" } }, { onReturn: context => { test.returned = context; } });
  test.openOther = () => open("102");
  test.openSame = () => open("101");
  test.openTable = () => nav.openWorkspace({ entityType: "table", entityId: "1", returnContext: { page: "restaurant", view: "floor" } }, { onReturn: context => { test.returned = context; } });
  test.openUnknown = () => nav.openWorkspace({ entityType: "unknown", entityId: "1" } as unknown as WorkspaceIntent);
  test.presentation = nav.current?.presentation;
  test.wrongMode = () => nav.updateWorkspaceMode({ entityType: "table", mode: "order" });
  test.changePresentation = () => nav.updateWorkspacePresentation(nav.current?.presentation === "centered" ? "full-canvas" : "centered");
  return <AppShell contentRef={contentRef} sidebar={<aside className="sidebar">Sidebar</aside>}
    header={<PageHeader title="Feature page" />} overlay={<>
      <WorkspaceHost definition={{ ...roomWorkspaceDefinition, sessionPage: undefined, render: () => <FixtureWorkspace /> }} context={{}} />
      <WorkspaceHost definition={{ ...tableWorkspaceDefinition, sessionPage: undefined, render: () => <FixtureWorkspace /> }} context={{}} />
      {surface === "diagnostics" && <DiagnosticsViewer onClose={() => setSurface(null)} />}
      {surface === "form" && <FormDialog title="Bounded task" onClose={() => setSurface(null)} onSubmit={e => { e.preventDefault(); setSurface(null); }} footer={<button type="submit">Save task</button>}><label>Task name<input /></label></FormDialog>}
    </>}>
    <label>Feature filter<input value={filter} onChange={e => setFilter(e.target.value)} /></label>
    <button onClick={() => open("101")}>Entry one</button>
    <button onClick={() => open("101")}>Entry two</button>
    <button onClick={() => setSurface("form")}>Open form</button>
    <button onClick={() => setSurface("diagnostics")}>Open diagnostics</button>
  </AppShell>;
}
class ExpectedModalBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <p role="alert">{this.state.error}</p> : this.props.children; }
}
function Harness() {
  const [nested, setNested] = useState(false);
  const [locked, setLocked] = useState(false);
  test.lock = () => setLocked(true);
  // This harness proves the transient modal host. Hospitality sessions are covered
  // by the pension/restaurant workspace smokes, so session ownership is stripped here.
  const transientDefinitions = workspaceDefinitions.map(item => ({ ...item, sessionPage: undefined }));
  if (nested) return <ExpectedModalBoundary><WorkspaceFrame title="Outer" presentation="centered" onClose={() => {}}>
    <FormDialog title="Forbidden nested task" onClose={() => {}} onSubmit={e => e.preventDefault()} footer={<button type="submit">Confirm</button>}>Nested</FormDialog>
  </WorkspaceFrame></ExpectedModalBoundary>;
  return locked ? <><button onClick={() => setNested(true)}>Test nested contract</button><button onClick={() => setLocked(false)}>Unlock</button></> : <WorkspaceNavigationProvider definitions={new URLSearchParams(location.search).has("swap") ? transientDefinitions.map(item => ({ ...item, defaultPresentation: item.defaultPresentation === "centered" ? "full-canvas" : "centered" })) : transientDefinitions} page="pension"><Unlocked /></WorkspaceNavigationProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopIdentityImageAnalyzeResult,
  SaveCustomerInput
} from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { WorkspacePageFrame } from "../workspace/WorkspaceFrame";
import { OperationPanel } from "../workspace/OperationPanel";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import type { RoomWorkspaceIntent } from "../workspace/workspace-intent";
import { RoomAccount } from "./RoomAccount";
import { RoomAccountAdjustments } from "./RoomAccountAdjustments";
import { useRoomFolioController } from "./use-room-folio-controller";
import { RoomHistory } from "./RoomHistory";
import { roomConditionLabel } from "./room-presentation";
import { roomIdentity } from "./room-card-model";
import { getRoomWorkspaceModel } from "./room-workspace-model";
import { useRoomStayOperations } from "./use-room-stay-operations";
import { RoomStayPanel } from "./RoomStayPanel";
import { RoomCheckoutAction, RoomDailyOperations } from "./RoomDailyOperations";
import { RoomStayDates } from "./RoomStayDates";
import { ResourceWorkspaceSummary } from "../operations/ResourceWorkspaceSummary";
import { CustomerCreateEditor } from "../customers/CustomerCreateEditor";
import { ChoiceChips } from "../ui/ChoiceChips";
import { setRoomOperationalStatus } from "./room-operations";

export interface RoomWorkspaceProps {
  intent: RoomWorkspaceIntent; data: DesktopDashboardData; onDashboard: (data: DesktopDashboardData) => void;
  staysEnabled: boolean; reservationsEnabled: boolean; folioEnabled: boolean; menuEnabled: boolean; customersEnabled: boolean; aiEnabled: boolean;
  onSaveCustomer: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
}

export function RoomWorkspace({ intent, data, onDashboard, staysEnabled, reservationsEnabled, folioEnabled, menuEnabled,
  customersEnabled, aiEnabled, onSaveCustomer, onAnalyzeIdentity }: RoomWorkspaceProps) {
  const navigation = useWorkspaceNavigation();
  const model = getRoomWorkspaceModel(data, intent.entityId, staysEnabled, reservationsEnabled);
  // Current account always follows the actual checked-in stay. Prior-account intents focus their own context below.
  const account = useRoomFolioController(intent.entityId, folioEnabled, model.refreshKey, { stayId: model.currentStay?.id,
    folioId: model.currentStay ? model.operations?.accounts.find(item => item.stayId === model.currentStay!.id)?.folioId : undefined });
  const operations = useRoomStayOperations(model, account, onDashboard);
  const [dirtyForms, setDirtyForms] = useState<Record<string, boolean>>({});
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [quickAction, setQuickAction] = useState<"customer" | null>(null);
  const [quickCustomerId, setQuickCustomerId] = useState("");
  const dirty = Object.values(dirtyForms).some(Boolean);
  const busy = operations.busy || account.busy;
  const blocked = useWorkspaceCloseGuard({ busy, dirty, scope: { entityType: "room", entityId: intent.entityId } });
  const surface = useRef<HTMLDivElement>(null);
  const history = intent.mode === "history";
  const accountFocus = useRef("");
  const followedStay = useRef(model.currentStay?.id);
  useEffect(() => {
    if (model.currentStay) { followedStay.current = model.currentStay.id; return; }
    if (busy || dirty || !followedStay.current) return;
    const moved = data.roomOperations?.flatMap(item => item.stays).find(stay => stay.id === followedStay.current && stay.status === "checked_in");
    if (moved && moved.roomId !== intent.entityId) navigation.openWorkspace({ ...intent, entityId: moved.roomId, stayId: moved.id });
  }, [model.currentStay, data.roomOperations, busy, dirty, intent, navigation]);
  const accountDraftDirty = Object.entries(dirtyForms).some(([key, value]) => value && !["stay", "condition"].includes(key));
  useEffect(() => {
    if (history || account.loading || !folioEnabled) return;
    const key = `${intent.mode}|${intent.action}|${intent.folioId}|${intent.stayId}`;
    if (accountFocus.current === key) return;
    if (intent.mode !== "account" && intent.action !== "payment") return;
    const records = Array.from(surface.current?.querySelectorAll<HTMLElement>("[data-folio-id]") ?? []);
    const record = records.find(element => intent.folioId ? element.dataset.folioId === intent.folioId && (!intent.stayId || element.dataset.stayId === intent.stayId)
      : intent.stayId ? element.dataset.stayId === intent.stayId : element.dataset.folioId === account.selected?.id);
    if (!record) return;
    accountFocus.current = key;
    const target = intent.action === "payment" ? record.querySelector<HTMLElement>("input") ?? record : record;
    target.focus({ preventScroll: true }); target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [history, account.loading, account.folios, account.selected?.id, folioEnabled, intent.mode, intent.action, intent.folioId, intent.stayId]);
  function setDirty(key: string, value: boolean) { setDirtyForms(current => ({ ...current, [key]: value })); }
  useLayoutEffect(() => {
    if (history) return;
    const target = intent.mode === "account" || intent.action === "payment" ? "room-account"
      : ["check-in", "checkout", "room-status"].includes(intent.action ?? "") ? "room-operations"
        : intent.mode === "stay" || intent.action ? "room-stay" : "";
    const panel = target ? surface.current?.querySelector<HTMLElement>(`#${target}`) : null;
    panel?.focus({ preventScroll: true });
    panel?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [history, intent.mode, intent.action, intent.stayId, intent.folioId]);
  const { room, state } = model;
  if (!room || !state) return <WorkspacePageFrame title="Oda kullanılamıyor" onClose={() => navigation.closeWorkspace({ entityType: "room", entityId: intent.entityId })}><p>Oda kaydı bulunamadı veya bu yetenek kullanılamıyor.</p></WorkspacePageFrame>;
  return <WorkspacePageFrame title={roomIdentity(room)} className="operations-workspace" bodyScroll="panes"
    context={history && <div className="room-workspace-context"><span>Fiziksel durum: {roomConditionLabel[state.operationalCondition]}{!room.isActive && " · Etkin değil"}</span>
      <span>Doluluk: {state.occupancy.status === "occupied" ? "Dolu" : "Boş"}</span>{model.currentStay && <span>{model.currentStay.customerName}</span>}</div>}
    headerSummary={!history && <ResourceWorkspaceSummary label="Oda özeti" imageSrc="./assets/default-room.png"
      facts={<>
        <div className="room-workspace-summary__copy">
          <strong>{roomIdentity(room)}</strong>
          <div className="room-workspace-summary__meta">
            <span>{room.capacity} kişilik</span>
            {room.floor && <span>Kat: {room.floor}</span>}
            {room.bedInfo && <span>{room.bedInfo}</span>}
          </div>
        </div>
        {model.canSetCondition && <ChoiceChips
          className="workspace-status-chips"
          ariaLabel="Fiziksel oda durumu"
          value={state.operationalCondition === "ready" ? "available" : state.operationalCondition}
          disabled={busy}
          onChange={value => {
            const current = state.operationalCondition === "ready" ? "available" : state.operationalCondition;
            if (value === current || value === "out_of_service") return;
            void operations.mutate("operations", () => setRoomOperationalStatus(room.id, value));
          }}
          options={[
            { id: "available", label: "Hazır" },
            { id: "cleaning", label: "Temizlik" },
            { id: "maintenance", label: "Bakımda" }
          ]}
        />}
      </>}
      status={null}>
      {model.currentStay ? <span>{model.currentStay.guestCount > room.capacity
        ? `${model.currentStay.guestCount} kişi · ${room.capacity} kişilik oda · ${model.currentStay.customerName}`
        : `${model.currentStay.guestCount}/${room.capacity} dolu · ${model.currentStay.customerName}`}</span>
        : <span>{model.conflict ? "Konaklama kayıtlarını kontrol edin." : model.active.length ? "Planlanan konaklama var." : `0/${room.capacity} dolu`}</span>}
    </ResourceWorkspaceSummary>}
    actions={<>
      {!history && model.currentStay && <RoomCheckoutAction
        model={model}
        data={data}
        operations={operations}
        disabled={busy || accountDraftDirty}
      />}
      <ActionButton variant="ghost" disabled={busy} onClick={() => {
        setQuickAction(null);
        navigation.updateWorkspaceMode({ entityType: "room", mode: history ? "summary" : "history" });
      }}>
        {history ? `← ${roomIdentity(room)}'e dön` : "Geçmiş"}
      </ActionButton>
      {intent.returnContext?.page === "restaurant" && intent.returnContext.entityId && <ActionButton variant="secondary" disabled={busy || dirty}
        onClick={() => navigation.openWorkspace({ entityType: "table", entityId: intent.returnContext!.entityId!, mode: "account", action: "room-transfer",
          returnContext: { page: "restaurant", view: "floor" } })}>Masa Hesabına Dön</ActionButton>}</>}
    onClose={() => navigation.closeWorkspace({ entityType: "room", entityId: intent.entityId })} closeBlocked={blocked || Boolean(quickAction)}
    footer={dirty && <div className="action-row"><span>Kaydedilmemiş alanlar var.</span><ActionButton variant="secondary" disabled={busy} onClick={() => { setDirtyForms({}); setDraftEpoch(value => value + 1); }}>Değişiklikleri Bırak</ActionButton></div>}
    overlay={!history && quickAction === "customer" ? <CustomerCreateEditor
      open
      withinWorkspace
      aiEnabled={aiEnabled}
      onClose={() => setQuickAction(null)}
      onSave={onSaveCustomer}
      onAnalyzeIdentity={onAnalyzeIdentity}
      onCreated={customerId => setQuickCustomerId(customerId)}
    /> : undefined}>
    <div ref={surface} className="operation-surface operation-surface--sections operation-surface--room" hidden={history} key={draftEpoch}>
      <OperationPanel title="Misafirler ve Konaklama" id="room-stay">
        {account.selected?.status === "open" && <RoomStayDates
          key={account.selected.id}
          folio={account.selected}
          controller={account}
          disabled={busy || account.loading}
          onDirty={value => setDirty("stay-dates", value)}
        />}
        <RoomStayPanel model={model} data={data} intent={intent} operations={operations} disabled={busy} staysEnabled={staysEnabled}
          quickCustomerId={quickCustomerId} onQuickCustomerHandled={() => setQuickCustomerId("")}
          onCreateCustomer={customersEnabled ? () => setQuickAction("customer") : undefined}
          onDirty={value => setDirty("stay", value)} />
      </OperationPanel>
      <OperationPanel title="Oda İşlemleri" id="room-operations">
        <RoomDailyOperations model={model} data={data} operations={operations} disabled={busy || accountDraftDirty} />
        {account.selected?.status === "open" && <RoomAccountAdjustments key={account.selected.id} folio={account.selected} controller={account} menuEnabled={menuEnabled} disabled={busy || account.loading} onDirty={(key, value) => setDirty(key, value)} />}
      </OperationPanel>
      <OperationPanel title="Hesap" id="room-account">
        {folioEnabled ? <RoomAccount controller={account} currentStayId={model.currentStay?.id} focusFolioId={intent.folioId} ambiguous={Boolean(model.state && model.state.occupancy.stayIds.length > 1)} menuEnabled={menuEnabled} disabled={busy || account.loading} onDirty={(key, value) => setDirty(key, value)} />
          : <p>Oda hesabı yönetimi bu işletmede etkin değil.</p>}
      </OperationPanel>
    </div>
    {history && <RoomHistory model={model} operations={operations} account={account} disabled={busy} />}
  </WorkspacePageFrame>;
}

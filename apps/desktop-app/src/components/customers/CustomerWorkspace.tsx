import { SearchSelect } from "../ui/SearchSelect";
import { BusinessTemplateMessagePanel } from "./BusinessTemplateMessagePanel";
import { CustomerMessagingPreferences } from "./CustomerMessagingPreferences";
import { useEffect, useMemo, useState } from "react";
import { BedDouble, History, MessageCircle, Save, Trash2 } from "lucide-react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopCustomerMutationResult, DesktopDashboardData, DesktopIdentityImageAnalyzeResult, DesktopStatusUpdateResult, SaveCustomerInput } from "../../../electron/database";
import { customerFormToInput, formatCustomerLastContactDate, formatCustomerSource, formatStayDateRange, toCustomerForm, type CustomerFormState } from "../../app/customer-model";
import { formatRequestStatus, formatRequestType, formatReservationDate, formatReservationStatus } from "../../app/record-formatters";
import { customerCreditError } from "../../app/customer-credit-ui";
import { reportAppStatus } from "../../app/runtime-state";
import type { EphemeralWhatsAppHandoff } from "../../app/whatsapp-handoff";
import type { CustomerWorkspaceIntent } from "../workspace/workspace-intent";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";
import { DealerWebAccessPanel } from "./DealerWebAccessPanel";
import { CustomerCreditPanel } from "./CustomerCreditPanel";
import { CustomerRoomReceivablesPanel } from "./CustomerRoomReceivablesPanel";
import { CustomerFormFields } from "./CustomerFormFields";
import { CustomerHistoryView } from "./CustomerHistoryView";

type SaveState = "idle" | "loading" | "success" | "error";

export interface CustomerWorkspaceProps {
  intent: CustomerWorkspaceIntent;
  data: DesktopDashboardData;
  aiEnabled: boolean;
  whatsappEnabled: boolean;
  reservationsEnabled: boolean;
  staysEnabled: boolean;
  accommodationFolioEnabled?: boolean;
  customerCreditEnabled: boolean;
  wholesaleEnabled?: boolean;
  onPreparedCreditWhatsApp?: (message: EphemeralWhatsAppHandoff) => void;
  onWhatsApp: (customer: DesktopDashboardData["customers"][number]) => void;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
  onDelete: (customer: DesktopDashboardData["customers"][number]) => Promise<DesktopStatusUpdateResult | undefined>;
}

export function CustomerWorkspace(props: CustomerWorkspaceProps) {
  const {
    intent,
    data,
    aiEnabled,
    whatsappEnabled,
    reservationsEnabled,
    staysEnabled,
    accommodationFolioEnabled = false,
    customerCreditEnabled,
    wholesaleEnabled = false,
    onPreparedCreditWhatsApp,
    onWhatsApp,
    onSave,
    onAnalyzeIdentity,
    onDelete
  } = props;
  const navigation = useWorkspaceNavigation();
  const customer = data.customers.find((item) => item.id === intent.entityId) ?? null;
  const [form, setForm] = useState<CustomerFormState>(() => toCustomerForm(customer));
  const [baseline, setBaseline] = useState<CustomerFormState>(() => toCustomerForm(customer));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [entryRoomId, setEntryRoomId] = useState(data.rooms.find((room) => room.isActive)?.id ?? "");
  const [messagingBusy, setMessagingBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const closeBlocked = useWorkspaceCloseGuard({ busy: saveState === "loading" || messagingBusy, dirty });
  const history = intent.mode === "history";
  const presentation = navigation.current?.presentation ?? "centered";

  useEffect(() => {
    if (!customer || baseline.id === customer.id) return;
    const next = toCustomerForm(customer);
    setForm(next);
    setBaseline(next);
    setSaveState("idle");
  }, [baseline.id, customer]);

  const selectedRequests = useMemo<SyncedCustomerRequest[]>(
    () => customer ? data.requests.filter((request) => request.customer_id === customer.id || request.customer_phone === customer.phone) : [],
    [customer, data.requests]
  );
  const selectedReservations = useMemo(
    () => customer ? data.reservations.filter((reservation) => reservation.customerId === customer.id || reservation.customerPhone === customer.phone) : [],
    [customer, data.reservations]
  );
  const selectedStays = useMemo(
    () => customer ? data.customerRoomStays.filter((stay) => stay.guests?.some((guest) => guest.customerId === customer.id) || stay.customerId === customer.id) : [],
    [customer, data.customerRoomStays]
  );
  const activeStay = customer
    ? (data.roomOperations?.flatMap((room) => room.stays) ?? data.customerRoomStays).find((stay) =>
        stay.guests?.some((guest) => guest.customerId === customer.id && ["planned", "checked_in"].includes(guest.status))
      )
    : undefined;
  const latestRequest = selectedRequests[0];
  const latestReservation = selectedReservations[0];

  if (!customer) {
    return <WorkspaceFrame
      className="customer-workspace-frame"
      title="Müşteri bulunamadı"
      context="Kayıt yenilenmiş veya silinmiş olabilir."
      presentation={presentation}
      onPresentationChange={navigation.updateWorkspacePresentation}
      onClose={() => navigation.closeWorkspace()}
      closeBlocked={closeBlocked}
      returnFocusRef={navigation.returnFocusRef}
      dismissOnBackdrop
    >
      <div className="empty-state"><strong>Müşteri kaydı artık kullanılamıyor.</strong><p>Çalışma alanını kapatıp müşteri listesini yenileyin.</p></div>
    </WorkspaceFrame>;
  }

  const customerId = customer.id;

  async function saveCustomer() {
    setSaveState("loading");
    const result = await onSave(customerFormToInput(form, wholesaleEnabled));
    if (!result.ok) {
      setSaveState("error");
      return;
    }
    setBaseline(form);
    setSaveState("success");
  }

  function leaveFor(action: () => void) {
    if (navigation.closeWorkspace()) action();
  }

  function openStay(stay: DesktopDashboardData["customerRoomStays"][number]) {
    navigation.openWorkspace({
      entityType: "room",
      entityId: stay.roomId,
      mode: "stay",
      stayId: stay.id,
      returnContext: { page: "customerWork", entityId: customerId }
    });
  }

  return <WorkspaceFrame
    className="customer-workspace-frame"
    title={customer.fullName}
    context={<span>{formatCustomerSource(customer.source)} · Son temas {formatCustomerLastContactDate(customer.lastContactAt || customer.updatedAt)}</span>}
    actions={<ActionButton
      variant="ghost"
      size="sm"
      disabled={saveState === "loading" || messagingBusy || dirty}
      title={dirty ? "Geçmişe geçmeden önce değişiklikleri kaydedin veya geri alın." : undefined}
      onClick={() => navigation.updateWorkspaceMode({ entityType: "customer", mode: history ? "main" : "history" })}
    >
      <History size={15} aria-hidden="true" />{history ? "← Müşteriye dön" : "Geçmiş"}
    </ActionButton>}
    presentation={presentation}
    onPresentationChange={navigation.updateWorkspacePresentation}
    onClose={() => navigation.closeWorkspace()}
    closeBlocked={closeBlocked}
    returnFocusRef={navigation.returnFocusRef}
    dismissOnBackdrop
    footer={!history ? <div className="customer-workspace-footer">
      <ActionButton
        variant="secondary"
        type="button"
        disabled={saveState === "loading" || !dirty}
        onClick={() => {
          setForm(baseline);
          setSaveState("idle");
        }}
      >
        Değişiklikleri Geri Al
      </ActionButton>
      <ActionButton type="button" disabled={saveState === "loading" || !dirty} onClick={() => void saveCustomer()}>
        <Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Müşteri Kartını Kaydet"}
      </ActionButton>
    </div> : undefined}
  >
    {!history ? <div className="customer-workspace-main">
      <form className="customer-workspace-profile" onSubmit={(event) => { event.preventDefault(); void saveCustomer(); }}>
        <CustomerFormFields
          form={form}
          aiEnabled={aiEnabled}
          wholesaleEnabled={wholesaleEnabled}
          onChange={setForm}
          onAnalyzeIdentity={onAnalyzeIdentity}
        />
      </form>

      <aside className="customer-workspace-operations" aria-label="Müşteri işlemleri">
        <CustomerMessagingPreferences key={`preference-${customer.id}`} customerId={customerId} disabled={dirty || saveState === "loading" || messagingBusy} onBusyChange={setMessagingBusy} />
        <BusinessTemplateMessagePanel key={`business-message-${customer.id}`} customerId={customerId} disabled={dirty || saveState === "loading" || !customer.phone} onBusyChange={setMessagingBusy} />
        {wholesaleEnabled && customer.commercialProfile?.dealerStatus === "active" && <DealerWebAccessPanel key={customer.id} customerId={customerId} disabled={dirty || saveState === "loading"} />}
        {staysEnabled && <section className="panel customer-operation-card form-stack" aria-label="Konaklama">
          <div className="customer-operation-card__heading">
            <div><h3>Konaklama</h3><small>Oda ve aktif kalış</small></div>
            {activeStay && <StatusBadge tone="success">Aktif</StatusBadge>}
          </div>
          {activeStay ? <>
            <div className="customer-operation-record">
              <strong>{activeStay.roomNumber ? `Oda ${activeStay.roomNumber}` : activeStay.roomName}</strong>
              <span>{formatStayDateRange(activeStay)}</span>
            </div>
            <ActionButton variant="secondary" onClick={() => navigation.openWorkspace({
              entityType: "room",
              entityId: activeStay.roomId,
              mode: "stay",
              stayId: activeStay.id,
              returnContext: { page: "customerWork", entityId: customerId }
            })}>Konaklamayı Aç</ActionButton>
          </> : <>
            <p className="customer-operation-empty">Aktif konaklama yok.</p>
            <label className="form-field">
              <span>Konaklama odası</span>
              <SearchSelect ariaLabel="Konaklama odası" value={entryRoomId} onChange={setEntryRoomId} clearable={false} options={data.rooms.filter(room => room.isActive).map(room => ({ id: room.id, label: room.name }))} />
            </label>
            <ActionButton
              type="button"
              onClick={() => navigation.openWorkspace({
                entityType: "room",
                entityId: entryRoomId,
                mode: "stay",
                action: "create-stay",
                customerId,
                returnContext: { page: "customerWork", entityId: customerId }
              })}
              disabled={!entryRoomId}
            >
              <BedDouble size={16} aria-hidden="true" />Konaklama Başlat
            </ActionButton>
          </>}
        </section>}

        {(reservationsEnabled || selectedRequests.length > 0) && <section className="panel customer-operation-card form-stack" aria-label="Yakın kayıtlar">
          <div className="customer-operation-card__heading">
            <div><h3>Yakın kayıtlar</h3><small>Son operasyon özeti</small></div>
          </div>
          {reservationsEnabled && <div className="customer-related-record">
            <span>Rezervasyon</span>
            {latestReservation ? <>
              <strong>{latestReservation.title}</strong>
              <small>{formatReservationStatus(latestReservation.status)} · {formatReservationDate(latestReservation)}</small>
              {selectedReservations.length > 1 && <small>Toplam {selectedReservations.length} kayıt</small>}
            </> : <small>Rezervasyon yok.</small>}
          </div>}
          <div className="customer-related-record">
            <span>Son talep</span>
            {latestRequest ? <>
              <strong>{formatRequestType(latestRequest.request_type)}</strong>
              <small>{formatRequestStatus(latestRequest.status)} · {latestRequest.date_text || latestRequest.start_date || "-"}</small>
            </> : <small>Talep yok.</small>}
          </div>
        </section>}

        {accommodationFolioEnabled && <CustomerRoomReceivablesPanel key={`room-receivables-${customer.id}`} customerId={customerId} />}

        {customerCreditEnabled && <CustomerCreditPanel
          key={customer.id}
          customerId={customerId}
          whatsappEnabled={whatsappEnabled}
          onPreparedWhatsApp={onPreparedCreditWhatsApp ? (message) => leaveFor(() => onPreparedCreditWhatsApp(message)) : undefined}
        />}

        <section className="panel customer-operation-card form-stack" aria-label="Hızlı işlemler">
          <div className="customer-operation-card__heading"><div><h3>Hızlı işlemler</h3><small>Müşteri kaydı</small></div></div>
          <div className="action-row customer-workspace-quick-actions">
            {whatsappEnabled && <ActionButton
              
              size="sm"
              type="button"
              onClick={() => leaveFor(() => onWhatsApp(customer))}
              disabled={!customer.phone}
            >
              <MessageCircle size={16} aria-hidden="true" />WhatsApp'tan Yaz
            </ActionButton>}
            <ActionButton variant="danger" size="sm" type="button" disabled={closeBlocked} onClick={async () => {
              try {
                const result = await onDelete(customer);
                if (result?.ok) navigation.closeWorkspace();
                else if (result && !result.ok) reportAppStatus("error", result.message);
              } catch (error) {
                reportAppStatus("error", customerCreditError(error, "Müşteri silinemedi. Yeniden deneyin."));
              }
            }}>
              <Trash2 size={16} aria-hidden="true" />Müşteriyi Sil
            </ActionButton>
          </div>
        </section>
      </aside>
    </div> : <CustomerHistoryView
      requests={selectedRequests}
      reservations={selectedReservations}
      stays={selectedStays}
      reservationsEnabled={reservationsEnabled}
      staysEnabled={staysEnabled}
      onOpenStay={openStay}
    />}
  </WorkspaceFrame>;
}

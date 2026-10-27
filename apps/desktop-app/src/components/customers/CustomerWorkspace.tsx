import { SearchSelect } from "../ui/SearchSelect";
import { BusinessTemplateMessagePanel } from "./BusinessTemplateMessagePanel";
import { CustomerMessagingPreferences } from "./CustomerMessagingPreferences";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BedDouble, History, MessageCircle, Save, Trash2 } from "lucide-react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopCustomerMutationResult, DesktopDashboardData, DesktopIdentityImageAnalyzeResult, DesktopStatusUpdateResult, SaveCustomerInput } from "../../../electron/database";
import { customerFormToInput, formatCustomerLastContactDate, formatCustomerSource, formatStayDateRange, toCustomerForm, type CustomerFormState } from "../../app/customer-model";
import { formatRequestStatus, formatRequestType, formatReservationDate, formatReservationStatus } from "../../app/record-formatters";
import { customerCreditError } from "../../app/customer-credit-ui";
import { reportAppStatus } from "../../app/runtime-state";
import type { EphemeralWhatsAppHandoff } from "../../app/whatsapp-handoff";
import type { CustomerWorkspaceIntent } from "../workspace/workspace-intent";
import { DetailSectionCard, DetailWorkspaceLayout } from "../workspace/DetailWorkspaceLayout";
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
  dealerPortalEnabled: boolean;
  onPreparedCreditWhatsApp?: (message: EphemeralWhatsAppHandoff) => void;
  onWhatsApp: (customer: DesktopDashboardData["customers"][number]) => void;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File, isCurrent?: () => boolean) => Promise<DesktopIdentityImageAnalyzeResult>;
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
  const [activeId, setActiveId] = useState(intent.mode === "create" ? "" : intent.entityId);
  const creating = !activeId;
  const [loadedCustomer, setLoadedCustomer] = useState<DesktopDashboardData["customers"][number] | null>(null);
  const [customerLoadError, setCustomerLoadError] = useState("");
  const [customerLoading, setCustomerLoading] = useState(Boolean(activeId && window.yardimciDesktop?.getCustomer));
  const hydratedId = useRef("");
  useEffect(() => {
    if (!activeId || !window.yardimciDesktop?.getCustomer) return;
    let current = true;
    setCustomerLoading(true); setCustomerLoadError("");
    void window.yardimciDesktop.getCustomer(activeId).then(value => {
      if (current) {
        hydratedId.current = "";
        setLoadedCustomer(value);
        if (!value) setCustomerLoadError("Müşteri kaydı bulunamadı.");
      }
    }).catch(error => { if (current) setCustomerLoadError(error instanceof Error ? error.message : "Müşteri okunamadı."); })
      .finally(() => { if (current) setCustomerLoading(false); });
    return () => { current = false; };
  }, [activeId]);
  const customer = loadedCustomer?.id === activeId ? loadedCustomer : data.customers.find(item => item.id === activeId) ?? null;
  const formId = useId();
  const saveLock = useRef(false);
  const [pendingSavedId, setPendingSavedId] = useState("");
  const [form, setForm] = useState<CustomerFormState>(() => toCustomerForm(customer));
  const [formRevision, setFormRevision] = useState(0);
  const formGeneration = useRef(0);
  const [baseline, setBaseline] = useState<CustomerFormState>(() => toCustomerForm(customer));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [entryRoomId, setEntryRoomId] = useState(data.rooms.find((room) => room.isActive)?.id ?? "");
  const [messagingBusy, setMessagingBusy] = useState(false);
  const [fieldsBusy, setFieldsBusy] = useState(false);
  const [identityActionsTarget, setIdentityActionsTarget] = useState<HTMLDivElement | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const closeBlocked = useWorkspaceCloseGuard({ busy: saveState === "loading" || messagingBusy || fieldsBusy || customerLoading, dirty });
  const [history, setHistory] = useState(intent.mode === "history");
  const presentation = navigation.current?.presentation ?? "centered";
  const closeWorkspace = () => navigation.closeWorkspace(undefined, intent.mode === "create" && activeId ? { createdEntityId: activeId } : undefined);

  useEffect(() => {
    if (!pendingSavedId || closeBlocked) return;
    navigation.closeWorkspace(
      { entityType: "customer", entityId: intent.entityId },
      intent.mode === "create" ? { createdEntityId: pendingSavedId } : undefined
    );
  }, [closeBlocked, intent.entityId, intent.mode, navigation, pendingSavedId]);

  useEffect(() => {
    if (!customer || customerLoading || customerLoadError || hydratedId.current === customer.id || dirty) return;
    hydratedId.current = customer.id;
    const next = toCustomerForm(customer);
    setFormRevision(++formGeneration.current);
    setForm(next);
    setBaseline(next);
    setSaveState("idle");
  }, [customer, customerLoading, customerLoadError, dirty]);

  const [customerRequests, setCustomerRequests] = useState<{id: string; items: SyncedCustomerRequest[]} | null>(null);
  useEffect(() => {
    let active = true;
    if (customer?.id && window.yardimciDesktop?.getCustomerRequests) {
      window.yardimciDesktop.getCustomerRequests(customer.id).then(items => { if (active) setCustomerRequests({id: customer.id, items}); }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [customer?.id, data.requests]);
  const selectedRequests = useMemo<SyncedCustomerRequest[]>(
    () => customerRequests && customerRequests.id === customer?.id ? customerRequests.items : customer ? data.requests.filter((request) => request.customer_id === customer.id || request.customer_phone === customer.phone) : [],
    [customer, data.requests, customerRequests]
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

  if (!customer && !creating) {
    return <WorkspaceFrame
      className="customer-workspace-frame"
      title={customerLoading ? "Müşteri" : "Müşteri bulunamadı"}
      context={customerLoading ? undefined : "Kayıt yenilenmiş veya silinmiş olabilir."}
      presentation={presentation}
      onPresentationChange={navigation.updateWorkspacePresentation}
      onClose={closeWorkspace}
      closeBlocked={closeBlocked}
      returnFocusRef={navigation.returnFocusRef}
      dismissOnBackdrop
    >
      <div aria-busy={customerLoading}>
        {!customerLoading && <div className="empty-state"><strong>Müşteri kaydı artık kullanılamıyor.</strong><p role={customerLoadError ? "alert" : undefined}>{customerLoadError || "Kayıt yoksa listeyi yenileyin."}</p></div>}
      </div>
    </WorkspaceFrame>;
  }

  const customerId = activeId;

  async function saveCustomer(continueAdding = false) {
    if (saveLock.current || fieldsBusy || customerLoading || customerLoadError || messagingBusy || !form.fullName.trim()) return;
    saveLock.current = true;
    setSaveState("loading");
    try {
      const result = await onSave(customerFormToInput(form, wholesaleEnabled));
      if (!result.ok) { reportAppStatus("error", result.message); setSaveState("error"); return; }
      const persistedForm = { ...form, id: result.savedId };
      setFormRevision(++formGeneration.current);
      if (continueAdding) {
        const empty = toCustomerForm(null);
        setForm(empty); setBaseline(empty); setActiveId(""); setLoadedCustomer(null); hydratedId.current = "";
      } else {
        setForm(persistedForm); setBaseline(persistedForm); setPendingSavedId(result.savedId);
      }
      reportAppStatus("success", result.message); setSaveState("success");
    } catch (error) {
      reportAppStatus("error", error instanceof Error ? error.message : "Müşteri kaydedilemedi."); setSaveState("error");
    } finally { saveLock.current = false; }
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
    className="customer-workspace-frame detail-workspace-frame"
    bodyScroll={history ? "body" : "panes"}
    title={customer?.fullName ?? "Yeni müşteri ekle"}
    context={customer ? <span>{formatCustomerSource(customer.source)} · Son temas {formatCustomerLastContactDate(customer.lastContactAt || customer.updatedAt)}</span> : "Kaydedilmemiş"}
    actions={customer && <ActionButton
      variant="ghost"
      size="sm"
      disabled={saveState === "loading" || messagingBusy || dirty}
      title={dirty ? "Geçmişe geçmeden önce değişiklikleri kaydedin veya geri alın." : undefined}
      onClick={() => setHistory(current => !current)}
    >
      <History size={15} aria-hidden="true" />{history ? "← Müşteriye dön" : "Geçmiş"}
    </ActionButton>}
    presentation={presentation}
    onPresentationChange={navigation.updateWorkspacePresentation}
    onClose={closeWorkspace}
    closeBlocked={closeBlocked}
    returnFocusRef={navigation.returnFocusRef}
    dismissOnBackdrop
    footer={!history ? <div className="customer-workspace-footer">
      <ActionButton variant="secondary" type="button" disabled={saveState === "loading" || fieldsBusy || messagingBusy || customerLoading || !dirty} onClick={() => {
        setFormRevision(++formGeneration.current); setForm(baseline); setSaveState("idle");
      }}>Değişiklikleri Geri Al</ActionButton>
      {intent.mode === "create" && <ActionButton variant="secondary" type="submit" form={formId} name="saveMode" value="continue"
        disabled={saveState === "loading" || fieldsBusy || messagingBusy || customerLoading || Boolean(customerLoadError) || !form.fullName.trim()}>Kaydet ve Yeni Ekle</ActionButton>}
      <ActionButton type="submit" form={formId} disabled={saveState === "loading" || fieldsBusy || messagingBusy || customerLoading || Boolean(customerLoadError) || !dirty || !form.fullName.trim()}>
        <Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Müşteri Kartını Kaydet"}
      </ActionButton>
    </div> : undefined}
  >
    {!history ? <DetailWorkspaceLayout
      railLabel="Müşteri işlemleri" contentLabel="Müşteri bilgileri" rail={<>
        <DetailSectionCard className="customer-operation-card form-stack" title="Hızlı işlemler">
          <div className="customer-workspace-identity-actions" ref={setIdentityActionsTarget} />
          {customer && <div className="action-row customer-workspace-quick-actions">
            {whatsappEnabled && onWhatsApp && <ActionButton

              size="sm"
              type="button"
              onClick={() => leaveFor(() => onWhatsApp(customer))}
              disabled={!customer.phone}
            >
              <MessageCircle size={16} aria-hidden="true" />WhatsApp'tan Yaz
            </ActionButton>}
            {onDelete && <ActionButton variant="danger" size="sm" type="button" disabled={closeBlocked} onClick={() => void (async () => {
              try {
                const result = await onDelete(customer);
                if (result?.ok) navigation.closeWorkspace();
                else if (result && !result.ok) reportAppStatus("error", result.message);
              } catch (error) {
                reportAppStatus("error", customerCreditError(error, "Müşteri silinemedi. Yeniden deneyin."));
              }
            })()}>
              <Trash2 size={16} aria-hidden="true" />Müşteriyi Sil
            </ActionButton>}
          </div>}
        </DetailSectionCard>
        {customer && <>
        <CustomerMessagingPreferences key={`preference-${customer.id}`} customerId={customerId} disabled={dirty || saveState === "loading" || messagingBusy} onBusyChange={setMessagingBusy} />
        <BusinessTemplateMessagePanel key={`business-message-${customer.id}`} customerId={customerId} disabled={dirty || saveState === "loading" || !customer.phone} onBusyChange={setMessagingBusy} />
        {<DealerWebAccessPanel key={customer.id} customerId={customerId} active={customer.commercialProfile?.dealerStatus === "active"} disabled={dirty || saveState === "loading"} />}
        {staysEnabled && <DetailSectionCard className="customer-operation-card form-stack" title="Konaklama"
          actions={activeStay && <StatusBadge tone="success">Aktif</StatusBadge>}>
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
        </DetailSectionCard>}

        {(reservationsEnabled || selectedRequests.length > 0) && <DetailSectionCard className="customer-operation-card form-stack" title="Yakın kayıtlar">
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
        </DetailSectionCard>}

        {accommodationFolioEnabled && <CustomerRoomReceivablesPanel key={`room-receivables-${customer.id}`} customerId={customerId} />}

        {customerCreditEnabled && <CustomerCreditPanel
          key={customer.id}
          customerId={customerId}
          whatsappEnabled={whatsappEnabled}
          {...(onPreparedCreditWhatsApp === undefined ? {} : { onPreparedWhatsApp: (message) => leaveFor(() => onPreparedCreditWhatsApp(message)) })}
        />}

        </>}

      </>}
    >
      {customerLoadError && <p role="alert">{customerLoadError}</p>}
      <form id={formId} className="customer-workspace-profile" aria-busy={customerLoading} inert={saveState === "loading" || messagingBusy || customerLoading || Boolean(customerLoadError)} onSubmit={(event) => {
        event.preventDefault(); const submitter = event.nativeEvent.submitter;
        void saveCustomer(submitter instanceof HTMLButtonElement && submitter.value === "continue");
      }}>
        <CustomerFormFields
          key={formRevision}
          form={form}
          aiEnabled={aiEnabled}
          wholesaleEnabled={wholesaleEnabled}
          identityExpanded={staysEnabled}
          identityActionsTarget={identityActionsTarget}
          identityActionsDisabled={saveState === "loading" || messagingBusy || customerLoading || Boolean(customerLoadError)}
          onBusyChange={setFieldsBusy}
          onChange={setForm}
          isFormCurrent={() => formGeneration.current === formRevision && form.id === activeId}
          onAnalyzeIdentity={onAnalyzeIdentity}
        />
      </form>
    </DetailWorkspaceLayout> : <CustomerHistoryView
      requests={selectedRequests}
      reservations={selectedReservations}
      stays={selectedStays}
      reservationsEnabled={reservationsEnabled}
      staysEnabled={staysEnabled}
      onOpenStay={openStay}
    />}
  </WorkspaceFrame>;
}

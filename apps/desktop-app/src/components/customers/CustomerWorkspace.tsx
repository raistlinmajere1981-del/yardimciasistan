import { useEffect, useMemo, useState } from "react";
import { BedDouble, CreditCard, MessageCircle, Phone, Save, Sparkles, Trash2 } from "lucide-react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopCustomerMutationResult, DesktopDashboardData, DesktopIdentityImageAnalyzeResult, DesktopStatusUpdateResult, SaveCustomerInput } from "../../../electron/database";
import { customerFormToInput, formatCustomerGender, formatCustomerLastContactDate, formatCustomerRoomStayStatus, formatCustomerSource, formatIdentityType, formatStayDateRange, hasCustomerIdentityDetails, toCustomerForm, type CustomerFormState } from "../../app/customer-model";
import { formatDateForDisplay, formatRequestStatus, formatRequestType, formatReservationDate, formatReservationStatus } from "../../app/record-formatters";
import { customerCreditError } from "../../app/customer-credit-ui";
import type { PreparedWhatsAppMessage } from "../../app/whatsapp-handoff";
import type { CustomerWorkspaceIntent, CustomerWorkspaceMode } from "../workspace/workspace-intent";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { WorkspaceTabList, WorkspaceTabPanel, WorkspaceTabs } from "../workspace/WorkspaceTabs";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";
import { CustomerCreditPanel } from "./CustomerCreditPanel";
import { CustomerFormFields } from "./CustomerFormFields";

type SaveState = "idle" | "loading" | "success" | "error";

export interface CustomerWorkspaceProps {
  intent: CustomerWorkspaceIntent;
  data: DesktopDashboardData;
  aiEnabled: boolean;
  whatsappEnabled: boolean;
  reservationsEnabled: boolean;
  staysEnabled: boolean;
  customerCreditEnabled: boolean;
  onPreparedCreditWhatsApp?: (message: PreparedWhatsAppMessage) => void;
  onCall: (customer: DesktopDashboardData["customers"][number]) => void;
  onWhatsApp: (customer: DesktopDashboardData["customers"][number]) => void;
  onSummarize: (requestId: string) => void;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
  onDelete: (customer: DesktopDashboardData["customers"][number]) => Promise<DesktopStatusUpdateResult | undefined>;
}

export function CustomerWorkspace(props: CustomerWorkspaceProps) {
  const { intent, data, aiEnabled, whatsappEnabled, reservationsEnabled, staysEnabled, customerCreditEnabled, onPreparedCreditWhatsApp, onCall, onWhatsApp, onSummarize, onSave, onAnalyzeIdentity, onDelete } = props;
  const navigation = useWorkspaceNavigation();
  const customer = data.customers.find((item) => item.id === intent.entityId) ?? null;
  const [form, setForm] = useState<CustomerFormState>(() => toCustomerForm(customer));
  const [baseline, setBaseline] = useState<CustomerFormState>(() => toCustomerForm(customer));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("Değişiklikler yalnız bu müşteri kartına kaydedilir.");
  const [entryRoomId, setEntryRoomId] = useState(data.rooms.find((room) => room.isActive)?.id ?? "");
  const [deleteError, setDeleteError] = useState("");
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const closeBlocked = useWorkspaceCloseGuard({ busy: saveState === "loading", dirty });

  useEffect(() => {
    if (!customer || baseline.id === customer.id) return;
    const next = toCustomerForm(customer);
    setForm(next);
    setBaseline(next);
    setSaveState("idle");
    setSaveMessage("Değişiklikler yalnız bu müşteri kartına kaydedilir.");
  }, [baseline.id, customer]);

  const selectedRequests = useMemo<SyncedCustomerRequest[]>(() => customer ? data.requests.filter((request) => request.customer_id === customer.id || request.customer_phone === customer.phone) : [], [customer, data.requests]);
  const selectedReservations = useMemo(() => customer ? data.reservations.filter((reservation) => reservation.customerId === customer.id || reservation.customerPhone === customer.phone) : [], [customer, data.reservations]);
  const selectedStays = useMemo(() => customer ? data.customerRoomStays.filter((stay) => stay.customerId === customer.id) : [], [customer, data.customerRoomStays]);

  const tabs: readonly { id: CustomerWorkspaceMode; label: string }[] = customerCreditEnabled
    ? [{ id: "summary", label: "Özet" }, { id: "details", label: "Bilgiler" }, { id: "history", label: "Geçmiş" }, { id: "account", label: "Hesap" }]
    : [{ id: "summary", label: "Özet" }, { id: "details", label: "Bilgiler" }, { id: "history", label: "Geçmiş" }];
  const requestedMode = intent.mode ?? "summary";
  const mode = tabs.some((tab) => tab.id === requestedMode) ? requestedMode : "summary";
  const presentation = navigation.current?.presentation ?? "centered";

  if (!customer) {
    return <WorkspaceFrame title="Müşteri bulunamadı" context="Kayıt yenilenmiş veya silinmiş olabilir." presentation={presentation} onPresentationChange={navigation.updateWorkspacePresentation} onClose={navigation.closeWorkspace} closeBlocked={closeBlocked} returnFocusRef={navigation.returnFocusRef} dismissOnBackdrop>
      <div className="empty-state"><strong>Müşteri kaydı artık kullanılamıyor.</strong><p>Çalışma alanını kapatıp müşteri listesini yenileyin.</p></div>
    </WorkspaceFrame>;
  }

  async function saveCustomer() {
    setSaveState("loading");
    setSaveMessage("Müşteri kartı kaydediliyor...");
    const result = await onSave(customerFormToInput(form));
    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.message);
      return;
    }
    setBaseline(form);
    setSaveState("success");
    setSaveMessage(result.message);
  }

  function leaveFor(action: () => void) {
    if (navigation.closeWorkspace()) action();
  }

  return <WorkspaceTabs value={mode}>
    <WorkspaceFrame
      title={customer.fullName}
      context={formatCustomerSource(customer.source) + (customer.phone ? " · " + customer.phone : "")}
      actions={staysEnabled ? <StatusBadge tone="info">{customer.stayCount} konaklama</StatusBadge> : undefined}
      navigation={<WorkspaceTabList label="Müşteri çalışma alanı" tabs={tabs} onChange={(nextMode) => navigation.updateWorkspaceMode({ entityType: "customer", mode: nextMode })} />}
      presentation={presentation}
      onPresentationChange={navigation.updateWorkspacePresentation}
      onClose={navigation.closeWorkspace}
      closeBlocked={closeBlocked}
      returnFocusRef={navigation.returnFocusRef}
      dismissOnBackdrop
    >
      <WorkspaceTabPanel value="summary">
        <div className="customer-workspace-summary">
          <dl className="data-list">
            <div><dt>Telefon</dt><dd>{customer.phone || "-"}</dd></div>
            <div><dt>E-posta</dt><dd>{customer.email || "-"}</dd></div>
            <div><dt>Son temas</dt><dd title={customer.lastContactAt || customer.updatedAt || undefined}>{formatCustomerLastContactDate(customer.lastContactAt || customer.updatedAt)}</dd></div>
            {reservationsEnabled && <div><dt>Rezervasyon</dt><dd>{customer.reservationCount} kayıt</dd></div>}
            <div><dt>Kimlik türü</dt><dd>{formatIdentityType(customer.identityType)}</dd></div>
            <div><dt>Kimlik no</dt><dd>{customer.identityNumber || "-"}</dd></div>
            <div><dt>Doğum tarihi</dt><dd>{formatDateForDisplay(customer.birthDate) || "-"}</dd></div>
            <div><dt>Uyruk</dt><dd>{customer.nationality || "-"}</dd></div>
          </dl>

          {hasCustomerIdentityDetails(customer) && <details className="disclosure customer-identity-details">
            <summary><CreditCard size={16} aria-hidden="true" />Kimlik kartı alanları</summary>
            <dl className="data-list">
              <div><dt>Cinsiyet</dt><dd>{formatCustomerGender(customer.gender)}</dd></div>
              <div><dt>Seri / belge no</dt><dd>{customer.documentSerialNumber || "-"}</dd></div>
              <div><dt>Son geçerlilik</dt><dd>{formatDateForDisplay(customer.documentExpiryDate) || "-"}</dd></div>
              <div><dt>Doğum yeri</dt><dd>{customer.birthPlace || "-"}</dd></div>
              <div><dt>Anne adı</dt><dd>{customer.motherName || "-"}</dd></div>
              <div><dt>Baba adı</dt><dd>{customer.fatherName || "-"}</dd></div>
              <div><dt>Veren makam</dt><dd>{customer.issuingAuthority || "-"}</dd></div>
              <div className="identity-address"><dt>Adres</dt><dd>{customer.address || "-"}</dd></div>
            </dl>
          </details>}

          <div className="record-note customer-detail-note"><span>Not</span><p className="record-note__body">{customer.notes || "Müşteri notu yok."}</p></div>
          {customer.tags.length > 0 && <div className="page-toolbar__start">{customer.tags.map((tag) => <StatusBadge tone="neutral" key={tag}>{tag}</StatusBadge>)}</div>}

          <div className="action-row customer-detail-actions">
            <ActionButton variant="secondary" size="sm" type="button" onClick={() => onCall(customer)} disabled={!customer.phone}><Phone size={16} aria-hidden="true" />Müşteriyi Ara</ActionButton>
            {whatsappEnabled && <ActionButton variant="whatsapp" size="sm" type="button" onClick={() => leaveFor(() => onWhatsApp(customer))} disabled={!customer.phone}><MessageCircle size={16} aria-hidden="true" />WhatsApp'tan Yaz</ActionButton>}
            {aiEnabled && <ActionButton variant="ghost" size="sm" type="button" onClick={() => leaveFor(() => onSummarize(selectedRequests[0]?.id ?? ""))} disabled={selectedRequests.length === 0}><Sparkles size={16} aria-hidden="true" />Geçmişi Özetle</ActionButton>}
          </div>

          {staysEnabled && <div className="action-row customer-stay-actions">
            <label className="form-field form-field--medium">Konaklama odası<select aria-label="Konaklama odası" value={entryRoomId} onChange={(event) => setEntryRoomId(event.target.value)}>{data.rooms.filter((room) => room.isActive).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
            <ActionButton size="sm" type="button" onClick={() => navigation.openWorkspace({ entityType: "room", entityId: entryRoomId, mode: "stay", action: "create-stay", customerId: customer.id, returnContext: { page: "customerWork", entityId: customer.id } })} disabled={!entryRoomId}><BedDouble size={16} aria-hidden="true" />Odaya Ata</ActionButton>
          </div>}

          <div className="action-row">
            <ActionButton variant="danger" size="sm" type="button" disabled={closeBlocked} onClick={async () => {
              setDeleteError("");
              try {
                const result = await onDelete(customer);
                if (result?.ok) navigation.closeWorkspace();
                else if (result && !result.ok) setDeleteError(result.message);
                else setDeleteError("Müşteri silinemedi. Yeniden deneyin.");
              } catch (error) {
                setDeleteError(customerCreditError(error, "Müşteri silinemedi. Yeniden deneyin."));
              }
            }}><Trash2 size={16} aria-hidden="true" />Müşteriyi Sil</ActionButton>
          </div>
          {deleteError && <p role="alert">{deleteError}</p>}
        </div>
      </WorkspaceTabPanel>

      <WorkspaceTabPanel value="details">
        <form className="form-stack customer-workspace-form" onSubmit={(event) => { event.preventDefault(); void saveCustomer(); }}>
          <CustomerFormFields form={form} aiEnabled={aiEnabled} onChange={setForm} onAnalyzeIdentity={onAnalyzeIdentity} />
          <div className="customer-workspace-savebar">
            <p className={"form-status sync-" + saveState} role="status">{saveMessage}</p>
            <div className="action-row">
              <ActionButton variant="secondary" type="button" disabled={saveState === "loading" || !dirty} onClick={() => { setForm(baseline); setSaveState("idle"); setSaveMessage("Kaydedilmemiş değişiklikler geri alındı."); }}>Değişiklikleri Geri Al</ActionButton>
              <ActionButton type="submit" disabled={saveState === "loading" || !dirty}><Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Müşteri Kartını Kaydet"}</ActionButton>
            </div>
          </div>
        </form>
      </WorkspaceTabPanel>

      <WorkspaceTabPanel value="history">
        <div className="customer-history-grid">
          <section><h3>Son Talepler</h3>{selectedRequests.length === 0 ? <p>Talep yok.</p> : selectedRequests.slice(0, 4).map((request) => <article key={request.id}><strong>{formatRequestType(request.request_type)}</strong><span>{formatRequestStatus(request.status)} · {request.date_text || request.start_date || "-"}</span>{request.message && <p>{request.message}</p>}</article>)}</section>
          {reservationsEnabled && <section><h3>Rezervasyonlar</h3>{selectedReservations.length === 0 ? <p>Rezervasyon yok.</p> : selectedReservations.slice(0, 4).map((reservation) => <article key={reservation.id}><strong>{reservation.title}</strong><span>{formatReservationStatus(reservation.status)} · {formatReservationDate(reservation)}</span></article>)}</section>}
          {staysEnabled && <section className="customer-stay-history"><h3>Oda / Konaklama Geçmişi</h3>{selectedStays.length === 0 ? <p>Oda kaydı yok.</p> : selectedStays.map((stay) => <article key={stay.id}><strong>{stay.roomNumber ? "Oda " + stay.roomNumber : stay.roomName}</strong><span>{formatCustomerRoomStayStatus(stay.status)} · {formatStayDateRange(stay)}</span>{stay.notes && <p>{stay.notes}</p>}<ActionButton variant="secondary" size="sm" onClick={() => navigation.openWorkspace({ entityType: "room", entityId: stay.roomId, mode: "stay", returnContext: { page: "customerWork", entityId: customer.id } })}>Odayı Aç</ActionButton></article>)}</section>}
        </div>
      </WorkspaceTabPanel>

      {customerCreditEnabled && <WorkspaceTabPanel value="account"><CustomerCreditPanel key={customer.id} customerId={customer.id} whatsappEnabled={whatsappEnabled} onPreparedWhatsApp={onPreparedCreditWhatsApp ? (message) => leaveFor(() => onPreparedCreditWhatsApp(message)) : undefined} /></WorkspaceTabPanel>}
    </WorkspaceFrame>
  </WorkspaceTabs>;
}

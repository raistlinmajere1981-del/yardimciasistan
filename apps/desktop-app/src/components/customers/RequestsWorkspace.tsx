import { usePageViewState, usePageViewScroll } from "../../app/page-view-state";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Copy,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2
} from "lucide-react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import {
  canConvertRequestToReservation,
  isRequestTypeAvailable,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import { formatCustomerSource } from "../../app/customer-model";
import type { ManualRequestFormState } from "../../app/request-model";
import {
  formatDateForDisplay,
  formatRequestStatus,
  formatRequestType,
  formatShortDate
} from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListButton } from "../ui/DataList";
import { DatePicker, TimePicker, addDays } from "../ui/DateTimePicker";
import { FormDialog } from "../ui/FormDialog";
import { SegmentedControl } from "../ui/SegmentedControl";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";

type SyncState = "idle" | "loading" | "success" | "error";
type RequestActionMode = "open" | "answered" | "rejected" | "converted" | "closed";
type RequestFilter = "all" | "waiting";

const manualRequestTypeOptions = [
  "general_info",
  "pension_reservation",
  "restaurant_reservation",
  "breakfast_request",
  "qr_menu_question",
  "location_question",
  "price_question",
  "other"
];

const manualPriorityOptions = [
  ["normal", "Normal"],
  ["high", "Yüksek"],
  ["urgent", "Acil"],
  ["low", "Düşük"]
];

function getRequestActionMode(status: string): RequestActionMode {
  if (status === "converted_to_reservation") return "converted";
  if (status === "answered") return "answered";
  if (status === "rejected") return "rejected";
  if (["cancelled", "archived"].includes(status)) return "closed";
  return "open";
}

export function getRequestStatusTone(status: string): StatusTone {
  if (["rejected", "cancelled"].includes(status)) return "danger";
  if (status === "converted_to_reservation" || status === "answered" || status === "approved") return "success";
  if (["new", "pending", "waiting_owner", "waiting_customer"].includes(status)) return "warning";
  return "info";
}

export function isRequestWaitingForReply(status: string) {
  return ["new", "seen", "waiting_owner", "pending", "in_progress"].includes(status);
}

function formatCompactRequestDate(request: SyncedCustomerRequest) {
  for (const value of [request.start_date, request.date_text, request.created_at]) {
    const formattedValue = formatShortDate(value);
    if (formattedValue) return formattedValue;
  }
  return "";
}

interface RequestsWorkspaceProps {
  requests: SyncedCustomerRequest[];
  selectedRequest: SyncedCustomerRequest | undefined;
  aiEnabled: boolean;
  whatsappEnabled: boolean;
  enabledCapabilities: BusinessCapability[];
  convertingRequestId: string;
  suggestingRequestId: string;
  aiState: SyncState;
  aiMessage: string;
  manualRequestForm: ManualRequestFormState;
  manualRequestState: SyncState;
  onSelectRequest: (requestId: string) => void;
  onManualRequestFormChange: (form: ManualRequestFormState) => void;
  onCreateManualRequest: () => Promise<boolean>;
  onWhatsApp: (request: SyncedCustomerRequest) => void;
  onConvert: (request: SyncedCustomerRequest) => void;
  onSuggest: (request: SyncedCustomerRequest) => void;
  onRewrite: (request: SyncedCustomerRequest, instructions: string) => void;
  onUpdateStatus: (request: SyncedCustomerRequest, status: string) => void;
  onOpenReservation: (request: SyncedCustomerRequest) => void;
  onDelete: (request: SyncedCustomerRequest) => void;
}

export function RequestsWorkspace({
  requests,
  selectedRequest: externallySelectedRequest,
  aiEnabled,
  whatsappEnabled,
  enabledCapabilities,
  convertingRequestId,
  suggestingRequestId,
  aiState,
  aiMessage,
  manualRequestForm,
  manualRequestState,
  onSelectRequest,
  onManualRequestFormChange,
  onCreateManualRequest,
  onWhatsApp,
  onConvert,
  onSuggest,
  onRewrite,
  onUpdateStatus,
  onOpenReservation,
  onDelete
}: RequestsWorkspaceProps) {
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [requestFilter, setRequestFilter] = usePageViewState<RequestFilter>("requests.filter", "all");
  const [aiCopyMessage, setAiCopyMessage] = useState("");
  const waitingRequests = requests.filter((request) => isRequestWaitingForReply(request.status));
  const visibleRequests = requestFilter === "waiting" ? waitingRequests : requests;
  const selectedRequest = visibleRequests.find((request) => request.id === externallySelectedRequest?.id)
    ?? visibleRequests[0];
  const selectedRequestId = selectedRequest?.id;

  useEffect(() => {
    if (selectedRequestId && selectedRequestId !== externallySelectedRequest?.id) {
      onSelectRequest(selectedRequestId);
    }
  }, [externallySelectedRequest?.id, onSelectRequest, selectedRequestId]);

  useEffect(() => {
    setAiCopyMessage("");
  }, [selectedRequest?.id, selectedRequest?.ai_suggested_reply]);

  const selectedActionMode = selectedRequest ? getRequestActionMode(selectedRequest.status) : "open";
  const selectedRequestSupportsReservation = selectedRequest
    ? canConvertRequestToReservation(enabledCapabilities, selectedRequest.request_type)
    : false;
  const availableManualRequestTypes = manualRequestTypeOptions.filter((requestType) =>
    isRequestTypeAvailable(enabledCapabilities, requestType)
  );
  const updateManualRequestForm = <Key extends keyof ManualRequestFormState,>(key: Key, value: ManualRequestFormState[Key]) => {
    onManualRequestFormChange({ ...manualRequestForm, [key]: value });
  };

  function openManualRequestForm() {
    if (!isRequestTypeAvailable(enabledCapabilities, manualRequestForm.requestType)) {
      onManualRequestFormChange({ ...manualRequestForm, requestType: "general_info" });
    }
    setManualFormOpen(true);
  }

  const pageScroll = usePageViewScroll(`requests.scroll`, visibleRequests.length);
  return (
    <section className="record-workspace requests-workspace" aria-label="Talep yönetimi">
      <aside className="panel record-workspace__list" data-surface-role="communication">
        <div className="card__header">
          <div>
            <p>Talepler</p>
            <h2>{visibleRequests.length} kayıt</h2>
          </div>
          <ActionButton
            size="sm"
            type="button"
            aria-expanded={manualFormOpen}
            onClick={openManualRequestForm}
          >
            <Plus size={15} aria-hidden="true" />
            Talimat Ekle
          </ActionButton>
        </div>
        <SegmentedControl
          className="request-filter-tabs"
          value={requestFilter}
          ariaLabel="Talep filtresi"
          onChange={setRequestFilter}
          options={[
            { id: "all", label: `Tümü · ${requests.length}` },
            { id: "waiting", label: `Yanıt bekleyen · ${waitingRequests.length}` }
          ]}
        />
        <DataList ref={pageScroll} className="record-workspace__items">
          {visibleRequests.length === 0 ? (
            <div className="empty-state">
              <Bell size={24} aria-hidden="true" />
              <strong>{requestFilter === "waiting" ? "Yanıt bekleyen talep yok." : "Talep yok."}</strong>
              <p>
                {requestFilter === "waiting"
                  ? "Yanıt gerektiren yeni veya açık talepler burada görünür."
                  : <>Web{aiEnabled ? ", AI" : ""} ve eklenen kayıtlar burada listelenir.</>}
              </p>
            </div>
          ) : (
            visibleRequests.map((request) => (
              <DataListButton
                className="customer-request-row"
                key={request.id}
                title={request.customer_name}
                leading={<span className={`status-dot tone-${getRequestStatusTone(request.status)}`} aria-hidden="true" />}
                description={`${formatRequestType(request.request_type)} · ${formatRequestStatus(request.status)}`}
                trailing={formatCompactRequestDate(request) ? <time dateTime={request.start_date || request.created_at}>{formatCompactRequestDate(request)}</time> : undefined}
                selected={selectedRequest?.id === request.id}
                aria-pressed={selectedRequest?.id === request.id}
                onClick={() => onSelectRequest(request.id)}
              />
            ))
          )}
        </DataList>

      </aside>

      <section className="panel record-workspace__detail request-detail-panel" data-surface-role="communication">
        {selectedRequest ? (
          <>
            <div className="card__header request-detail-header">
              <div className="page-toolbar__copy">
                <StatusBadge tone="info">{formatRequestType(selectedRequest.request_type)}</StatusBadge>
                <h2>{selectedRequest.customer_name}</h2>
              </div>
              <div className="request-detail-header-tools">
                <StatusBadge tone={getRequestStatusTone(selectedRequest.status)}>
                  {formatRequestStatus(selectedRequest.status)}
                </StatusBadge>
                <div className="action-row request-detail-header-actions">
                  {selectedActionMode === "open" && (
                    <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(selectedRequest, "answered")}>
                      <CheckCircle2 size={16} aria-hidden="true" />
                      Cevaplandı İşaretle
                    </ActionButton>
                  )}
                  {selectedActionMode === "open" && (
                    <ActionButton variant="danger" size="sm" type="button" onClick={() => onUpdateStatus(selectedRequest, "rejected")}>
                      <ClipboardList size={16} aria-hidden="true" />
                      Reddet
                    </ActionButton>
                  )}
                  {["answered", "rejected", "closed"].includes(selectedActionMode) && (
                    <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(selectedRequest, "new")}>
                      <RefreshCw size={16} aria-hidden="true" />
                      Yeniden Aç
                    </ActionButton>
                  )}
                  <ActionButton variant="danger" size="sm" type="button" onClick={() => onDelete(selectedRequest)}>
                    <Trash2 size={16} aria-hidden="true" />
                    Talebi Sil
                  </ActionButton>
                </div>
              </div>
            </div>
            <dl className="data-list request-meta-grid">
              <div>
                <dt>Telefon</dt>
                <dd>{selectedRequest.customer_phone}</dd>
              </div>
              <div>
                <dt>Tarih</dt>
                <dd>{selectedRequest.date_text || formatDateForDisplay(selectedRequest.start_date) || "-"}</dd>
              </div>
              <div>
                <dt>Kişi</dt>
                <dd>{selectedRequest.guest_count} kişi</dd>
              </div>
              <div>
                <dt>Kaynak</dt>
                <dd>{formatCustomerSource(selectedRequest.source)}</dd>
              </div>
            </dl>
            <div className="record-note">
              <span>Not</span>
              <p className="record-note__body">{selectedRequest.message || "Talep notu yok."}</p>
            </div>
            {aiEnabled && (
              <div className="record-note">
                <span>AI özeti</span>
                <p className="record-note__body">{selectedRequest.ai_summary || "Bu talep için henüz AI özeti hazırlanmadı."}</p>
              </div>
            )}
            {aiEnabled && selectedRequest.ai_suggested_reply && (
              <div className="request-ai-reply">
                <div className="request-ai-reply__heading">
                  <span>AI cevap taslağı</span>
                  <small>{aiCopyMessage || (aiState !== "idle" ? aiMessage : "Göndermeden önce kontrol edin.")}</small>
                </div>
                <textarea
                  className="request-ai-reply__content"
                  readOnly
                  value={selectedRequest.ai_suggested_reply}
                  aria-label="AI cevap taslağı"
                />
                <div className="action-row request-ai-reply__actions">
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(selectedRequest.ai_suggested_reply)
                        .then(() => setAiCopyMessage("Cevap taslağı kopyalandı."))
                        .catch(() => setAiCopyMessage("Cevap taslağı panoya kopyalanamadı."));
                    }}
                  >
                    <Copy size={16} aria-hidden="true" />
                    Kopyala
                  </ActionButton>
                </div>
                {selectedActionMode === "open" && (
                  <div className="request-ai-rewrite-actions">
                    <span>AI ile düzenle</span>
                    <div className="action-row">
                      <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite(selectedRequest, "Mesajı daha kısa ve doğrudan yaz.")} disabled={aiState === "loading"}>Daha Kısa</ActionButton>
                      <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite(selectedRequest, "Mesajı daha samimi ve sıcak yaz.")} disabled={aiState === "loading"}>Daha Samimi</ActionButton>
                      <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite(selectedRequest, "Mesajı daha resmi ve ölçülü yaz.")} disabled={aiState === "loading"}>Daha Resmi</ActionButton>
                      <ActionButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => onRewrite(selectedRequest, "Mesajı mevcut talep bilgilerine göre yeniden hazırla.")}
                        busy={aiState === "loading"}
                        busyLabel="Hazırlanıyor…"
                      >
                        <Sparkles size={16} aria-hidden="true" />
                        Yeniden hazırla
                      </ActionButton>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="action-row request-primary-actions">
              {whatsappEnabled && (
                <ActionButton variant="secondary" size="sm" type="button" onClick={() => onWhatsApp(selectedRequest)}>
                  <MessageCircle size={16} aria-hidden="true" />
                  WhatsApp'tan Yaz
                </ActionButton>
              )}
              {aiEnabled && selectedActionMode === "open" && (
                <ActionButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => onSuggest(selectedRequest)}
                  busy={suggestingRequestId === selectedRequest.id}
                  busyLabel="Hazırlanıyor…"
                >
                  <Sparkles size={16} aria-hidden="true" />
                  AI Cevap Hazırla
                </ActionButton>
              )}
              {selectedRequestSupportsReservation && (selectedActionMode === "open" || selectedActionMode === "answered") && (
                <ActionButton
                  size="sm"
                  type="button"
                  onClick={() => onConvert(selectedRequest)}
                  busy={convertingRequestId === selectedRequest.id}
                  busyLabel="Onaylanıyor…"
                >
                  <CalendarCheck size={16} aria-hidden="true" />
                  Rezervasyona Çevir
                </ActionButton>
              )}
              {selectedRequestSupportsReservation && selectedActionMode === "converted" && (
                <ActionButton size="sm" type="button" onClick={() => onOpenReservation(selectedRequest)}>
                  <CalendarCheck size={16} aria-hidden="true" />
                  Rezervasyonu Aç
                </ActionButton>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Bell size={28} aria-hidden="true" />
            <strong>Talep seçin.</strong>
            <p>Detay ve hızlı işlemler burada görünür.</p>
          </div>
        )}
      </section>

      {manualFormOpen && (
        <FormDialog
          title="Yeni talimat"
          onClose={() => {
            if (manualRequestState !== "loading") setManualFormOpen(false);
          }}
          closeBlocked={manualRequestState === "loading"}
          dismissOnBackdrop
          onSubmit={(event) => {
            event.preventDefault();
            if (manualRequestState === "loading") return;
            void (async () => {
              if (await onCreateManualRequest()) setManualFormOpen(false);
            })();
          }}
          footer={(
            <>
              <div className="action-row manual-request-dialog-actions">
                <ActionButton variant="secondary" type="button" disabled={manualRequestState === "loading"} onClick={() => setManualFormOpen(false)}>
                  Vazgeç
                </ActionButton>
                <ActionButton type="submit" busy={manualRequestState === "loading"} busyLabel="Kaydediliyor…">
                  <Save size={16} aria-hidden="true" />
                  Talimatı Kaydet
                </ActionButton>
              </div>
            </>
          )}
        >
          <div className="form-stack customer-create-form manual-request-create-form">
            <section className="panel form-stack">
              <div className="page-toolbar">
                <div className="page-toolbar__copy">
                  <strong>Temel bilgiler</strong>
                  <small>Müşteri ve talep özeti</small>
                </div>
              </div>
              <div className="form-grid">
                <label className="form-field form-field--medium">
                  Talep türü
                  <select value={manualRequestForm.requestType} onChange={(event) => updateManualRequestForm("requestType", event.target.value)}>
                    {availableManualRequestTypes.map((requestType) => (
                      <option key={requestType} value={requestType}>{formatRequestType(requestType)}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field form-field--medium">
                  Ad soyad
                  <input value={manualRequestForm.customerName} onChange={(event) => updateManualRequestForm("customerName", event.target.value)} placeholder="Müşteri adı" />
                </label>
                <label className="form-field form-field--short">
                  Telefon
                  <input inputMode="tel" value={manualRequestForm.customerPhone} onChange={(event) => updateManualRequestForm("customerPhone", event.target.value)} placeholder="+90 5xx… / +44…" />
                </label>
                <label className="form-field form-field--medium">
                  Tarih notu
                  <input value={manualRequestForm.dateText} onChange={(event) => updateManualRequestForm("dateText", event.target.value)} placeholder="12-14 Temmuz veya bugün" />
                </label>
                <label className="form-field form-field--xs">
                  Kişi sayısı
                  <input min="1" type="number" value={manualRequestForm.guestCount} onChange={(event) => updateManualRequestForm("guestCount", event.target.value)} />
                </label>
                <label className="form-field--span form-field form-field--fluid">
                  Not
                  <textarea value={manualRequestForm.message} onChange={(event) => updateManualRequestForm("message", event.target.value)} placeholder="Talep detayı" />
                </label>
              </div>
            </section>

            <section className="panel form-stack">
              <div className="page-toolbar">
                <div className="page-toolbar__copy">
                  <strong>Detaylı bilgi</strong>
                  <small>Tarih, saat ve öncelik</small>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-field form-field--short">
                  <span>Giriş tarihi</span>
                  <DatePicker
                    ariaLabel="Giriş tarihi"
                    value={manualRequestForm.startDate}
                    onChange={(value) => updateManualRequestForm("startDate", value)}
                  />
                </div>
                <div className="form-field form-field--short">
                  <span>Çıkış tarihi</span>
                  <DatePicker
                    ariaLabel="Çıkış tarihi"
                    value={manualRequestForm.endDate}
                    {...(manualRequestForm.startDate ? { min: manualRequestForm.startDate } : {})}
                    presets={manualRequestForm.startDate ? [1, 2, 7, 10].map((days) => ({
                      label: `${days} gün`,
                      value: addDays(manualRequestForm.startDate, days)
                    })) : []}
                    onChange={(value) => updateManualRequestForm("endDate", value)}
                  />
                </div>
                <div className="form-field form-field--short">
                  <span>Saat</span>
                  <TimePicker
                    ariaLabel="Saat"
                    value={manualRequestForm.time}
                    onChange={(value) => updateManualRequestForm("time", value)}
                  />
                </div>
                <label className="form-field form-field--medium">
                  Öncelik
                  <select value={manualRequestForm.priority} onChange={(event) => updateManualRequestForm("priority", event.target.value)}>
                    {manualPriorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
            </section>
          </div>
        </FormDialog>
      )}
    </section>
  );
}

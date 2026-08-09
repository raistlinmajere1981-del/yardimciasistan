import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import { formatCustomerSource } from "../../app/customer-model";
import {
  formatDateForDisplay,
  formatRequestStatus,
  formatRequestType,
  formatShortDate
} from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";
import { CompactList } from "../ui/CompactList";
import { CompactListButton } from "../ui/CompactListItem";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";

type SyncState = "idle" | "loading" | "success" | "error";
type RequestActionMode = "open" | "answered" | "rejected" | "converted" | "closed";

export interface ManualRequestFormState {
  requestType: string;
  customerName: string;
  customerPhone: string;
  dateText: string;
  startDate: string;
  endDate: string;
  time: string;
  guestCount: string;
  message: string;
  priority: string;
}

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
  if (status === "converted_to_reservation" || status === "answered" || status === "approved") return "ok";
  if (["new", "pending", "waiting_owner", "waiting_customer"].includes(status)) return "wait";
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
  convertingRequestId: string;
  suggestingRequestId: string;
  manualRequestForm: ManualRequestFormState;
  manualRequestState: SyncState;
  manualRequestMessage: string;
  showManualForm?: boolean;
  onSelectRequest: (requestId: string) => void;
  onManualRequestFormChange: (form: ManualRequestFormState) => void;
  onCreateManualRequest: () => void;
  onCall: (request: SyncedCustomerRequest) => void;
  onWhatsApp: (request: SyncedCustomerRequest) => void;
  onConvert: (request: SyncedCustomerRequest) => void;
  onSuggest: (request: SyncedCustomerRequest) => void;
  onUpdateStatus: (request: SyncedCustomerRequest, status: string) => void;
  onOpenReservation: (request: SyncedCustomerRequest) => void;
  onDelete: (request: SyncedCustomerRequest) => void;
}

export function RequestsWorkspace({
  requests,
  selectedRequest,
  aiEnabled,
  convertingRequestId,
  suggestingRequestId,
  manualRequestForm,
  manualRequestState,
  manualRequestMessage,
  showManualForm = true,
  onSelectRequest,
  onManualRequestFormChange,
  onCreateManualRequest,
  onCall,
  onWhatsApp,
  onConvert,
  onSuggest,
  onUpdateStatus,
  onOpenReservation,
  onDelete
}: RequestsWorkspaceProps) {
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const manualDrawerCloseRef = useRef<HTMLButtonElement>(null);
  const selectedActionMode = selectedRequest ? getRequestActionMode(selectedRequest.status) : "open";
  const updateManualRequestForm = <Key extends keyof ManualRequestFormState,>(key: Key, value: ManualRequestFormState[Key]) => {
    onManualRequestFormChange({ ...manualRequestForm, [key]: value });
  };

  useEffect(() => {
    if (!manualFormOpen) {
      return;
    }

    manualDrawerCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setManualFormOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [manualFormOpen]);

  return (
    <section className="operations-workspace requests-workspace" aria-label="Talep yönetimi">
      <aside className="panel operations-list-panel">
        <div className="panel-heading compact">
          <div>
            <p>Talepler</p>
            <h2>{requests.length} kayıt</h2>
          </div>
        </div>
        <CompactList className="manager-list operation-compact-list operations-list">
          {requests.length === 0 ? (
            <div className="empty-state compact-empty">
              <Bell size={24} aria-hidden="true" />
              <strong>Talep yok.</strong>
              <p>Web, AI ve manuel kayıtlar burada listelenir.</p>
            </div>
          ) : (
            requests.map((request) => (
              <CompactListButton
                className="manager-row operation-list-item customer-request-row"
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
        </CompactList>

        {showManualForm && (
          <ActionButton className="manual-request-toggle" variant="ghost" type="button" aria-expanded={manualFormOpen} onClick={() => setManualFormOpen(true)}>
            <Plus size={17} aria-hidden="true" />
            Elle Talep Ekle
          </ActionButton>
        )}
      </aside>

      <section className="panel operations-detail-panel request-detail-panel">
        {selectedRequest ? (
          <>
            <div className="panel-heading compact">
              <div className="detail-title-group">
                <span className="detail-category-label">{formatRequestType(selectedRequest.request_type)}</span>
                <h2>{selectedRequest.customer_name}</h2>
              </div>
              <StatusBadge tone={getRequestStatusTone(selectedRequest.status)}>
                {formatRequestStatus(selectedRequest.status)}
              </StatusBadge>
            </div>
            <dl className="info-list detail-info-grid compact-detail-meta">
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
            <div className="compact-detail-copy">
              <span>Not</span>
              <p className="detail-scroll-copy">{selectedRequest.message || "Talep notu yok."}</p>
            </div>
            {aiEnabled && (
              <div className="compact-detail-copy soft-suggestion">
                <span>AI özeti</span>
                <p className="detail-scroll-copy">{selectedRequest.ai_summary || "Bu talep için henüz AI özeti hazırlanmadı."}</p>
              </div>
            )}
            <div className="operations-command-grid request-detail-actions">
              <ActionButton variant="secondary" size="sm" type="button" onClick={() => onCall(selectedRequest)}>
                <Phone size={16} aria-hidden="true" />
                Müşteriyi Ara
              </ActionButton>
              <ActionButton variant="whatsapp" size="sm" type="button" onClick={() => onWhatsApp(selectedRequest)}>
                <MessageCircle size={16} aria-hidden="true" />
                WhatsApp'tan Yaz
              </ActionButton>
              {aiEnabled && selectedActionMode === "open" && (
                <ActionButton variant="ghost" size="sm" type="button" onClick={() => onSuggest(selectedRequest)} disabled={suggestingRequestId === selectedRequest.id}>
                  <Sparkles size={16} aria-hidden="true" />
                  {suggestingRequestId === selectedRequest.id ? "Hazırlanıyor" : "AI Cevap Hazırla"}
                </ActionButton>
              )}
              {(selectedActionMode === "open" || selectedActionMode === "answered") && (
                <ActionButton size="sm" type="button" onClick={() => onConvert(selectedRequest)} disabled={convertingRequestId === selectedRequest.id}>
                  <CalendarCheck size={16} aria-hidden="true" />
                  {convertingRequestId === selectedRequest.id ? "Onaylanıyor" : "Rezervasyona Çevir"}
                </ActionButton>
              )}
              {selectedActionMode === "open" && <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(selectedRequest, "answered")}>
                <CheckCircle2 size={16} aria-hidden="true" />
                Cevaplandı İşaretle
              </ActionButton>}
              {selectedActionMode === "open" && <ActionButton variant="danger" size="sm" type="button" onClick={() => onUpdateStatus(selectedRequest, "rejected")}>
                <ClipboardList size={16} aria-hidden="true" />
                Reddet
              </ActionButton>}
              {["answered", "rejected", "closed"].includes(selectedActionMode) && (
                <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(selectedRequest, "new")}>
                  <RefreshCw size={16} aria-hidden="true" />
                  Yeniden Aç
                </ActionButton>
              )}
              {selectedActionMode === "converted" && (
                <ActionButton size="sm" type="button" onClick={() => onOpenReservation(selectedRequest)}>
                  <CalendarCheck size={16} aria-hidden="true" />
                  Rezervasyonu Aç
                </ActionButton>
              )}
              <ActionButton variant="danger" size="sm" type="button" onClick={() => onDelete(selectedRequest)}>
                <Trash2 size={16} aria-hidden="true" />
                Talebi Sil
              </ActionButton>
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

      {showManualForm && manualFormOpen && (
        <div
          className="manual-request-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setManualFormOpen(false);
            }
          }}
        >
          <aside className="manual-request-drawer" role="dialog" aria-modal="true" aria-labelledby="manual-request-title">
            <header className="manual-request-drawer-header">
              <div className="manual-request-heading">
                <p>Manuel kayıt</p>
                <h2 id="manual-request-title">Yeni talep ekle</h2>
              </div>
              <button ref={manualDrawerCloseRef} className="drawer-close-button" type="button" aria-label="Elle talep formunu kapat" onClick={() => setManualFormOpen(false)}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <form
              className="manager-form manual-request-form"
              onSubmit={(event) => {
                event.preventDefault();
                onCreateManualRequest();
              }}
            >
              <div className="manual-request-core-grid">
                <label>
                  Talep türü
                  <select value={manualRequestForm.requestType} onChange={(event) => updateManualRequestForm("requestType", event.target.value)}>
                    {manualRequestTypeOptions.map((requestType) => (
                      <option key={requestType} value={requestType}>{formatRequestType(requestType)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Ad soyad
                  <input value={manualRequestForm.customerName} onChange={(event) => updateManualRequestForm("customerName", event.target.value)} placeholder="Müşteri adı" />
                </label>
                <label>
                  Telefon
                  <input value={manualRequestForm.customerPhone} onChange={(event) => updateManualRequestForm("customerPhone", event.target.value)} placeholder="05xx xxx xx xx" />
                </label>
                <label>
                  Tarih notu
                  <input value={manualRequestForm.dateText} onChange={(event) => updateManualRequestForm("dateText", event.target.value)} placeholder="12-14 Temmuz veya bugün" />
                </label>
                <label>
                  Kişi sayısı
                  <input min="1" type="number" value={manualRequestForm.guestCount} onChange={(event) => updateManualRequestForm("guestCount", event.target.value)} />
                </label>
                <label className="manual-request-note-field">
                  Not
                  <textarea value={manualRequestForm.message} onChange={(event) => updateManualRequestForm("message", event.target.value)} placeholder="Talep detayı" />
                </label>
              </div>
              <details className="form-details">
                <summary>Detaylı bilgi</summary>
                <div className="form-row">
                  <label>
                    Giriş tarihi
                    <input lang="tr" type="date" value={manualRequestForm.startDate} onChange={(event) => updateManualRequestForm("startDate", event.target.value)} />
                    <small className="date-field-hint">Gün / Ay / Yıl</small>
                  </label>
                  <label>
                    Çıkış tarihi
                    <input lang="tr" type="date" value={manualRequestForm.endDate} onChange={(event) => updateManualRequestForm("endDate", event.target.value)} />
                    <small className="date-field-hint">Gün / Ay / Yıl</small>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Saat
                    <input type="time" value={manualRequestForm.time} onChange={(event) => updateManualRequestForm("time", event.target.value)} />
                  </label>
                  <label>
                    Öncelik
                    <select value={manualRequestForm.priority} onChange={(event) => updateManualRequestForm("priority", event.target.value)}>
                      {manualPriorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>
              </details>
              <div className="manual-request-drawer-footer">
                <p className={`menu-status sync-${manualRequestState}`} role="status">{manualRequestMessage}</p>
                <div>
                  <ActionButton variant="secondary" type="button" onClick={() => setManualFormOpen(false)}>Vazgeç</ActionButton>
                  <ActionButton type="submit" disabled={manualRequestState === "loading"}>
                    <Save size={16} aria-hidden="true" />
                    {manualRequestState === "loading" ? "Kaydediliyor" : "Manuel Talep Kaydet"}
                  </ActionButton>
                </div>
              </div>
            </form>
          </aside>
        </div>
      )}
    </section>
  );
}

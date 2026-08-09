import { useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, CreditCard, MessageCircle, Pencil, Phone, Plus, Save, Sparkles, Trash2, Users, X } from "lucide-react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type {
  AssignCustomerRoomInput,
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopIdentityImageAnalyzeResult,
  SaveCustomerInput
} from "../../../electron/database";
import {
  customerFormToInput,
  defaultRoomAssignmentForm,
  formatCustomerGender,
  formatCustomerLastContactDate,
  formatCustomerRoomStayStatus,
  formatCustomerSource,
  formatIdentityType,
  formatStayDateRange,
  hasCustomerIdentityDetails,
  toCustomerForm,
  type CustomerFormState,
  type RoomAssignmentFormState
} from "../../app/customer-model";
import {
  formatDateForDisplay,
  formatRequestStatus,
  formatRequestType,
  formatReservationDate,
  formatReservationStatus,
  formatRoomStatus,
  formatShortDate
} from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";
import { CompactList } from "../ui/CompactList";
import { CompactListButton } from "../ui/CompactListItem";
import { StatusBadge } from "../ui/StatusBadge";

type SyncState = "idle" | "loading" | "success" | "error";

interface CustomersWorkspaceProps {
  customers: DesktopDashboardData["customers"];
  requests: SyncedCustomerRequest[];
  reservations: DesktopDashboardData["reservations"];
  rooms: DesktopDashboardData["rooms"];
  stays: DesktopDashboardData["customerRoomStays"];
  aiEnabled: boolean;
  onCall: (customer: DesktopDashboardData["customers"][number]) => void;
  onWhatsApp: (customer: DesktopDashboardData["customers"][number]) => void;
  onSummarize: (requestId: string) => void;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
  onAssignRoom: (input: AssignCustomerRoomInput) => Promise<DesktopCustomerMutationResult>;
  onUpdateStayStatus: (
    stayId: string,
    status: "planned" | "checked_in" | "checked_out" | "cancelled"
  ) => Promise<DesktopCustomerMutationResult>;
  onDelete: (customer: DesktopDashboardData["customers"][number]) => void;
}

export function CustomersWorkspace({
  customers,
  requests,
  reservations,
  rooms,
  stays,
  aiEnabled,
  onCall,
  onWhatsApp,
  onSummarize,
  onSave,
  onAnalyzeIdentity,
  onAssignRoom,
  onUpdateStayStatus,
  onDelete
}: CustomersWorkspaceProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id ?? "");
  const [customerEditorOpen, setCustomerEditorOpen] = useState(false);
  const [customerBeingEdited, setCustomerBeingEdited] = useState<DesktopDashboardData["customers"][number] | null>(null);
  const [assignmentCustomerId, setAssignmentCustomerId] = useState("");
  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        const customerStays = stays
          .filter((stay) => stay.customerId === customer.id)
          .map((stay) => `${stay.roomName} ${stay.roomNumber}`)
          .join(" ");
        const haystack = `${customer.fullName} ${customer.phone} ${customer.email} ${customer.identityNumber} ${customer.tags.join(" ")} ${customerStays}`.toLowerCase();
        return haystack.includes(searchText.trim().toLowerCase());
      }),
    [customers, searchText, stays]
  );
  const selectedCustomer = filteredCustomers.find((customer) => customer.id === selectedCustomerId) ?? filteredCustomers[0] ?? null;
  const selectedRequests = selectedCustomer
    ? requests.filter((request) => request.customer_id === selectedCustomer.id || request.customer_phone === selectedCustomer.phone)
    : [];
  const selectedReservations = selectedCustomer
    ? reservations.filter((reservation) => reservation.customerId === selectedCustomer.id || reservation.customerPhone === selectedCustomer.phone)
    : [];
  const selectedStays = selectedCustomer
    ? stays.filter((stay) => stay.customerId === selectedCustomer.id)
    : [];

  useEffect(() => {
    if (!selectedCustomerId && customers[0]) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  return (
    <section className="operations-workspace customers-workspace" aria-label="Müşteri yönetimi">
      <aside className="panel operations-list-panel">
        <div className="panel-heading compact">
          <div>
            <p>Müşteriler</p>
            <h2>{customers.length} kayıt</h2>
          </div>
          <ActionButton
            size="sm"
            type="button"
            onClick={() => {
              setCustomerBeingEdited(null);
              setCustomerEditorOpen(true);
            }}
          >
            <Plus size={15} aria-hidden="true" />
            Yeni Müşteri
          </ActionButton>
        </div>
        <label className="customer-search">
          <span>Ara</span>
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Ad, telefon, kimlik, etiket veya oda" />
        </label>
        <CompactList className="manager-list operation-compact-list operations-list">
          {filteredCustomers.length === 0 ? (
            <div className="empty-state compact-empty">
              <Users size={24} aria-hidden="true" />
              <strong>Müşteri bulunamadı.</strong>
              <p>Arama metnini değiştirin.</p>
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <CompactListButton
                className="manager-row operation-list-item customer-record-row"
                key={customer.id}
                title={customer.fullName}
                leading={<span className={`status-dot ${customer.requestCount > 0 ? "tone-info" : "tone-neutral"}`} aria-hidden="true" />}
                description={`${customer.phone || "Telefon yok"} · ${formatCustomerSource(customer.source)}`}
                trailing={formatShortDate(customer.lastContactAt || customer.updatedAt) ? <time dateTime={customer.lastContactAt || customer.updatedAt}>{formatShortDate(customer.lastContactAt || customer.updatedAt)}</time> : undefined}
                selected={selectedCustomer?.id === customer.id}
                aria-pressed={selectedCustomer?.id === customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
              />
            ))
          )}
        </CompactList>
      </aside>

      <section className="panel operations-detail-panel">
        {selectedCustomer ? (
          <>
            <div className="panel-heading compact">
              <div className="detail-title-group">
                <span className="detail-category-label">{formatCustomerSource(selectedCustomer.source)}</span>
                <h2>{selectedCustomer.fullName}</h2>
              </div>
              <div className="customer-heading-actions">
                <StatusBadge tone="info">{selectedCustomer.stayCount} konaklama</StatusBadge>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setCustomerBeingEdited(selectedCustomer);
                    setCustomerEditorOpen(true);
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Düzenle
                </ActionButton>
              </div>
            </div>
            <dl className="info-list detail-info-grid compact-detail-meta">
              <div>
                <dt>Telefon</dt>
                <dd>{selectedCustomer.phone || "-"}</dd>
              </div>
              <div>
                <dt>E-posta</dt>
                <dd>{selectedCustomer.email || "-"}</dd>
              </div>
              <div>
                <dt>Son temas</dt>
                <dd title={selectedCustomer.lastContactAt || selectedCustomer.updatedAt || undefined}>{formatCustomerLastContactDate(selectedCustomer.lastContactAt || selectedCustomer.updatedAt)}</dd>
              </div>
              <div>
                <dt>Rezervasyon</dt>
                <dd>{selectedCustomer.reservationCount} kayıt</dd>
              </div>
              <div>
                <dt>Kimlik türü</dt>
                <dd>{formatIdentityType(selectedCustomer.identityType)}</dd>
              </div>
              <div>
                <dt>Kimlik no</dt>
                <dd>{selectedCustomer.identityNumber || "-"}</dd>
              </div>
              <div>
                <dt>Doğum tarihi</dt>
                <dd>{formatDateForDisplay(selectedCustomer.birthDate) || "-"}</dd>
              </div>
              <div>
                <dt>Uyruk</dt>
                <dd>{selectedCustomer.nationality || "-"}</dd>
              </div>
            </dl>
            {hasCustomerIdentityDetails(selectedCustomer) && (
              <details className="customer-identity-details">
                <summary>
                  <CreditCard size={16} aria-hidden="true" />
                  Kimlik kartı alanları
                </summary>
                <dl className="info-list detail-info-grid compact-detail-meta">
                  <div><dt>Cinsiyet</dt><dd>{formatCustomerGender(selectedCustomer.gender)}</dd></div>
                  <div><dt>Seri / belge no</dt><dd>{selectedCustomer.documentSerialNumber || "-"}</dd></div>
                  <div><dt>Son geçerlilik</dt><dd>{formatDateForDisplay(selectedCustomer.documentExpiryDate) || "-"}</dd></div>
                  <div><dt>Doğum yeri</dt><dd>{selectedCustomer.birthPlace || "-"}</dd></div>
                  <div><dt>Anne adı</dt><dd>{selectedCustomer.motherName || "-"}</dd></div>
                  <div><dt>Baba adı</dt><dd>{selectedCustomer.fatherName || "-"}</dd></div>
                  <div><dt>Veren makam</dt><dd>{selectedCustomer.issuingAuthority || "-"}</dd></div>
                  <div className="identity-address"><dt>Adres</dt><dd>{selectedCustomer.address || "-"}</dd></div>
                </dl>
              </details>
            )}
            <div className="compact-detail-copy customer-detail-note">
              <span>Not</span>
              <p className="detail-scroll-copy">{selectedCustomer.notes || "Müşteri notu yok."}</p>
            </div>
            {selectedCustomer.tags.length > 0 && (
              <div className="tag-row">
                {selectedCustomer.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            <div className="operations-command-grid customer-detail-actions">
              <ActionButton variant="secondary" size="sm" type="button" onClick={() => onCall(selectedCustomer)} disabled={!selectedCustomer.phone}>
                <Phone size={16} aria-hidden="true" />
                Müşteriyi Ara
              </ActionButton>
              <ActionButton variant="whatsapp" size="sm" type="button" onClick={() => onWhatsApp(selectedCustomer)} disabled={!selectedCustomer.phone}>
                <MessageCircle size={16} aria-hidden="true" />
                WhatsApp'tan Yaz
              </ActionButton>
              {aiEnabled && (
                <ActionButton variant="ghost" size="sm" type="button" onClick={() => onSummarize(selectedRequests[0]?.id ?? "")} disabled={selectedRequests.length === 0}>
                  <Sparkles size={16} aria-hidden="true" />
                  Geçmişi Özetle
                </ActionButton>
              )}
              <ActionButton
                size="sm"
                type="button"
                onClick={() => setAssignmentCustomerId(selectedCustomer.id)}
                disabled={rooms.length === 0}
              >
                <BedDouble size={16} aria-hidden="true" />
                Odaya Ata
              </ActionButton>
              <ActionButton variant="danger" size="sm" type="button" onClick={() => onDelete(selectedCustomer)}>
                <Trash2 size={16} aria-hidden="true" />
                Müşteriyi Sil
              </ActionButton>
            </div>
            <div className="customer-history-grid">
              <section>
                <h3>Son Talepler</h3>
                {selectedRequests.length === 0 ? (
                  <p>Talep yok.</p>
                ) : (
                  selectedRequests.slice(0, 4).map((request) => (
                    <article key={request.id}>
                      <strong>{formatRequestType(request.request_type)}</strong>
                      <span>{formatRequestStatus(request.status)} · {request.date_text || request.start_date || "-"}</span>
                      {request.message && <p>{request.message}</p>}
                    </article>
                  ))
                )}
              </section>
              <section>
                <h3>Rezervasyonlar</h3>
                {selectedReservations.length === 0 ? (
                  <p>Rezervasyon yok.</p>
                ) : (
                  selectedReservations.slice(0, 4).map((reservation) => (
                    <article key={reservation.id}>
                      <strong>{reservation.title}</strong>
                      <span>{formatReservationStatus(reservation.status)} · {formatReservationDate(reservation)}</span>
                    </article>
                  ))
                )}
              </section>
              <section className="customer-stay-history">
                <h3>Oda / Konaklama Geçmişi</h3>
                {selectedStays.length === 0 ? (
                  <p>Oda kaydı yok.</p>
                ) : (
                  selectedStays.map((stay) => (
                    <article key={stay.id}>
                      <strong>{stay.roomNumber ? `Oda ${stay.roomNumber}` : stay.roomName}</strong>
                      <span>{formatCustomerRoomStayStatus(stay.status)} · {formatStayDateRange(stay)}</span>
                      {stay.notes && <p>{stay.notes}</p>}
                      <CustomerRoomStayActions stay={stay} onUpdateStatus={onUpdateStayStatus} />
                    </article>
                  ))
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Users size={28} aria-hidden="true" />
            <strong>Müşteri seçin.</strong>
            <p>İletişim ve geçmiş kayıtlar burada görünür.</p>
          </div>
        )}
      </section>

      <CustomerEditorDrawer
        open={customerEditorOpen}
        customer={customerBeingEdited}
        aiEnabled={aiEnabled}
        onClose={() => setCustomerEditorOpen(false)}
        onSave={async (input) => {
          const result = await onSave(input);
          if (result.ok) {
            setSelectedCustomerId(result.savedId);
            setCustomerEditorOpen(false);
          }
          return result;
        }}
        onAnalyzeIdentity={onAnalyzeIdentity}
      />
      <RoomAssignmentDrawer
        open={Boolean(assignmentCustomerId)}
        customers={customers}
        rooms={rooms}
        initialCustomerId={assignmentCustomerId}
        initialRoomId=""
        onClose={() => setAssignmentCustomerId("")}
        onAssign={async (input) => {
          const result = await onAssignRoom(input);
          if (result.ok) {
            setAssignmentCustomerId("");
          }
          return result;
        }}
      />
    </section>
  );
}

interface CustomerEditorDrawerProps {
  open: boolean;
  customer: DesktopDashboardData["customers"][number] | null;
  aiEnabled: boolean;
  onClose: () => void;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
}

export function CustomerEditorDrawer({
  open,
  customer,
  aiEnabled,
  onClose,
  onSave,
  onAnalyzeIdentity
}: CustomerEditorDrawerProps) {
  const [form, setForm] = useState<CustomerFormState>(() => toCustomerForm(customer));
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("Ad soyad yeterlidir; diğer alanlar daha sonra tamamlanabilir.");
  const identityFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(toCustomerForm(customer));
      setState("idle");
      setMessage("Ad soyad yeterlidir; diğer alanlar daha sonra tamamlanabilir.");
    }
  }, [customer, open]);

  if (!open) {
    return null;
  }

  const update = <K extends keyof CustomerFormState>(field: K, value: CustomerFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const analyzeIdentity = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setState("error");
      setMessage("JPG, PNG veya WebP biçiminde bir kimlik görseli seçin.");
      if (identityFileRef.current) identityFileRef.current.value = "";
      return;
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setState("error");
      setMessage("Kimlik görseli boş olamaz ve en fazla 10 MB olabilir.");
      if (identityFileRef.current) identityFileRef.current.value = "";
      return;
    }
    setState("loading");
    setMessage("Kimlik görseli AI ile okunuyor...");
    let result: DesktopIdentityImageAnalyzeResult;
    try {
      result = await onAnalyzeIdentity(file);
    } catch {
      result = { ok: false, message: "Kimlik görseli okunamadı." };
    }
    if (identityFileRef.current) {
      identityFileRef.current.value = "";
    }
    if (!result.ok) {
      setState("error");
      setMessage(result.message);
      return;
    }
    const fields = result.analysis.fields;
    setForm((current) => ({
      ...current,
      fullName: fields.full_name || current.fullName,
      identityType: fields.identity_type || current.identityType,
      identityNumber: fields.identity_number || current.identityNumber,
      nationality: fields.nationality || current.nationality,
      birthDate: fields.birth_date || current.birthDate,
      gender: fields.gender || current.gender,
      documentSerialNumber: fields.document_serial_number || current.documentSerialNumber,
      documentExpiryDate: fields.document_expiry_date || current.documentExpiryDate,
      birthPlace: fields.birth_place || current.birthPlace,
      motherName: fields.mother_name || current.motherName,
      fatherName: fields.father_name || current.fatherName,
      issuingAuthority: fields.issuing_authority || current.issuingAuthority,
      address: fields.address || current.address
    }));
    setState("success");
    setMessage(
      result.analysis.warnings.length > 0
        ? `${result.message} Kontrol: ${result.analysis.warnings.join(" ")}`
        : result.message
    );
  };

  return (
    <div className="manual-request-backdrop customer-editor-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="manual-request-drawer customer-editor-drawer" role="dialog" aria-modal="true" aria-labelledby="customer-editor-title">
        <header className="manual-request-drawer-header">
          <div className="manual-request-heading">
            <p>Müşteri kartı</p>
            <h2 id="customer-editor-title">{customer ? "Müşteri bilgilerini düzenle" : "Yeni müşteri ekle"}</h2>
          </div>
          <button className="drawer-close-button" type="button" aria-label="Müşteri formunu kapat" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <form className="manager-form manual-request-form customer-editor-form" onSubmit={async (event) => {
          event.preventDefault();
          setState("loading");
          setMessage("Müşteri kartı kaydediliyor...");
          const result = await onSave(customerFormToInput(form));
          setState(result.ok ? "success" : "error");
          setMessage(result.message);
        }}>
          <section className="customer-form-section">
            <div className="customer-form-section-heading">
              <div><strong>Temel bilgiler</strong><small>İletişim ve kart görünümü</small></div>
            </div>
            <div className="manual-request-core-grid">
              <label>Ad soyad<input required maxLength={160} value={form.fullName} onChange={(event) => update("fullName", event.target.value)} /></label>
              <label>Telefon<input inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="05xx xxx xx xx" /></label>
              <label>E-posta<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label>
              <label>Etiketler<input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="pansiyon, düzenli müşteri" /></label>
              <label className="manual-request-note-field">Not<textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
            </div>
          </section>
          <section className="customer-form-section identity-form-section">
            <div className="customer-form-section-heading">
              <div><strong>Kimlik kartı bilgileri</strong><small>Görsel yalnız analiz edilir; kimlik fotoğrafı saklanmaz.</small></div>
              <div className="identity-image-action">
                <input
                  ref={identityFileRef}
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void analyzeIdentity(event.target.files?.[0])}
                />
                <ActionButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  disabled={!aiEnabled || state === "loading"}
                  onClick={() => identityFileRef.current?.click()}
                >
                  <Sparkles size={15} aria-hidden="true" />
                  {state === "loading" ? "Okunuyor" : "Kimlikten AI ile Doldur"}
                </ActionButton>
              </div>
            </div>
            {!aiEnabled && <p className="identity-ai-note">Kimlik görseli analizi için Ayarlar bölümünden AI bağlantısını etkinleştirin.</p>}
            <div className="manual-request-core-grid identity-form-grid">
              <label>Belge türü<select value={form.identityType} onChange={(event) => update("identityType", event.target.value)}>
                <option value="">Seçilmedi</option>
                <option value="tc_identity_card">T.C. Kimlik Kartı</option>
                <option value="passport">Pasaport</option>
                <option value="other">Diğer</option>
              </select></label>
              <label>Kimlik / pasaport no<input value={form.identityNumber} onChange={(event) => update("identityNumber", event.target.value)} /></label>
              <label>Uyruk<input value={form.nationality} onChange={(event) => update("nationality", event.target.value)} /></label>
              <label>Doğum tarihi<input lang="tr" type="date" value={form.birthDate} onChange={(event) => update("birthDate", event.target.value)} /></label>
              <label>Cinsiyet<select value={form.gender} onChange={(event) => update("gender", event.target.value)}>
                <option value="">Seçilmedi</option>
                <option value="female">Kadın</option>
                <option value="male">Erkek</option>
                <option value="unspecified">Belirtilmemiş</option>
              </select></label>
              <label>Seri / belge no<input value={form.documentSerialNumber} onChange={(event) => update("documentSerialNumber", event.target.value)} /></label>
              <label>Son geçerlilik<input lang="tr" type="date" value={form.documentExpiryDate} onChange={(event) => update("documentExpiryDate", event.target.value)} /></label>
              <label>Doğum yeri<input value={form.birthPlace} onChange={(event) => update("birthPlace", event.target.value)} /></label>
              <label>Anne adı<input value={form.motherName} onChange={(event) => update("motherName", event.target.value)} /></label>
              <label>Baba adı<input value={form.fatherName} onChange={(event) => update("fatherName", event.target.value)} /></label>
              <label>Veren makam<input value={form.issuingAuthority} onChange={(event) => update("issuingAuthority", event.target.value)} /></label>
              <label className="manual-request-note-field">Adres<textarea value={form.address} onChange={(event) => update("address", event.target.value)} /></label>
            </div>
          </section>
          <div className="manual-request-drawer-footer">
            <p className={`menu-status sync-${state}`} role="status">{message}</p>
            <div>
              <ActionButton variant="secondary" type="button" onClick={onClose}>Vazgeç</ActionButton>
              <ActionButton type="submit" disabled={state === "loading"}>
                <Save size={16} aria-hidden="true" />
                {state === "loading" ? "Kaydediliyor" : "Müşteri Kartını Kaydet"}
              </ActionButton>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

interface RoomAssignmentDrawerProps {
  open: boolean;
  customers: DesktopDashboardData["customers"];
  rooms: DesktopDashboardData["rooms"];
  initialCustomerId: string;
  initialRoomId: string;
  onClose: () => void;
  onAssign: (input: AssignCustomerRoomInput) => Promise<DesktopCustomerMutationResult>;
}

export function RoomAssignmentDrawer({
  open,
  customers,
  rooms,
  initialCustomerId,
  initialRoomId,
  onClose,
  onAssign
}: RoomAssignmentDrawerProps) {
  const [form, setForm] = useState<RoomAssignmentFormState>(() => defaultRoomAssignmentForm(initialCustomerId, initialRoomId));
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("Atama, müşteri ve oda geçmişinde birlikte arşivlenir.");

  useEffect(() => {
    if (open) {
      setForm(defaultRoomAssignmentForm(initialCustomerId || customers[0]?.id || "", initialRoomId || rooms[0]?.id || ""));
      setState("idle");
      setMessage("Atama, müşteri ve oda geçmişinde birlikte arşivlenir.");
    }
  }, [customers, initialCustomerId, initialRoomId, open, rooms]);

  if (!open) return null;

  return (
    <div className="manual-request-backdrop room-assignment-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="manual-request-drawer room-assignment-drawer" role="dialog" aria-modal="true" aria-labelledby="room-assignment-title">
        <header className="manual-request-drawer-header">
          <div className="manual-request-heading"><p>Müşteri · Oda</p><h2 id="room-assignment-title">Odaya müşteri ata</h2></div>
          <button className="drawer-close-button" type="button" aria-label="Oda atama formunu kapat" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        <form className="manager-form manual-request-form" onSubmit={async (event) => {
          event.preventDefault();
          setState("loading");
          setMessage("Oda ataması kaydediliyor...");
          const result = await onAssign({
            customerId: form.customerId,
            roomId: form.roomId,
            checkInDate: form.checkInDate,
            checkOutDate: form.checkOutDate,
            guestCount: Number(form.guestCount),
            notes: form.notes,
            status: form.status
          });
          setState(result.ok ? "success" : "error");
          setMessage(result.message);
        }}>
          <div className="manual-request-core-grid">
            <label>Müşteri<select required value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
              <option value="">Müşteri seçin</option>
              {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.fullName}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}
            </select></label>
            <label>Oda<select required value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}>
              <option value="">Oda seçin</option>
              {rooms.filter((room) => room.isActive).map((room) => (
                <option value={room.id} key={room.id}>
                  {room.number ? `Oda ${room.number} · ` : ""}{room.name} · {room.capacity} kişi · {formatRoomStatus(room.status)}
                </option>
              ))}
            </select></label>
            <label>Giriş tarihi<input required lang="tr" type="date" value={form.checkInDate} onChange={(event) => setForm({ ...form, checkInDate: event.target.value })} /></label>
            <label>Çıkış tarihi<input lang="tr" type="date" value={form.checkOutDate} onChange={(event) => setForm({ ...form, checkOutDate: event.target.value })} /></label>
            <label>Kişi sayısı<input min="1" max="50" type="number" value={form.guestCount} onChange={(event) => setForm({ ...form, guestCount: event.target.value })} /></label>
            <label>Başlangıç durumu<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RoomAssignmentFormState["status"] })}>
              <option value="planned">Planlandı / Rezerve</option>
              <option value="checked_in">Giriş yaptı / Dolu</option>
            </select></label>
            <label className="manual-request-note-field">Konaklama notu<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          </div>
          <div className="manual-request-drawer-footer">
            <p className={`menu-status sync-${state}`} role="status">{message}</p>
            <div>
              <ActionButton variant="secondary" type="button" onClick={onClose}>Vazgeç</ActionButton>
              <ActionButton type="submit" disabled={state === "loading" || customers.length === 0 || rooms.length === 0}>
                <BedDouble size={16} aria-hidden="true" />
                {state === "loading" ? "Kaydediliyor" : "Odaya Ata"}
              </ActionButton>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function CustomerRoomStayActions({
  stay,
  onUpdateStatus
}: {
  stay: DesktopDashboardData["customerRoomStays"][number];
  onUpdateStatus: (
    stayId: string,
    status: "planned" | "checked_in" | "checked_out" | "cancelled"
  ) => Promise<DesktopCustomerMutationResult>;
}) {
  if (stay.status === "checked_out") return null;
  return (
    <div className="stay-inline-actions">
      {stay.status === "planned" && <ActionButton size="sm" type="button" onClick={() => void onUpdateStatus(stay.id, "checked_in")}>Giriş Yap</ActionButton>}
      {stay.status === "checked_in" && <ActionButton size="sm" type="button" onClick={() => void onUpdateStatus(stay.id, "checked_out")}>Çıkış Yap</ActionButton>}
      {stay.status === "cancelled" && <ActionButton variant="secondary" size="sm" type="button" onClick={() => void onUpdateStatus(stay.id, "planned")}>Yeniden Planla</ActionButton>}
      {["planned", "checked_in"].includes(stay.status) && <ActionButton variant="danger" size="sm" type="button" onClick={() => void onUpdateStatus(stay.id, "cancelled")}>İptal</ActionButton>}
    </div>
  );
}

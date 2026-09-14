import { useEffect, useMemo, useState } from "react";
import { Banknote, BedDouble, CreditCard, Landmark, Minus, Plus, Trash2, WalletCards, X } from "lucide-react";
import type {
  DesktopFinanceData,
  DesktopFinanceEntry,
  FinanceDirection,
  FinancePaymentMethod
} from "../../../electron/finance";
import type { DesktopRoomFolioData } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { MetricCard } from "../ui/MetricCard";
import { Panel } from "../ui/Panel";
import { StatusBadge } from "../ui/StatusBadge";
import { useDialogFocus } from "../ui/useDialogFocus";

const RECENT_ENTRY_PREVIEW_COUNT = 12;

const EMPTY_DATA: DesktopFinanceData = {
  generatedAt: "",
  currency: "TRY",
  todayIncomeMinor: 0,
  todayExpenseMinor: 0,
  todayNetMinor: 0,
  outstandingPensionMinor: 0,
  recentEntries: [],
  pensionBalances: []
};

const EMPTY_ROOM_DATA: DesktopRoomFolioData = {
  generatedAt: "",
  rooms: [],
  activeStays: [],
  folios: [],
  menuCategories: [],
  menuItems: []
};

type CategoryOption = readonly [value: string, label: string];

type OutstandingRow = {
  id: string;
  customerName: string;
  context: string;
  status: string;
  dateText: string;
  remainingMinor: number;
};

const EXPENSE_CATEGORIES: readonly CategoryOption[] = [
  ["stock", "Market / Stok"],
  ["utilities", "Elektrik - Su"],
  ["staff", "Personel"],
  ["maintenance", "Bakım"],
  ["transport", "Yakıt - Ulaşım"],
  ["official", "Vergi / Resmi"],
  ["other_expense", "Diğer"]
];

const INCOME_CATEGORIES: readonly CategoryOption[] = [
  ["other_income", "Diğer gelir"]
];

interface FinanceWorkspaceProps {
  accommodationEnabled: boolean;
  accommodationFolioEnabled: boolean;
  foodServiceEnabled: boolean;
}

export function FinanceWorkspace({
  accommodationEnabled,
  accommodationFolioEnabled,
  foodServiceEnabled
}: FinanceWorkspaceProps) {
  const [data, setData] = useState<DesktopFinanceData>(EMPTY_DATA);
  const [roomData, setRoomData] = useState<DesktopRoomFolioData>(EMPTY_ROOM_DATA);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [entryMode, setEntryMode] = useState<FinanceDirection | null>(null);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryCategory, setEntryCategory] = useState("other_expense");
  const [entryPaymentMethod, setEntryPaymentMethod] = useState<FinancePaymentMethod>("cash");
  const [entryDescription, setEntryDescription] = useState("");
  const [entryDate, setEntryDate] = useState(todayDateInput());
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DesktopFinanceEntry | null>(null);
  const [showAllEntries, setShowAllEntries] = useState(false);

  const deleteDialogRef = useDialogFocus(Boolean(pendingDelete));

  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getFinanceData) {
      setLoading(false);
      setMessage("Kasa bilgileri masaüstü uygulamasında kullanılabilir.");
      return () => { active = false; };
    }

    const roomPromise = accommodationFolioEnabled && bridge.getRoomFolioData
      ? bridge.getRoomFolioData().catch(() => EMPTY_ROOM_DATA)
      : Promise.resolve(EMPTY_ROOM_DATA);

    void Promise.all([bridge.getFinanceData(100), roomPromise])
      .then(([nextFinance, nextRooms]) => {
        if (!active) return;
        setData(nextFinance);
        setRoomData(nextRooms);
      })
      .catch(() => { if (active) setMessage("Kasa bilgileri hazırlanamadı."); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [accommodationFolioEnabled]);

  const incomeCategories = useMemo(() => {
    const options: CategoryOption[] = [...INCOME_CATEGORIES];
    if (accommodationEnabled) options.push(["pension", "Pansiyon"]);
    if (foodServiceEnabled) options.push(["restaurant", "Restoran"]);
    return options;
  }, [accommodationEnabled, foodServiceEnabled]);
  const categoryOptions: readonly CategoryOption[] = entryMode === "income" ? incomeCategories : EXPENSE_CATEGORIES;
  useEffect(() => {
    if (categoryOptions.some(([value]) => value === entryCategory)) return;
    setEntryCategory(entryMode === "income" ? "other_income" : "other_expense");
  }, [categoryOptions, entryCategory, entryMode]);

  const visibleRecentEntries = showAllEntries
    ? data.recentEntries
    : data.recentEntries.slice(0, RECENT_ENTRY_PREVIEW_COUNT);
  const hasOlderEntries = data.recentEntries.length > RECENT_ENTRY_PREVIEW_COUNT;

  const outstandingRows = useMemo(() => {
    if (!accommodationFolioEnabled) return [];
    const rows: OutstandingRow[] = [];
    const folioReservationIds = new Set<string>();

    for (const folio of roomData.folios) {
      if (folio.reservationId) folioReservationIds.add(folio.reservationId);
      if (folio.remainingMinor <= 0 || !["open", "closed"].includes(folio.status)) continue;
      const isOpen = folio.status === "open";
      rows.push({
        id: `folio:${folio.id}`,
        customerName: folio.customerName || "Misafir",
        context: folio.roomName || "Oda hesabı",
        status: isOpen ? "Açık oda hesabı" : "Çıkış yaptı · alacak",
        dateText: isOpen && folio.plannedCheckOutDate ? `Planlanan çıkış ${formatDate(folio.plannedCheckOutDate)}` : "",
        remainingMinor: folio.remainingMinor
      });
    }

    for (const balance of data.pensionBalances) {
      if (balance.remainingMinor <= 0 || folioReservationIds.has(balance.reservationId)) continue;
      rows.push({
        id: `reservation:${balance.reservationId}`,
        customerName: balance.customerName || balance.title || "Konaklama",
        context: balance.title || "Eski pansiyon kaydı",
        status: "Eski rezervasyon kaydı",
        dateText: balance.endDate ? `Bitiş ${formatDate(balance.endDate)}` : "",
        remainingMinor: balance.remainingMinor
      });
    }

    rows.sort((a, b) => {
      const aOpen = a.status === "Açık oda hesabı" ? 0 : 1;
      const bOpen = b.status === "Açık oda hesabı" ? 0 : 1;
      return aOpen - bOpen || b.remainingMinor - a.remainingMinor;
    });

    const visibleTotal = rows.reduce((sum, item) => sum + item.remainingMinor, 0);
    const unlistedMinor = Math.max(0, data.outstandingPensionMinor - visibleTotal);
    if (unlistedMinor > 0) {
      rows.push({
        id: "older-outstanding",
        customerName: "Diğer eski alacaklar",
        context: "Arşivlenmiş oda hesapları",
        status: "Geçmiş kayıt",
        dateText: "",
        remainingMinor: unlistedMinor
      });
    }

    return rows;
  }, [accommodationFolioEnabled, data.outstandingPensionMinor, data.pensionBalances, roomData.folios]);

  function openEntry(mode: FinanceDirection) {
    setEntryMode(mode);
    setEntryAmount("");
    setEntryDescription("");
    setEntryCategory(mode === "income" ? "other_income" : "other_expense");
    setEntryPaymentMethod("cash");
    setEntryDate(todayDateInput());
    setMessage("");
  }

  async function refreshRoomData() {
    const bridge = window.yardimciDesktop;
    if (!bridge?.getRoomFolioData) return;
    try {
      setRoomData(await bridge.getRoomFolioData());
    } catch {
      // Kasa hareketi kaydedilmişse oda özeti yenilenemese de işlemi geri çevirmeyiz.
    }
  }

  async function saveEntry() {
    const bridge = window.yardimciDesktop;
    if (!entryMode || !bridge?.saveManualFinanceEntry) return;
    const amountMinor = parseMoneyToMinor(entryAmount);
    if (amountMinor <= 0) {
      setMessage("Geçerli bir tutar girin.");
      return;
    }
    const occurredAt = dateInputToTimestamp(entryDate);
    if (!occurredAt) {
      setMessage("Tarihi GG.AA.YYYY biçiminde girin.");
      return;
    }

    setSaving(true);
    try {
      const result = await bridge.saveManualFinanceEntry({
        direction: entryMode,
        amountMinor,
        paymentMethod: entryPaymentMethod,
        category: entryCategory,
        description: entryDescription,
        occurredAt
      });
      setMessage(result.message);
      if (result.ok) {
        setData(result.data);
        setEntryMode(null);
        setShowAllEntries(false);
        await refreshRoomData();
      }
    } catch {
      setMessage("Kasa hareketi kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteEntry() {
    const entry = pendingDelete;
    if (!entry || entry.sourceType !== "manual" || !window.yardimciDesktop?.deleteManualFinanceEntry) return;
    setSaving(true);
    try {
      const result = await window.yardimciDesktop.deleteManualFinanceEntry(entry.id);
      setMessage(result.message);
      if (result.ok) setData(result.data);
      setPendingDelete(null);
    } catch {
      setMessage("Kasa hareketi kaldırılamadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="finance-workspace" aria-labelledby="finance-title">
      <div className="finance-title-row page-toolbar">
        <div>
          <p className="panel-eyebrow">Günlük kasa</p>
          <h2 id="finance-title">Kasa</h2>
          <p>{accommodationFolioEnabled ? "Bugünün para hareketlerini ve bekleyen oda alacaklarını tek bakışta görün." : "Bugünün para hareketlerini tek bakışta görün."}</p>
        </div>
        <div className="finance-primary-actions action-row">
          <ActionButton variant="primary" onClick={() => openEntry("income")}>
            <Plus size={16} aria-hidden="true" /> Gelir Ekle
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => openEntry("expense")}>
            <Minus size={16} aria-hidden="true" /> Gider Ekle
          </ActionButton>
        </div>
      </div>

      <div className="finance-summary-grid">
        <MetricCard compact title="Bugün Gelen" value={minorMoney(data.todayIncomeMinor)} detail="Kasaya giren" tone="ok" icon={Banknote} />
        <MetricCard compact title="Bugün Çıkan" value={minorMoney(data.todayExpenseMinor)} detail="Kaydedilen gider" tone="wait" icon={WalletCards} />
        <MetricCard compact title="Bugünkü Fark" value={minorMoney(data.todayNetMinor)} detail="Gelen - çıkan" tone={data.todayNetMinor >= 0 ? "info" : "wait"} icon={CreditCard} />
        {accommodationFolioEnabled && <MetricCard compact title="Bekleyen Alacak" value={minorMoney(data.outstandingPensionMinor)} detail="Oda hesapları" tone={data.outstandingPensionMinor > 0 ? "wait" : "ok"} icon={Landmark} />}
      </div>

      {outstandingRows.length > 0 && (
        <Panel className="finance-outstanding-panel" padding="compact">
          <div className="finance-section-heading page-toolbar">
            <div>
              <h3>Bekleyen Alacaklar</h3>
              <p>Kimin ne kadar borcu kaldığını burada görün; tahsilatı oda adisyonundan yapın.</p>
            </div>
            <strong>{minorMoney(data.outstandingPensionMinor)}</strong>
          </div>
          <div className="finance-outstanding-list">
            {outstandingRows.map((item) => (
              <article key={item.id} className="finance-outstanding-item">
                <div className="finance-outstanding-item__main">
                  <strong>{item.customerName}</strong>
                  <span>{item.context}{item.dateText ? ` · ${item.dateText}` : ""}</span>
                </div>
                <StatusBadge tone="warning" className="finance-outstanding-status">{item.status}</StatusBadge>
                <b className="finance-outstanding-item__amount">{minorMoney(item.remainingMinor)}</b>
              </article>
            ))}
          </div>
          <div className="finance-room-note">
            <BedDouble size={16} aria-hidden="true" />
            <span>Oda tahsilatları <strong>Pansiyon → Oda Adisyonu</strong> içinden alınır; para kasaya otomatik işlenir.</span>
          </div>
        </Panel>
      )}

      {entryMode && (
        <Panel className="finance-entry-panel" padding="compact">
          <div className="finance-form-heading page-toolbar">
            <div>
              <strong>{entryMode === "income" ? "Gelir Ekle" : "Gider Ekle"}</strong>
              <span>Nakit ve bugünün tarihi varsayılan gelir; gerekiyorsa değiştirebilirsiniz.</span>
            </div>
            <ActionButton variant="ghost" size="sm" onClick={() => setEntryMode(null)}>
              Vazgeç
            </ActionButton>
          </div>
          <div className="finance-entry-form">
            <label className="form-field form-field--short">
              <span>Tutar</span>
              <input inputMode="decimal" value={entryAmount} onChange={(event) => setEntryAmount(event.target.value)} placeholder="0,00" autoFocus />
            </label>
            <label className="form-field form-field--medium">
              <span>Tür</span>
              <select value={entryCategory} onChange={(event) => setEntryCategory(event.target.value)}>
                {categoryOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label className="form-field form-field--fluid finance-description-field">
              <span>Açıklama</span>
              <input value={entryDescription} onChange={(event) => setEntryDescription(event.target.value)} placeholder="Örn. mutfak alışverişi" maxLength={160} />
            </label>
            <div className="finance-entry-form__submit">
              <ActionButton variant="primary" onClick={() => void saveEntry()} disabled={saving}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </ActionButton>
            </div>
            <details className="finance-entry-more">
              <summary>
                <span>Ödeme şekli ve tarih</span>
                <small>{paymentMethodLabel(entryPaymentMethod)} · {entryDate}</small>
              </summary>
              <div className="finance-entry-more-grid">
                <label className="form-field form-field--medium">
                  <span>Ödeme şekli</span>
                  <PaymentMethodSelect value={entryPaymentMethod} onChange={setEntryPaymentMethod} />
                </label>
                <label className="form-field form-field--short">
                  <span>İşlem tarihi</span>
                  <input
                    inputMode="numeric"
                    value={entryDate}
                    onChange={(event) => setEntryDate(autoFormatDateInput(event.target.value))}
                    placeholder="GG.AA.YYYY"
                    maxLength={10}
                  />
                </label>
              </div>
            </details>
          </div>
        </Panel>
      )}

      <Panel className="finance-recent-panel">
        <div className="finance-section-heading page-toolbar">
          <div>
            <h3>Son Hareketler</h3>
            <p>
              Otomatik ve elle eklenen kasa kayıtları
              {hasOlderEntries && !showAllEntries ? ` · son ${RECENT_ENTRY_PREVIEW_COUNT} kayıt` : ""}
            </p>
          </div>
          {loading && <span className="loading-state" role="status">Yükleniyor…</span>}
        </div>
        {data.recentEntries.length === 0 ? (
          <p className="empty-state">Henüz kasa hareketi yok.</p>
        ) : (
          <>
            <div className="finance-entry-list">
              {visibleRecentEntries.map((entry) => (
                <article key={entry.id} className="finance-entry-item">
                  <span className={`finance-direction-icon is-${entry.direction}`} aria-hidden="true">
                    {entry.direction === "income" ? "+" : "−"}
                  </span>
                  <div className="finance-entry-item__main">
                    <strong>{entry.description || categoryLabel(entry.category)}</strong>
                    <span>{entrySourceLabel(entry)} · {paymentMethodLabel(entry.paymentMethod)} · {formatDateTime(entry.occurredAt)}</span>
                  </div>
                  <b className={`finance-entry-item__amount ${entry.direction === "income" ? "is-income" : "is-expense"}`}>
                    {entry.direction === "income" ? "+" : "−"}{minorMoney(entry.amountMinor)}
                  </b>
                  {entry.sourceType === "manual" ? (
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      className="finance-delete-entry"
                      aria-label="Kasa hareketini kaldır"
                      onClick={() => setPendingDelete(entry)}
                      disabled={saving}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </ActionButton>
                  ) : (
                    <span className="finance-delete-placeholder" aria-hidden="true" />
                  )}
                </article>
              ))}
            </div>
            {hasOlderEntries && (
              <ActionButton
                variant="secondary"
                size="sm"
                className="finance-history-toggle"
                onClick={() => setShowAllEntries((current) => !current)}
              >
                {showAllEntries ? `Son ${RECENT_ENTRY_PREVIEW_COUNT} Kaydı Göster` : `Tüm Hareketleri Göster (${data.recentEntries.length})`}
              </ActionButton>
            )}
          </>
        )}
      </Panel>

      {message && <p className="finance-feedback status-message" role="status">{message}</p>}

      {pendingDelete && (
        <div
          className="finance-confirm-overlay overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setPendingDelete(null);
          }}
        >
          <section
            ref={deleteDialogRef}
            className="finance-confirm-dialog dialog dialog--compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-delete-title"
          >
            <button
              className="finance-confirm-close overlay-close"
              type="button"
              aria-label="Kapat"
              disabled={saving}
              onClick={() => setPendingDelete(null)}
            >
              <X size={18} />
            </button>
            <p className="panel-eyebrow">Kasa kaydı</p>
            <h3 id="finance-delete-title">Bu hareket kaldırılsın mı?</h3>
            <p className="finance-confirm-item">
              <strong>{pendingDelete.description || categoryLabel(pendingDelete.category)}</strong> · {minorMoney(pendingDelete.amountMinor)}
            </p>
            <span className="finance-confirm-hint">Yalnız elle eklenen kasa kayıtları bu şekilde kaldırılabilir.</span>
            <div className="finance-confirm-actions action-row">
              <ActionButton variant="secondary" disabled={saving} onClick={() => setPendingDelete(null)}>
                Vazgeç
              </ActionButton>
              <ActionButton variant="danger" disabled={saving} onClick={() => void confirmDeleteEntry()}>
                {saving ? "Kaldırılıyor…" : "Kaydı Kaldır"}
              </ActionButton>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function PaymentMethodSelect({ value, onChange }: { value: FinancePaymentMethod; onChange: (value: FinancePaymentMethod) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as FinancePaymentMethod)}>
      <option value="cash">Nakit</option>
      <option value="card">Kart</option>
      <option value="bank">Banka / Havale</option>
      <option value="other">Diğer</option>
    </select>
  );
}

function parseMoneyToMinor(value: string): number {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return 0;
  let normalized = compact;
  if (compact.includes(",")) normalized = compact.replace(/\./g, "").replace(",", ".");
  else if ((compact.match(/\./g) ?? []).length > 1) normalized = compact.replace(/\./g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : -1;
}

function minorMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function formatDate(value: string): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function entrySourceLabel(entry: DesktopFinanceEntry): string {
  if (entry.sourceType === "restaurant_order") return "Restoran";
  if (entry.sourceType === "room_folio_payment") return "Oda tahsilatı";
  if (entry.sourceType === "pension_payment") return "Eski pansiyon kaydı";
  return categoryLabel(entry.category);
}

function paymentMethodLabel(method: FinancePaymentMethod): string {
  if (method === "cash") return "Nakit";
  if (method === "card") return "Kart";
  if (method === "bank") return "Banka / Havale";
  if (method === "other") return "Diğer";
  return "Belirtilmedi";
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    restaurant: "Restoran",
    pension: "Pansiyon",
    other_income: "Diğer gelir",
    stock: "Market / Stok",
    utilities: "Elektrik - Su",
    staff: "Personel",
    maintenance: "Bakım",
    transport: "Yakıt - Ulaşım",
    official: "Vergi / Resmi",
    other_expense: "Diğer gider"
  };
  return labels[category] ?? "Kasa hareketi";
}

function todayDateInput(): string {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
}

function autoFormatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function dateInputToTimestamp(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return date.toISOString();
}

import { useEffect, useState } from "react";
import { Banknote, BedDouble, CreditCard, Landmark, Minus, Plus, Trash2, WalletCards } from "lucide-react";
import type {
  DesktopFinanceData,
  DesktopFinanceEntry,
  FinanceDirection,
  FinancePaymentMethod
} from "../../../electron/finance";
import { MetricCard } from "../ui/MetricCard";
import { Panel } from "../ui/Panel";

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

type CategoryOption = readonly [value: string, label: string];

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
  ["other_income", "Diğer gelir"],
  ["pension", "Pansiyon"],
  ["restaurant", "Restoran"]
];

export function FinanceWorkspace() {
  const [data, setData] = useState<DesktopFinanceData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [entryMode, setEntryMode] = useState<FinanceDirection | null>(null);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryCategory, setEntryCategory] = useState("other_expense");
  const [entryPaymentMethod, setEntryPaymentMethod] = useState<FinancePaymentMethod>("cash");
  const [entryDescription, setEntryDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getFinanceData) {
      setLoading(false);
      setMessage("Kasa bilgileri masaüstü uygulamasında kullanılabilir.");
      return () => { active = false; };
    }
    void bridge.getFinanceData(50)
      .then((next) => { if (active) setData(next); })
      .catch(() => { if (active) setMessage("Kasa bilgileri hazırlanamadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const categoryOptions: readonly CategoryOption[] = entryMode === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function openEntry(mode: FinanceDirection) {
    setEntryMode(mode);
    setEntryAmount("");
    setEntryDescription("");
    setEntryCategory(mode === "income" ? "other_income" : "other_expense");
    setEntryPaymentMethod("cash");
    setMessage("");
  }

  async function saveEntry() {
    const bridge = window.yardimciDesktop;
    if (!entryMode || !bridge?.saveManualFinanceEntry) return;
    const amountMinor = parseMoneyToMinor(entryAmount);
    if (amountMinor <= 0) {
      setMessage("Geçerli bir tutar girin.");
      return;
    }
    setSaving(true);
    try {
      const result = await bridge.saveManualFinanceEntry({
        direction: entryMode,
        amountMinor,
        paymentMethod: entryPaymentMethod,
        category: entryCategory,
        description: entryDescription
      });
      setMessage(result.message);
      if (result.ok) {
        setData(result.data);
        setEntryMode(null);
      }
    } catch {
      setMessage("Kasa hareketi kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(entry: DesktopFinanceEntry) {
    if (entry.sourceType !== "manual" || !window.yardimciDesktop?.deleteManualFinanceEntry) return;
    const accepted = window.confirm(`${entry.description || categoryLabel(entry.category)} kaydını kasadan kaldırmak istiyor musunuz?`);
    if (!accepted) return;
    setSaving(true);
    try {
      const result = await window.yardimciDesktop.deleteManualFinanceEntry(entry.id);
      setMessage(result.message);
      if (result.ok) setData(result.data);
    } catch {
      setMessage("Kasa hareketi kaldırılamadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="finance-workspace" aria-labelledby="finance-title">
      <div className="finance-title-row">
        <div>
          <p className="panel-eyebrow">Günlük kasa</p>
          <h2 id="finance-title">Kasa</h2>
          <p>Gelen, çıkan ve bekleyen alacakları tek yerde takip edin.</p>
        </div>
        <div className="finance-primary-actions">
          <button className="finance-income-button" type="button" onClick={() => openEntry("income")}>
            <Plus size={17} aria-hidden="true" /> Gelir Ekle
          </button>
          <button className="finance-expense-button" type="button" onClick={() => openEntry("expense")}>
            <Minus size={17} aria-hidden="true" /> Gider Ekle
          </button>
        </div>
      </div>

      <div className="finance-summary-grid">
        <MetricCard compact title="Bugün Gelen" value={minorMoney(data.todayIncomeMinor)} detail="Kasaya giren" tone="ok" icon={Banknote} />
        <MetricCard compact title="Bugün Çıkan" value={minorMoney(data.todayExpenseMinor)} detail="Kaydedilen gider" tone="wait" icon={WalletCards} />
        <MetricCard compact title="Bugünkü Fark" value={minorMoney(data.todayNetMinor)} detail="Gelen - çıkan" tone={data.todayNetMinor >= 0 ? "info" : "wait"} icon={CreditCard} />
        <MetricCard compact title="Bekleyen Alacak" value={minorMoney(data.outstandingPensionMinor)} detail="Oda hesapları" tone={data.outstandingPensionMinor > 0 ? "wait" : "ok"} icon={Landmark} />
      </div>

      <Panel className="finance-room-guidance" padding="compact">
        <BedDouble size={19} aria-hidden="true" />
        <div>
          <strong>Oda ödemeleri Pansiyon sayfasından alınır.</strong>
          <p>Konaklama, restoran ürünleri, ek ücretler ve tahsilatlar “Oda Adisyonu” içinde yönetilir; alınan para buraya otomatik gelir.</p>
        </div>
      </Panel>

      {entryMode && (
        <Panel className="finance-entry-panel" padding="compact">
          <div className="finance-form-heading">
            <div>
              <strong>{entryMode === "income" ? "Gelir Ekle" : "Gider Ekle"}</strong>
              <span>Yalnız gerekli bilgileri girin.</span>
            </div>
            <button type="button" onClick={() => setEntryMode(null)}>Vazgeç</button>
          </div>
          <div className="finance-entry-form">
            <label>
              Tutar
              <input inputMode="decimal" value={entryAmount} onChange={(event) => setEntryAmount(event.target.value)} placeholder="0,00" autoFocus />
            </label>
            <label>
              Tür
              <select value={entryCategory} onChange={(event) => setEntryCategory(event.target.value)}>
                {categoryOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Ödeme şekli
              <PaymentMethodSelect value={entryPaymentMethod} onChange={setEntryPaymentMethod} />
            </label>
            <label className="finance-description-field">
              Açıklama
              <input value={entryDescription} onChange={(event) => setEntryDescription(event.target.value)} placeholder="Kısa açıklama" maxLength={160} />
            </label>
            <button className="finance-save-button" type="button" onClick={() => void saveEntry()} disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </Panel>
      )}

      <Panel className="finance-recent-panel">
        <div className="finance-section-heading">
          <div><h3>Son Hareketler</h3><p>Restoran, oda tahsilatı ve manuel kayıtlar</p></div>
          {loading && <span>Yükleniyor…</span>}
        </div>
        {data.recentEntries.length === 0 ? (
          <p className="finance-empty">Henüz kasa hareketi yok.</p>
        ) : (
          <div className="finance-entry-list">
            {data.recentEntries.map((entry) => (
              <article key={entry.id}>
                <span className={`finance-direction-icon is-${entry.direction}`}>{entry.direction === "income" ? "+" : "−"}</span>
                <div>
                  <strong>{entry.description || categoryLabel(entry.category)}</strong>
                  <span>{entrySourceLabel(entry)} · {formatDateTime(entry.occurredAt)}</span>
                </div>
                <b className={entry.direction === "income" ? "is-income" : "is-expense"}>
                  {entry.direction === "income" ? "+" : "−"}{minorMoney(entry.amountMinor)}
                </b>
                {entry.sourceType === "manual" && (
                  <button className="finance-delete-entry" type="button" aria-label="Kasa hareketini kaldır" onClick={() => void deleteEntry(entry)} disabled={saving}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>

      {message && <p className="finance-feedback" role="status">{message}</p>}
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

function entrySourceLabel(entry: DesktopFinanceEntry): string {
  if (entry.sourceType === "restaurant_order") return "Restoran";
  if (entry.sourceType === "room_folio_payment") return "Oda tahsilatı";
  if (entry.sourceType === "pension_payment") return "Eski pansiyon kaydı";
  return categoryLabel(entry.category);
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

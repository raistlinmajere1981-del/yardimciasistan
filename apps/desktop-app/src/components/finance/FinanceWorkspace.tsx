import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Landmark, Minus, Plus, Trash2, WalletCards } from "lucide-react";
import type {
  DesktopFinanceData,
  DesktopFinanceEntry,
  DesktopPensionBalance,
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
  const [reservationTotalDrafts, setReservationTotalDrafts] = useState<Record<string, string>>({});
  const [paymentReservationId, setPaymentReservationId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>("cash");

  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getFinanceData) {
      setLoading(false);
      setMessage("Kasa bilgileri masaüstü uygulamasında kullanılabilir.");
      return () => {
        active = false;
      };
    }
    void bridge.getFinanceData(50)
      .then((next) => {
        if (active) setData(next);
      })
      .catch(() => {
        if (active) setMessage("Kasa bilgileri hazırlanamadı.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const outstandingBalances = useMemo(
    () => data.pensionBalances.filter((balance) => balance.agreedTotalMinor === 0 || balance.remainingMinor > 0),
    [data.pensionBalances]
  );
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

  async function saveReservationTotal(balance: DesktopPensionBalance) {
    const bridge = window.yardimciDesktop;
    if (!bridge?.setReservationAgreedTotal) return;
    const draft = reservationTotalDrafts[balance.reservationId] ?? minorToInput(balance.agreedTotalMinor);
    const amountMinor = parseMoneyToMinor(draft);
    if (amountMinor < 0) {
      setMessage("Konaklama bedeli geçersiz.");
      return;
    }
    if (amountMinor > 0 && amountMinor < balance.paidTotalMinor) {
      setMessage("Konaklama bedeli daha önce alınan toplam ödemeden düşük olamaz.");
      return;
    }
    setSaving(true);
    try {
      const result = await bridge.setReservationAgreedTotal({
        reservationId: balance.reservationId,
        amountMinor,
        currency: balance.currency || "TRY"
      });
      setMessage(result.message);
      if (result.ok) {
        setData(result.data);
        setReservationTotalDrafts((current) => ({ ...current, [balance.reservationId]: "" }));
      }
    } catch {
      setMessage("Konaklama bedeli kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  function openPayment(balance: DesktopPensionBalance) {
    setPaymentReservationId(balance.reservationId);
    setPaymentAmount(minorToInput(balance.remainingMinor));
    setPaymentMethod("cash");
    setMessage("");
  }

  async function savePayment(balance: DesktopPensionBalance) {
    const bridge = window.yardimciDesktop;
    if (!bridge?.addPensionPayment) return;
    const amountMinor = parseMoneyToMinor(paymentAmount);
    if (amountMinor <= 0) {
      setMessage("Geçerli bir ödeme tutarı girin.");
      return;
    }
    if (amountMinor > balance.remainingMinor) {
      setMessage("Ödeme tutarı kalan alacaktan büyük olamaz.");
      return;
    }
    setSaving(true);
    try {
      const result = await bridge.addPensionPayment({
        reservationId: balance.reservationId,
        amountMinor,
        paymentMethod
      });
      setMessage(result.message);
      if (result.ok) {
        setData(result.data);
        setPaymentReservationId("");
        setPaymentAmount("");
      }
    } catch {
      setMessage("Pansiyon ödemesi kaydedilemedi.");
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
          <p>Gelen, çıkan ve pansiyondan kalan ödemeleri tek yerde takip edin.</p>
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
        <MetricCard compact title="Bekleyen Alacak" value={minorMoney(data.outstandingPensionMinor)} detail="Pansiyon" tone={data.outstandingPensionMinor > 0 ? "wait" : "ok"} icon={Landmark} />
      </div>

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
                {categoryOptions.map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
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

      <div className="finance-two-column">
        <Panel className="finance-pension-panel">
          <div className="finance-section-heading">
            <div><h3>Pansiyon Ödemeleri</h3><p>Konaklama bedeli ve kalan alacak</p></div>
            <span>{outstandingBalances.length} kayıt</span>
          </div>
          {outstandingBalances.length === 0 ? (
            <p className="finance-empty">Bekleyen pansiyon alacağı yok.</p>
          ) : (
            <div className="finance-pension-list">
              {outstandingBalances.map((balance) => (
                <article className="finance-pension-card" key={balance.reservationId}>
                  <div className="finance-pension-card-heading">
                    <div>
                      <strong>{balance.customerName || balance.title}</strong>
                      <span>{formatDateRange(balance.startDate, balance.endDate)}</span>
                    </div>
                    {balance.agreedTotalMinor > 0 && <b>{minorMoney(balance.remainingMinor)} kalan</b>}
                  </div>

                  {balance.agreedTotalMinor <= 0 ? (
                    <div className="finance-total-editor">
                      <label>
                        Konaklama bedeli
                        <input
                          inputMode="decimal"
                          value={reservationTotalDrafts[balance.reservationId] ?? ""}
                          onChange={(event) => setReservationTotalDrafts((current) => ({ ...current, [balance.reservationId]: event.target.value }))}
                          placeholder="0,00"
                        />
                      </label>
                      <button type="button" onClick={() => void saveReservationTotal(balance)} disabled={saving}>Tutarı Kaydet</button>
                    </div>
                  ) : (
                    <>
                      <div className="finance-payment-summary">
                        <span>Toplam <strong>{minorMoney(balance.agreedTotalMinor)}</strong></span>
                        <span>Ödenen <strong>{minorMoney(balance.paidTotalMinor)}</strong></span>
                        <span>Kalan <strong>{minorMoney(balance.remainingMinor)}</strong></span>
                      </div>
                      <div className="finance-pension-actions">
                        <details>
                          <summary>Tutarı değiştir</summary>
                          <div className="finance-total-editor is-compact">
                            <input
                              aria-label="Yeni konaklama bedeli"
                              inputMode="decimal"
                              value={reservationTotalDrafts[balance.reservationId] ?? minorToInput(balance.agreedTotalMinor)}
                              onChange={(event) => setReservationTotalDrafts((current) => ({ ...current, [balance.reservationId]: event.target.value }))}
                            />
                            <button type="button" onClick={() => void saveReservationTotal(balance)} disabled={saving}>Kaydet</button>
                          </div>
                        </details>
                        {balance.remainingMinor > 0 && (
                          <button className="finance-payment-button" type="button" onClick={() => openPayment(balance)}>Ödeme Al</button>
                        )}
                      </div>
                    </>
                  )}

                  {paymentReservationId === balance.reservationId && (
                    <div className="finance-payment-form">
                      <label>
                        Alınan tutar
                        <input inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
                      </label>
                      <label>
                        Ödeme şekli
                        <PaymentMethodSelect value={paymentMethod} onChange={setPaymentMethod} />
                      </label>
                      <button type="button" onClick={() => void savePayment(balance)} disabled={saving}>{saving ? "Kaydediliyor…" : "Ödemeyi Kaydet"}</button>
                      <button className="is-secondary" type="button" onClick={() => setPaymentReservationId("")}>Vazgeç</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="finance-recent-panel">
          <div className="finance-section-heading">
            <div><h3>Son Hareketler</h3><p>Restoran, pansiyon ve manuel kayıtlar</p></div>
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
      </div>

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
  if (compact.includes(",")) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if ((compact.match(/\./g) ?? []).length > 1) {
    normalized = compact.replace(/\./g, "");
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : -1;
}

function minorToInput(value: number): string {
  return (value / 100).toFixed(2).replace(".", ",");
}

function minorMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  return end && end !== start ? `${start} – ${end}` : start;
}

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Tarih yok";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function entrySourceLabel(entry: DesktopFinanceEntry): string {
  if (entry.sourceType === "restaurant_order") return "Restoran";
  if (entry.sourceType === "pension_payment") return "Pansiyon";
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

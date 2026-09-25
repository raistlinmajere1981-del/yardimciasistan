import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Banknote, BedDouble, CreditCard, Landmark, Minus, Plus, Trash2, WalletCards } from "lucide-react";
import { formatMinorCurrency } from "@yardimci-asistan/shared";
import type { FinanceController } from "../../app/controller-types";
import type {
  DesktopFinanceCategory,
  DesktopFinanceEntry,
  FinanceDirection,
  FinancePaymentMethod
} from "../../../electron/finance";
import { ActionButton } from "../ui/ActionButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { FormDialog } from "../ui/FormDialog";
import { DatePicker } from "../ui/DateTimePicker";
import { MetricCard } from "../ui/MetricCard";
import { MoneyInput } from "../ui/MoneyInput";
import { Panel } from "../ui/Panel";
import { useRequestGeneration } from "../workspace/use-request-generation";

type OutstandingRow = {
  id: string;
  customerName: string;
  context: string;
  status: string;
  dateText: string;
  remainingMinor: number;
};

export function FinanceWorkspace({
  controller,
  topPanel
}: {
  controller: FinanceController;
  topPanel?: ReactNode;
}) {
  const {
    data,
    roomData,
    loading,
    message,
    draft,
    saving,
    accommodationEnabled,
    accommodationFolioEnabled,
    foodServiceEnabled,
    openEntry,
    closeEntry,
    updateDraft,
    saveEntry,
    saveCategory,
    deleteCategory,
    deleteManualEntry
  } = controller;
  const [pendingDelete, setPendingDelete] = useState<DesktopFinanceEntry | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const beginPresentationRequest = useRequestGeneration();

  const categoryOptions = useMemo(
    () => financeCategoriesForMode(
      data.categories,
      draft.mode,
      accommodationEnabled,
      foodServiceEnabled
    ),
    [accommodationEnabled, data.categories, draft.mode, foodServiceEnabled]
  );
  const editableCategories = categoryOptions.filter((category) => !category.isSystem);

  useEffect(() => {
    setNewCategoryName("");
  }, [draft.mode]);

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

  async function submitEntry() {
    await saveEntry();
  }

  async function addCategory() {
    if (!draft.mode || !newCategoryName.trim()) return;
    const saved = await saveCategory(draft.mode, newCategoryName);
    if (saved) setNewCategoryName("");
  }

  async function confirmDeleteEntry() {
    const entry = pendingDelete;
    if (!entry || entry.sourceType !== "manual") return;
    const isCurrent = beginPresentationRequest();
    await deleteManualEntry(entry);
    if (isCurrent()) {
      setPendingDelete((current) => current?.id === entry.id ? null : current);
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
          <ActionButton variant="primary" onClick={() => openEntry("income")} disabled={saving || loading}>
            <Plus size={16} aria-hidden="true" /> Gelir Ekle
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => openEntry("expense")} disabled={saving || loading}>
            <Minus size={16} aria-hidden="true" /> Gider Ekle
          </ActionButton>
        </div>
      </div>

      <div className="finance-summary-grid">
        <MetricCard compact title="Bugün Gelen" value={formatMinorCurrency(data.todayIncomeMinor)} detail="Kasaya giren" tone="ok" icon={Banknote} />
        <MetricCard compact title="Bugün Çıkan" value={formatMinorCurrency(data.todayExpenseMinor)} detail="Kaydedilen gider" tone="wait" icon={WalletCards} />
        <MetricCard compact title="Bugünkü Fark" value={formatMinorCurrency(data.todayNetMinor)} detail="Gelen - çıkan" tone={data.todayNetMinor >= 0 ? "info" : "wait"} icon={CreditCard} />
        {accommodationFolioEnabled && <MetricCard compact title="Bekleyen Alacak" value={formatMinorCurrency(data.outstandingPensionMinor)} detail="Oda hesapları" tone={data.outstandingPensionMinor > 0 ? "wait" : "ok"} icon={Landmark} />}
      </div>

      {topPanel && <div className="finance-top-panel">{topPanel}</div>}

      <div className={`finance-main-grid ${!accommodationFolioEnabled ? "is-single-column" : ""}`}>
        <Panel className="finance-recent-panel">
          <div className="finance-section-heading page-toolbar">
            <div>
              <h3>Son Hareketler</h3>
              <p>Otomatik ve elle eklenen kasa kayıtları</p>
            </div>
            {loading && <span className="loading-state" role="status">Yükleniyor…</span>}
          </div>
          {data.recentEntries.length === 0 ? (
            <p className="empty-state">Henüz kasa hareketi yok.</p>
          ) : (
            <>
              <div className="finance-entry-list">
                {data.recentEntries.map((entry) => (
                  <article key={entry.id} className="finance-entry-item">
                    <span className={`finance-direction-icon is-${entry.direction}`} aria-hidden="true">
                      {entry.direction === "income" ? "+" : "−"}
                    </span>
                    <div className="finance-entry-item__main">
                      <strong>{entry.description || categoryLabel(entry.category, data.categories)}</strong>
                      <span>{entrySourceLabel(entry, data.categories)} · {paymentMethodLabel(entry.paymentMethod)} · {formatDateTime(entry.occurredAt)}</span>
                    </div>
                    <b className={`finance-entry-item__amount ${entry.direction === "income" ? "is-income" : "is-expense"}`}>
                      {entry.direction === "income" ? "+" : "−"}{formatMinorCurrency(entry.amountMinor)}
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
            </>
          )}
        </Panel>

        {accommodationFolioEnabled && (
          <Panel className="finance-outstanding-panel" padding="compact">
            <div className="finance-section-heading page-toolbar">
              <div>
                <h3>Bekleyen Alacaklar</h3>
                <p>Oda hesapları</p>
              </div>
              <strong>{formatMinorCurrency(data.outstandingPensionMinor)}</strong>
            </div>
            {outstandingRows.length === 0 ? (
              <p className="finance-compact-empty">Açık alacak yok.</p>
            ) : (
              <div className="finance-outstanding-list">
                {outstandingRows.map((item) => (
                  <article key={item.id} className="finance-outstanding-item">
                    <div className="finance-outstanding-item__main">
                      <strong>{item.customerName}</strong>
                      <span>{item.context}{item.dateText ? ` · ${item.dateText}` : ""}</span>
                    </div>
                    <b className="finance-outstanding-item__amount">{formatMinorCurrency(item.remainingMinor)}</b>
                  </article>
                ))}
              </div>
            )}
            {outstandingRows.length > 0 && (
              <div className="finance-room-note">
                <BedDouble size={15} aria-hidden="true" />
                <span>Tahsilat Pansiyon → Oda Adisyonu içinden yapılır.</span>
              </div>
            )}
          </Panel>
        )}
      </div>

      {draft.mode && (
        <FormDialog
          title={draft.mode === "income" ? "Gelir ekle" : "Gider ekle"}
          onClose={() => {
            if (!saving) closeEntry();
          }}
          closeBlocked={saving}
          dismissOnBackdrop
          onSubmit={(event) => {
            event.preventDefault();
            void submitEntry();
          }}
          footer={(
            <>
              {message && <p className="form-status" role="status">{message}</p>}
              <div className="action-row finance-entry-dialog-actions">
                <ActionButton variant="secondary" type="button" onClick={closeEntry} disabled={saving}>
                  Vazgeç
                </ActionButton>
                <ActionButton type="submit" disabled={saving || !draft.category}>
                  {saving ? "Kaydediliyor…" : draft.mode === "income" ? "Geliri Kaydet" : "Gideri Kaydet"}
                </ActionButton>
              </div>
            </>
          )}
        >
          <div className="form-stack customer-create-form finance-entry-dialog">
            <section className="panel form-stack">
              <div className="page-toolbar">
                <div className="page-toolbar__copy">
                  <strong>İşlem bilgileri</strong>
                </div>
              </div>
              <div className="form-grid">
                <label className="form-field form-field--short">
                  <span>Tutar</span>
                  <MoneyInput
                    value={draft.amount}
                    onChange={(amount) => updateDraft({ amount })}
                    autoFocus
                    disabled={saving}
                  />
                </label>
                <label className="form-field form-field--medium">
                  <span>Tür</span>
                  <select
                    value={draft.category}
                    onChange={(event) => updateDraft({ category: event.target.value })}
                    disabled={saving || categoryOptions.length === 0}
                  >
                    {categoryOptions.length === 0 && <option value="">Önce tür ekleyin</option>}
                    {categoryOptions.map((category) => (
                      <option value={category.id} key={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field form-field--span form-field--fluid">
                  <span>Açıklama</span>
                  <input
                    value={draft.description}
                    onChange={(event) => updateDraft({ description: event.target.value })}
                    placeholder={draft.mode === "income" ? "Örn. ek hizmet" : "Örn. elektrik faturası"}
                    maxLength={160}
                    disabled={saving}
                  />
                </label>
              </div>

              <div className="finance-category-manager">
                <div className="finance-category-manager__heading">
                  <strong>{draft.mode === "income" ? "Gelir türleri" : "Gider türleri"}</strong>
                </div>
                <div className="finance-category-add">
                  <input
                    aria-label={draft.mode === "income" ? "Yeni gelir türü" : "Yeni gider türü"}
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder={draft.mode === "income" ? "Örn. Ek hizmet" : "Örn. Elektrik"}
                    maxLength={80}
                    disabled={saving}
                  />
                  <ActionButton type="button" variant="secondary" size="sm" onClick={() => void addCategory()} disabled={saving || !newCategoryName.trim()}>
                    <Plus size={15} aria-hidden="true" /> Tür Ekle
                  </ActionButton>
                </div>
                <div className="finance-category-list">
                  {editableCategories.map((category) => (
                    <div className="finance-category-item" key={category.id}>
                      <span>{category.name}</span>
                      <ActionButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${category.name} türünü kaldır`}
                        onClick={() => void deleteCategory(category)}
                        disabled={saving}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </ActionButton>
                    </div>
                  ))}
                  {editableCategories.length === 0 && <span className="finance-category-empty">Henüz kullanıcı türü yok.</span>}
                </div>
              </div>
            </section>

            <section className="panel form-stack">
              <div className="page-toolbar">
                <div className="page-toolbar__copy">
                  <strong>Ödeme bilgileri</strong>
                </div>
              </div>
              <div className="form-grid">
                <label className="form-field form-field--medium">
                  <span>Ödeme şekli</span>
                  <PaymentMethodSelect
                    value={draft.paymentMethod}
                    onChange={(paymentMethod) => updateDraft({ paymentMethod })}
                    disabled={saving}
                  />
                </label>
                <div className="form-field form-field--short">
                  <span>İşlem tarihi</span>
                  <DatePicker
                    ariaLabel="İşlem tarihi"
                    value={draft.date}
                    presets={[]}
                    disabled={saving}
                    onChange={(date) => updateDraft({ date })}
                  />
                </div>
              </div>
            </section>
          </div>
        </FormDialog>
      )}

      {pendingDelete && <ConfirmDialog tone="danger" eyebrow="Kasa kaydı" title="Bu hareket kaldırılsın mı?"
        description="Yalnız elle eklenen kasa kayıtları bu şekilde kaldırılabilir."
        details={<><strong>{pendingDelete.description || categoryLabel(pendingDelete.category, data.categories)}</strong> · {formatMinorCurrency(pendingDelete.amountMinor)}</>}
        busy={saving} confirmLabel={saving ? "Kaldırılıyor…" : "Kaydı Kaldır"}
        onConfirm={confirmDeleteEntry} onCancel={() => setPendingDelete(null)} />}
    </section>
  );
}

function financeCategoriesForMode(
  categories: DesktopFinanceCategory[],
  mode: FinanceDirection | null,
  accommodationEnabled: boolean,
  foodServiceEnabled: boolean
) {
  if (!mode) return [];
  return categories.filter((category) => {
    if (!category.isActive || category.direction !== mode) return false;
    if (category.id === "pension") return accommodationEnabled;
    if (category.id === "restaurant") return foodServiceEnabled;
    return true;
  });
}

function PaymentMethodSelect({
  value,
  onChange,
  disabled
}: {
  value: FinancePaymentMethod;
  onChange: (value: FinancePaymentMethod) => void;
  disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as FinancePaymentMethod)} disabled={disabled}>
      <option value="cash">Nakit</option>
      <option value="card">Kart</option>
      <option value="bank">Banka / Havale</option>
      <option value="other">Diğer</option>
    </select>
  );
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

function entrySourceLabel(entry: DesktopFinanceEntry, categories: DesktopFinanceCategory[]): string {
  if (entry.sourceType === "restaurant_order") return "Restoran";
  if (entry.sourceType === "room_folio_payment") return "Oda tahsilatı";
  if (entry.sourceType === "pension_payment") return "Eski pansiyon kaydı";
  return categoryLabel(entry.category, categories);
}

function paymentMethodLabel(method: FinancePaymentMethod): string {
  if (method === "cash") return "Nakit";
  if (method === "card") return "Kart";
  if (method === "bank") return "Banka / Havale";
  if (method === "other") return "Diğer";
  return "Belirtilmedi";
}

function categoryLabel(category: string, categories: DesktopFinanceCategory[]): string {
  return categories.find((item) => item.id === category)?.name ?? "Kasa hareketi";
}


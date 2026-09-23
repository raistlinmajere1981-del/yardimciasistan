import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Calculator,
  CalendarCheck,
  ClipboardList,
  Inbox,
  PackageMinus,
  ReceiptText,
  Sparkles
} from "lucide-react";
import type {
  DesktopReportAiMode,
  DesktopReportData,
  DesktopReportPeriod,
  DesktopReportPreset,
  DesktopReportRangeInput,
  DesktopReportStockMovement
} from "../../electron/database";
import { FinanceWorkspace } from "../components/finance/FinanceWorkspace";
import type { FinanceController } from "../app/controller-types";
import { MetricCard } from "../components/ui/MetricCard";
import { Panel } from "../components/ui/Panel";

interface ReportsPageProps {
  aiEnabled: boolean;
  financeEnabled: boolean;
  financeController: FinanceController;
  reportsEnabled: boolean;
  requestsEnabled: boolean;
  tasksEnabled: boolean;
  accommodationEnabled: boolean;
  accommodationReservationsEnabled: boolean;
  accommodationFolioEnabled: boolean;
  foodServiceEnabled: boolean;
  foodReservationsEnabled: boolean;
  foodOrdersEnabled: boolean;
  foodMenuEnabled: boolean;
  inventoryEnabled: boolean;
}

const AI_ACTIONS: Array<{ mode: DesktopReportAiMode; label: string }> = [
  { mode: "summary", label: "Dönemi Özetle" },
  { mode: "attention", label: "Dikkat Edilecekleri Bul" },
  { mode: "sales", label: "Satışları Yorumla" },
  { mode: "recommendations", label: "İşletme İçin Öneri Ver" }
];

const REPORT_PRESETS: Array<{ preset: Exclude<DesktopReportPreset, "custom">; label: string }> = [
  { preset: "today", label: "Bugün" },
  { preset: "yesterday", label: "Dün" },
  { preset: "last7", label: "Son 7 Gün" },
  { preset: "last30", label: "Son 30 Gün" }
];

export function ReportsPage({
  aiEnabled,
  financeEnabled,
  financeController,
  reportsEnabled,
  requestsEnabled,
  tasksEnabled,
  accommodationEnabled,
  accommodationReservationsEnabled,
  accommodationFolioEnabled,
  foodServiceEnabled,
  foodReservationsEnabled,
  foodOrdersEnabled,
  foodMenuEnabled,
  inventoryEnabled
}: ReportsPageProps) {
  const initialRange = useMemo(() => createPresetRange("last7"), []);
  const [range, setRange] = useState<DesktopReportRangeInput>(initialRange);
  const [customStart, setCustomStart] = useState(initialRange.startDate);
  const [customEnd, setCustomEnd] = useState(initialRange.endDate);
  const [report, setReport] = useState<DesktopReportData>(() => emptyReport(initialRange));
  const [loading, setLoading] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [aiMode, setAiMode] = useState<DesktopReportAiMode | "">("");
  const [aiContent, setAiContent] = useState("");
  const [aiMessage, setAiMessage] = useState("Bir yorum türü seçtiğinizde AI yalnız hazırlanmış rapor sonucunu kullanır.");
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setAiMode("");
    setAiContent("");
    setAiMessage("Bir yorum türü seçtiğinizde AI yalnız hazırlanmış rapor sonucunu kullanır.");
    if (!reportsEnabled) {
      setReport(emptyReport(range));
      setLoading(false);
      setReportMessage("");
      return () => {
        active = false;
      };
    }
    if (!window.yardimciDesktop) {
      setReport(emptyReport(range));
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setReportMessage("");
    void window.yardimciDesktop.getReportData(range).then((result) => {
      if (!active) return;
      if (result.ok) {
        setReport(result.data);
      } else {
        setReportMessage(result.message);
      }
    }).catch(() => {
      if (active) setReportMessage("Rapor verileri hazırlanamadı.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [
    accommodationReservationsEnabled,
    requestsEnabled,
    foodMenuEnabled,
    foodOrdersEnabled,
    foodReservationsEnabled,
    inventoryEnabled,
    range,
    reportsEnabled,
    tasksEnabled
  ]);

  function selectPreset(preset: Exclude<DesktopReportPreset, "custom">) {
    const nextRange = createPresetRange(preset);
    setRange(nextRange);
    setCustomStart(nextRange.startDate);
    setCustomEnd(nextRange.endDate);
  }

  function selectCustom() {
    const startDate = isIsoDate(customStart) ? customStart : localDateKey(new Date());
    const endDate = isIsoDate(customEnd) ? customEnd : startDate;
    setRange({
      preset: "custom",
      label: formatPeriodLabel(startDate, endDate),
      startDate,
      endDate
    });
  }

  function updateCustomRange(startDate: string, endDate: string) {
    setCustomStart(startDate);
    setCustomEnd(endDate);
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
      setReportMessage("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
      return;
    }
    setReportMessage("");
    setRange({
      preset: "custom",
      label: formatPeriodLabel(startDate, endDate),
      startDate,
      endDate
    });
  }

  function toggleDetails(toggle: HTMLButtonElement) {
    const nextOpen = !detailsOpen;
    setDetailsOpen(nextOpen);
    if (nextOpen) {
      window.requestAnimationFrame(() => toggle.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  async function generateAiComment(mode: DesktopReportAiMode) {
    setAiMode(mode);
    setAiContent("");
    setAiMessage("AI işletme yorumu hazırlanıyor...");
    if (!aiEnabled || !window.yardimciDesktop) {
      setAiMessage("Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.");
      return;
    }
    try {
      const result = await window.yardimciDesktop.generateReportAiComment({ mode, range });
      if (result.ok) {
        setAiContent(result.content);
        setAiMessage("AI yorumu hazır.");
      } else {
        setAiMessage(result.message);
      }
    } catch {
      setAiMessage("Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.");
    }
  }

  const maxDailyRevenue = Math.max(0, ...report.restaurant.dailyRevenue.map((day) => day.revenue));
  const reservationsEnabled = accommodationReservationsEnabled || foodReservationsEnabled;
  const stockEnabled = foodMenuEnabled && inventoryEnabled;
  const visibleAttentionItems = report.attention.items.filter((item) => {
    if (item.kind === "pending_request") return requestsEnabled;
    if (item.kind === "overdue_task" || item.kind === "open_task") return tasksEnabled;
    if (item.kind === "pending_reservation") return reservationsEnabled;
    if (item.kind === "payment_waiting") return foodOrdersEnabled;
    if (["out_of_stock", "low_stock"].includes(item.kind)) return stockEnabled;
    return true;
  });

  return (
    <section className={`reports-page${detailsOpen ? "" : " reports-details-collapsed"}`} aria-label={financeEnabled && reportsEnabled ? "Kasa ve işletme raporları" : financeEnabled ? "Kasa" : "İşletme raporları"}>
      {financeEnabled && <FinanceWorkspace controller={financeController} />}

      {reportsEnabled && <>
      <button
        className="reports-detail-divider cash-details-toggle"
        type="button"
        aria-expanded={detailsOpen}
        aria-label={detailsOpen ? "Detaylı raporları gizle" : "Geçmiş ve detaylı raporları aç"}
        onClick={(event) => toggleDetails(event.currentTarget)}
      >
        <div>
          <span>Detaylı raporlar</span>
          <strong>{detailsOpen ? "Detaylı Raporları Gizle" : "Geçmiş ve Detaylı Raporları Aç"}</strong>
        </div>
      </button>

      <Panel className="report-filter-panel" padding="compact">
        <div className="report-filter-heading">
          <div>
            <p className="panel-eyebrow">Ortak tarih filtresi</p>
            <h2>{formatReportPeriod(report.period)}</h2>
          </div>
          {loading && <span className="report-loading loading-state" role="status">Rapor hazırlanıyor…</span>}
        </div>
        <div className="report-date-presets" role="group" aria-label="Rapor tarih aralığı">
          {REPORT_PRESETS.map((option) => (
            <button
              className={range.preset === option.preset ? "is-active" : ""}
              type="button"
              aria-pressed={range.preset === option.preset}
              onClick={() => selectPreset(option.preset)}
              key={option.preset}
            >
              {option.label}
            </button>
          ))}
          <button
            className={range.preset === "custom" ? "is-active" : ""}
            type="button"
            aria-pressed={range.preset === "custom"}
            onClick={selectCustom}
          >
            Tarih Aralığı
          </button>
        </div>
        {range.preset === "custom" && (
          <div className="report-custom-dates">
            <label>
              Başlangıç tarihi
              <input
                aria-label="Başlangıç tarihi"
                lang="tr-TR"
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(event) => updateCustomRange(event.target.value, customEnd)}
              />
              <small>GG.AA.YYYY</small>
            </label>
            <label>
              Bitiş tarihi
              <input
                aria-label="Bitiş tarihi"
                lang="tr-TR"
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(event) => updateCustomRange(customStart, event.target.value)}
              />
              <small>GG.AA.YYYY</small>
            </label>
          </div>
        )}
        {reportMessage && <p className="report-error" role="alert">{reportMessage}</p>}
      </Panel>

      <section aria-labelledby="report-summary-title">
        <div className="report-section-title">
          <div>
            <p>Seçilen dönem</p>
            <h2 id="report-summary-title">Genel İşletme Özeti</h2>
          </div>
        </div>
        <div className="report-summary-metrics">
          {foodOrdersEnabled && <MetricCard compact title="Restoran cirosu" value={money(report.summary.restaurantRevenue)} detail="Yalnız ödenmiş adisyonlar" tone="ok" icon={Banknote} />}
          {foodOrdersEnabled && <MetricCard compact title="Kapatılan adisyon" value={count(report.summary.closedOrders)} detail="Ödendi olarak kapatılan" tone="info" icon={ReceiptText} />}
          {foodOrdersEnabled && <MetricCard compact title="Ortalama hesap" value={report.summary.closedOrders > 0 ? money(report.summary.averageOrder) : "Veri yok"} detail="Ciro / ödenmiş adisyon" tone="neutral" icon={Calculator} />}
          {reservationsEnabled && <MetricCard compact title="Onaylanan rezervasyon" value={count(report.summary.approvedReservations)} detail="Etkin alanlardaki onaylı veya tamamlanmış kayıtlar" tone="info" icon={CalendarCheck} />}
          {requestsEnabled && <MetricCard compact title="Yeni müşteri talebi" value={count(report.summary.newRequests)} detail="Dönemde alınan talepler" tone="info" icon={Inbox} />}
          {tasksEnabled && <MetricCard compact title="Tamamlanmayan günlük iş" value={count(report.summary.pendingTasks)} detail="Döneme bağlı açık işler" tone={report.summary.pendingTasks > 0 ? "wait" : "ok"} icon={ClipboardList} />}
        </div>
      </section>

      {foodOrdersEnabled && <Panel className="report-section-panel">
        <div className="report-section-title">
          <div>
            <p>Ödenmiş adisyonlar</p>
            <h2>Restoran Satışları</h2>
          </div>
          <span>{count(report.restaurant.soldItemCount)} ürün satıldı · {count(report.restaurant.cancelledOrders)} adisyon iptal</span>
        </div>
        <div className="report-restaurant-metrics">
          <ReportInlineMetric label="Ciro" value={money(report.restaurant.revenue)} />
          <ReportInlineMetric label="Kapatılan" value={count(report.restaurant.closedOrders)} />
          <ReportInlineMetric label="Ortalama hesap" value={report.restaurant.closedOrders > 0 ? money(report.restaurant.averageOrder) : "Veri yok"} />
          <ReportInlineMetric label="Satılan ürün" value={count(report.restaurant.soldItemCount)} />
          <ReportInlineMetric label="İptal adisyon" value={count(report.restaurant.cancelledOrders)} />
        </div>
        <div className="report-sales-grid">
          <section className="report-chart-card" aria-labelledby="daily-revenue-title">
            <div className="report-subheading">
              <h3 id="daily-revenue-title">Günlere göre restoran cirosu</h3>
              <span>Yalnız paid / ödendi</span>
            </div>
            {maxDailyRevenue <= 0 ? (
              <ReportEmpty message="Bu dönemde ödenmiş adisyon yok." />
            ) : (
              <div className="daily-revenue-chart" role="img" aria-label="Günlere göre restoran cirosu sütun grafiği">
                {report.restaurant.dailyRevenue.map((day) => (
                  <div className="daily-revenue-column" title={`${longDate(day.date)} · ${money(day.revenue)} · ${day.closedOrders} adisyon`} key={day.date}>
                    <span className="daily-revenue-value">{day.revenue > 0 ? compactMoney(day.revenue) : "—"}</span>
                    <div className="daily-revenue-track">
                      <span style={{ height: `${day.revenue > 0 ? Math.max(5, (day.revenue / maxDailyRevenue) * 100) : 0}%` }} />
                    </div>
                    <small>{shortDate(day.date)}</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="report-table-card" aria-labelledby="top-items-title">
            <div className="report-subheading">
              <h3 id="top-items-title">En çok satılan 5 ürün</h3>
              <span>Sipariş satırı kayıtları</span>
            </div>
            {report.restaurant.topItems.length === 0 ? (
              <ReportEmpty message="Bu dönemde satılan ürün yok." />
            ) : (
              <div className="report-table-scroll">
                <table className="report-table">
                  <thead><tr><th>Ürün adı</th><th>Satılan adet</th><th>Toplam satış</th></tr></thead>
                  <tbody>
                    {report.restaurant.topItems.map((item) => (
                      <tr key={item.name}>
                        <td>{item.name}</td>
                        <td>{count(item.quantity)}</td>
                        <td>{money(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </Panel>}

      {(reservationsEnabled || requestsEnabled) && <Panel className="report-section-panel">
        <div className="report-section-title">
          <div>
            <p>{reservationsEnabled && requestsEnabled ? "Rezervasyon ve müşteri hareketleri" : reservationsEnabled ? "Rezervasyon hareketleri" : "Müşteri hareketleri"}</p>
            <h2>{reservationsEnabled && requestsEnabled ? "Rezervasyonlar ve Talepler" : reservationsEnabled ? "Rezervasyonlar" : "Müşteri Talepleri"}</h2>
          </div>
        </div>
        <div className="report-operation-grid">
          {reservationsEnabled && <section>
            <h3>Etkin rezervasyon alanları</h3>
            <div className="report-compact-counters">
              <ReportCounter label="Gelen rezervasyon" value={report.pensionAndRequests.incomingReservations} />
              <ReportCounter label="Onaylanan" value={report.pensionAndRequests.approvedReservations} />
              <ReportCounter label="Bekleyen" value={report.pensionAndRequests.pendingReservations} warning />
              <ReportCounter label="İptal / reddedilen" value={report.pensionAndRequests.cancelledOrRejectedReservations} />
              {accommodationReservationsEnabled && <ReportCounter label="Konaklama gecesi" value={report.pensionAndRequests.accommodationNights} />}
            </div>
          </section>}
          {requestsEnabled && <section>
            <h3>Müşteri talepleri</h3>
            <div className="report-compact-counters">
              <ReportCounter label="Yeni müşteri talebi" value={report.pensionAndRequests.newRequests} />
              <ReportCounter label="Cevaplanan talep" value={report.pensionAndRequests.answeredRequests} />
              <ReportCounter label="Cevap bekleyen" value={report.pensionAndRequests.waitingRequests} warning />
            </div>
          </section>}
        </div>
      </Panel>}

      {stockEnabled && <Panel className="report-section-panel">
        <div className="report-section-title">
          <div>
            <p>Seçilen dönem</p>
            <h2>Stok Hareketleri</h2>
          </div>
          <span>{report.stock.manualMovementCount} manuel · {report.stock.imageMovementCount} görsel / fatura</span>
        </div>
        <div className="report-stock-grid">
          <section className="report-table-card">
            <div className="report-subheading">
              <h3>En çok tüketilen stok takipli ürünler</h3>
            </div>
            {report.stock.topConsumed.length === 0 ? (
              <ReportEmpty message="Bu dönemde stok tüketimi kaydı yok." />
            ) : (
              <ul className="report-ranked-list">
                {report.stock.topConsumed.map((item, index) => (
                  <li key={item.menuItemId}>
                    <span>{index + 1}</span>
                    <strong>{item.name}</strong>
                    <small>{stockQuantity(item.quantity, item.unit)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <MovementList title="Manuel eklenen hareketler" movements={report.stock.manualMovements} />
          <MovementList title="Görselden / faturadan eklenenler" movements={report.stock.imageMovements} />
        </div>
        <MovementTable movements={report.stock.recentMovements} />
      </Panel>}

      <Panel className="report-section-panel report-attention-panel">
        <div className="report-section-title">
          <div>
            <p>Dikkat Gerektirenler</p>
            <h2>Anlık Durum</h2>
          </div>
          <span className="report-live-label">Tarih filtresinden bağımsız</span>
        </div>
        {visibleAttentionItems.length === 0 ? (
          <ReportEmpty message="Şu anda dikkat gerektiren açık kayıt yok." />
        ) : (
          <div className="report-attention-list">
            {visibleAttentionItems.map((item, index) => (
              <article key={`${item.kind}-${item.title}-${index}`}>
                <AlertTriangle size={17} aria-hidden="true" />
                <div><strong>{item.title}</strong><p>{item.detail}</p></div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {aiEnabled && <Panel className="report-section-panel report-ai-panel">
        <div className="report-section-title">
          <div>
            <p>İsteğe bağlı</p>
            <h2>AI İşletme Yorumu</h2>
          </div>
          <Sparkles size={20} aria-hidden="true" />
        </div>
        <div className="report-ai-actions">
          {AI_ACTIONS.filter((action) => action.mode !== "sales" || foodOrdersEnabled).map((action) => (
            <button
              className={aiMode === action.mode ? "is-active" : ""}
              type="button"
              disabled={aiMode === action.mode && aiMessage.includes("hazırlanıyor")}
              onClick={() => void generateAiComment(action.mode)}
              key={action.mode}
            >
              {action.label}
            </button>
          ))}
        </div>
        <p className="report-ai-status" role="status">{aiMessage}</p>
        {aiContent && <div className="report-ai-result">{aiContent}</div>}
      </Panel>}
      </>}
    </section>
  );
}

function ReportInlineMetric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ReportCounter({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <div className={warning && value > 0 ? "is-warning" : ""}><span>{label}</span><strong>{count(value)}</strong></div>;
}

function MovementList({ title, movements }: { title: string; movements: DesktopReportStockMovement[] }) {
  return (
    <section className="report-table-card">
      <div className="report-subheading"><h3>{title}</h3></div>
      {movements.length === 0 ? (
        <ReportEmpty message="Bu kaynakta hareket yok." />
      ) : (
        <ul className="report-movement-list">
          {movements.map((movement) => (
            <li key={movement.id}>
              <div><strong>{movement.itemName}</strong><span>{shortDateTime(movement.createdAt)}</span></div>
              <small className={movement.quantityChange < 0 ? "is-negative" : "is-positive"}>
                {signedStockQuantity(movement.quantityChange, movement.unit)}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MovementTable({ movements }: { movements: DesktopReportStockMovement[] }) {
  return (
    <section className="report-recent-movements">
      <div className="report-subheading"><h3>Son stok hareketleri</h3><span>Seçilen dönem</span></div>
      {movements.length === 0 ? (
        <ReportEmpty message="Bu dönemde stok hareketi yok." />
      ) : (
        <div className="report-table-scroll">
          <table className="report-table">
            <thead><tr><th>Tarih</th><th>Ürün</th><th>Kaynak</th><th>Değişim</th><th>Son stok</th></tr></thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td>{shortDateTime(movement.createdAt)}</td>
                  <td>{movement.itemName}</td>
                  <td>{movement.sourceLabel}</td>
                  <td>{signedStockQuantity(movement.quantityChange, movement.unit)}</td>
                  <td>{stockQuantity(movement.quantityAfter, movement.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReportEmpty({ message }: { message: string }) {
  return <div className="report-empty"><PackageMinus size={18} aria-hidden="true" /><span>{message}</span></div>;
}

function createPresetRange(preset: Exclude<DesktopReportPreset, "custom">): DesktopReportRangeInput {
  const today = localDateKey(new Date());
  if (preset === "yesterday") {
    const yesterday = shiftDate(today, -1);
    return { preset, label: "Dün", startDate: yesterday, endDate: yesterday };
  }
  if (preset === "last7") {
    return { preset, label: "Son 7 Gün", startDate: shiftDate(today, -6), endDate: today };
  }
  if (preset === "last30") {
    return { preset, label: "Son 30 Gün", startDate: shiftDate(today, -29), endDate: today };
  }
  return { preset, label: "Bugün", startDate: today, endDate: today };
}

function emptyReport(range: DesktopReportRangeInput): DesktopReportData {
  return {
    period: {
      preset: range.preset,
      label: range.label,
      startDate: range.startDate,
      endDate: range.endDate
    },
    generatedAt: "",
    summary: {
      restaurantRevenue: 0,
      closedOrders: 0,
      averageOrder: 0,
      approvedReservations: 0,
      approvedAccommodationReservations: 0,
      approvedFoodReservations: 0,
      approvedMixedReservations: 0,
      approvedGenericReservations: 0,
      newRequests: 0,
      pendingTasks: 0
    },
    restaurant: {
      revenue: 0,
      closedOrders: 0,
      averageOrder: 0,
      soldItemCount: 0,
      cancelledOrders: 0,
      dailyRevenue: [{ date: range.startDate, revenue: 0, closedOrders: 0 }],
      topItems: []
    },
    pensionAndRequests: {
      incomingReservations: 0,
      approvedReservations: 0,
      pendingReservations: 0,
      cancelledOrRejectedReservations: 0,
      accommodationNights: 0,
      newRequests: 0,
      answeredRequests: 0,
      waitingRequests: 0
    },
    stock: {
      topConsumed: [],
      manualMovementCount: 0,
      imageMovementCount: 0,
      manualMovements: [],
      imageMovements: [],
      recentMovements: []
    },
    attention: {
      pendingRequests: 0,
      pendingReservations: 0,
      paymentWaitingTables: 0,
      overdueTasks: 0,
      incompleteTasks: 0,
      outOfStockItems: 0,
      lowStockItems: 0,
      totalCount: 0,
      items: []
    }
  };
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00`));
}

function formatReportPeriod(period: DesktopReportPeriod): string {
  return period.startDate === period.endDate
    ? longDate(period.startDate)
    : formatPeriodLabel(period.startDate, period.endDate);
}

function formatPeriodLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return longDate(startDate);
  const start = dateFromIso(startDate);
  const end = dateFromIso(endDate);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(end)}`;
  }
  return `${longDate(startDate)} – ${longDate(endDate)}`;
}

function longDate(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(dateFromIso(value));
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(dateFromIso(value));
}

function shortDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function money(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value);
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", { notation: "compact", style: "currency", currency: "TRY", maximumFractionDigits: 1 }).format(value);
}

function count(value: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(value);
}

function stockQuantity(value: number, unit: string): string {
  return `${count(value)} ${unit === "gram" ? "g" : "adet"}`;
}

function signedStockQuantity(value: number, unit: string): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${stockQuantity(value, unit)}`;
}

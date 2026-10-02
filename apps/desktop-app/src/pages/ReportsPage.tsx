import { useEffect, useMemo, useState } from "react";
import {
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
  DesktopReportPreset,
  DesktopReportRangeInput,
  DesktopReportStockMovement
} from "../../electron/database";
import type { DesktopFinanceAiMode } from "../../electron/finance";
import { FinanceWorkspace } from "../components/finance/FinanceWorkspace";
import type { FinanceController } from "../app/controller-types";
import { MetricCard } from "../components/ui/MetricCard";
import { Panel } from "../components/ui/Panel";
import { DatePicker } from "../components/ui/DateTimePicker";
import { PageWorkSurface } from "../components/layout/PageWorkSurface";

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

const REPORT_AI_ACTIONS: Array<{ mode: DesktopReportAiMode; label: string }> = [
  { mode: "summary", label: "Dönemi Özetle" },
  { mode: "sales", label: "Satışları Yorumla" },
  { mode: "recommendations", label: "İşletme İçin Öneri Ver" }
];

const CASH_AI_ACTIONS: Array<{ mode: DesktopFinanceAiMode; label: string }> = [
  { mode: "summary", label: "Bugünü Özetle" },
  { mode: "flow", label: "Hareketleri Yorumla" },
  { mode: "receivables", label: "Alacakları Yorumla" },
  { mode: "recommendations", label: "Kasa İçin Öneri Ver" }
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
  accommodationReservationsEnabled,
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
  const [reportAiMode, setReportAiMode] = useState<DesktopReportAiMode | "">("");
  const [reportAiContent, setReportAiContent] = useState("");
  const [reportAiMessage, setReportAiMessage] = useState("AI yalnız seçilen dönemin hazırlanmış rapor verisini kullanır.");
  const [cashAiMode, setCashAiMode] = useState<DesktopFinanceAiMode | "">("");
  const [cashAiContent, setCashAiContent] = useState("");
  const [cashAiMessage, setCashAiMessage] = useState("");
  const [activeView, setActiveView] = useState<"cash" | "reports">("cash");

  useEffect(() => {
    let active = true;
    setReportAiMode("");
    setReportAiContent("");
    setReportAiMessage("AI yalnız seçilen dönemin hazırlanmış rapor verisini kullanır.");
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

  async function generateReportAiComment(mode: DesktopReportAiMode) {
    setReportAiMode(mode);
    setReportAiContent("");
    setReportAiMessage("AI dönem yorumu hazırlanıyor...");
    if (!aiEnabled || !window.yardimciDesktop) {
      setReportAiMessage("Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.");
      return;
    }
    try {
      const result = await window.yardimciDesktop.generateReportAiComment({ mode, range });
      if (result.ok) {
        setReportAiContent(result.content);
        setReportAiMessage("AI dönem yorumu hazır.");
      } else {
        setReportAiMessage(result.message);
      }
    } catch {
      setReportAiMessage("Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.");
    }
  }

  async function generateCashAiComment(mode: DesktopFinanceAiMode) {
    setCashAiMode(mode);
    setCashAiContent("");
    setCashAiMessage("AI kasa yorumu hazırlanıyor...");
    if (!aiEnabled || !window.yardimciDesktop?.generateFinanceAiComment) {
      setCashAiMessage("Kasa verileri hazır ancak AI yorumu şu anda oluşturulamadı.");
      return;
    }
    try {
      const result = await window.yardimciDesktop.generateFinanceAiComment({ mode });
      if (result.ok) {
        setCashAiContent(result.content);
        setCashAiMessage("AI kasa yorumu hazır.");
      } else {
        setCashAiMessage(result.message);
      }
    } catch {
      setCashAiMessage("Kasa verileri hazır ancak AI yorumu şu anda oluşturulamadı.");
    }
  }

  useEffect(() => {
    setCashAiMode("");
    setCashAiContent("");
    setCashAiMessage("");
  }, [financeController.data.generatedAt]);

  const maxDailyRevenue = Math.max(0, ...report.restaurant.dailyRevenue.map((day) => day.revenue));
  const reservationsEnabled = accommodationReservationsEnabled || foodReservationsEnabled;
  const stockEnabled = foodMenuEnabled && inventoryEnabled;
  const financeAiPanel = aiEnabled && financeEnabled ? (
    <Panel className="finance-ai-panel report-ai-panel" padding="compact">
      <div className="report-section-title">
        <div>
          <p>Bugünkü kasa</p>
          <h2>AI Kasa Yorumu</h2>
        </div>
        <Sparkles size={19} aria-hidden="true" />
      </div>
      <div className="finance-ai-period">
        <span>{longDate(localDateKey(new Date()))}</span>
        <small>Bugünkü para hareketleri ve mevcut bekleyen alacaklar</small>
      </div>
      <div className="report-ai-actions finance-ai-actions">
        {CASH_AI_ACTIONS.map((action) => (
          <button
            className={cashAiMode === action.mode ? "is-active" : ""}
            type="button"
            disabled={cashAiMode === action.mode && cashAiMessage.includes("hazırlanıyor")}
            onClick={() => void generateCashAiComment(action.mode)}
            key={action.mode}
          >
            {action.label}
          </button>
        ))}
      </div>
      {cashAiMessage && <p className="report-ai-status" role="status">{cashAiMessage}</p>}
      {cashAiContent && <div className="report-ai-result finance-ai-result">{cashAiContent}</div>}
    </Panel>
  ) : null;

  return (
    <PageWorkSurface mode="fill" className="reports-page-surface">
      <section className="reports-page" aria-label={financeEnabled && reportsEnabled ? "Kasa ve işletme raporları" : financeEnabled ? "Kasa" : "İşletme raporları"}>
      {financeEnabled && reportsEnabled && (
        <div className="reports-view-tabs" role="tablist" aria-label="Kasa görünümü">
          <button
            role="tab"
            aria-selected={activeView === "cash"}
            className={activeView === "cash" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveView("cash")}
          >
            Kasa
          </button>
          <button
            role="tab"
            aria-selected={activeView === "reports"}
            className={activeView === "reports" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveView("reports")}
          >
            Detaylı Raporlar
          </button>
        </div>
      )}

      {financeEnabled && (!reportsEnabled || activeView === "cash") && (
        <FinanceWorkspace controller={financeController} topPanel={financeAiPanel} />
      )}

      {reportsEnabled && (!financeEnabled || activeView === "reports") && <div className="reports-detail-view">

      <Panel className="report-filter-panel" padding="compact">
        <div className="report-filter-heading">
          <div>
            <p className="panel-eyebrow">Rapor dönemi</p>
            <h2>{formatPeriodLabel(range.startDate, range.endDate)}</h2>
          </div>
          {loading && <span className="report-loading loading-state" role="status">Rapor hazırlanıyor…</span>}
        </div>
        <div className="report-control-row">
          <div className="report-period-controls">
            <div className="report-date-presets" role="group" aria-label="Detaylı rapor tarih aralığı">
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
              <div className="report-custom-dates report-custom-dates-inline">
                <div className="form-field report-custom-date-field">
                  <span>Başlangıç tarihi</span>
                  <DatePicker
                    ariaLabel="Başlangıç tarihi"
                    value={customStart}
                    max={customEnd || undefined}
                    presets={[]}
                    onChange={(value) => updateCustomRange(value, customEnd)}
                  />
                </div>
                <div className="form-field report-custom-date-field">
                  <span>Bitiş tarihi</span>
                  <DatePicker
                    ariaLabel="Bitiş tarihi"
                    value={customEnd}
                    min={customStart || undefined}
                    presets={[]}
                    onChange={(value) => updateCustomRange(customStart, value)}
                  />
                </div>
              </div>
            )}
          </div>

          {aiEnabled && (
            <div className="report-ai-actions report-filter-ai-actions" role="group" aria-label="AI rapor yorumu">
              {REPORT_AI_ACTIONS.filter((action) => action.mode !== "sales" || foodOrdersEnabled).map((action) => (
                <button
                  className={reportAiMode === action.mode ? "is-active" : ""}
                  type="button"
                  disabled={loading || (reportAiMode === action.mode && reportAiMessage.includes("hazırlanıyor"))}
                  onClick={() => void generateReportAiComment(action.mode)}
                  key={action.mode}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {reportMessage && <p className="report-error" role="alert">{reportMessage}</p>}
        {aiEnabled && (reportAiMode || reportAiContent) && (
          <div className="report-filter-ai-feedback">
            <p className="report-ai-status" role="status">{reportAiMessage}</p>
            {reportAiContent && <div className="report-ai-result">{reportAiContent}</div>}
          </div>
        )}
      </Panel>

      <section aria-label="İşletme özeti">
        <div className="report-summary-metrics">
          {foodOrdersEnabled && <MetricCard compact title="Restoran cirosu" value={money(report.summary.restaurantRevenue)} detail="Yalnız ödenmiş adisyonlar" tone="success" icon={Banknote} />}
          {foodOrdersEnabled && <MetricCard compact title="Kapatılan adisyon" value={count(report.summary.closedOrders)} detail="Ödendi olarak kapatılan" tone="info" icon={ReceiptText} />}
          {foodOrdersEnabled && <MetricCard compact title="Ortalama hesap" value={report.summary.closedOrders > 0 ? money(report.summary.averageOrder) : "Veri yok"} detail="Ciro / ödenmiş adisyon" tone="neutral" icon={Calculator} />}
          {reservationsEnabled && <MetricCard compact title="Onaylanan rezervasyon" value={count(report.summary.approvedReservations)} detail="Etkin alanlardaki onaylı veya tamamlanmış kayıtlar" tone="info" icon={CalendarCheck} />}
          {requestsEnabled && <MetricCard compact title="Yeni müşteri talebi" value={count(report.summary.newRequests)} detail="Dönemde alınan talepler" tone="info" icon={Inbox} />}
          {tasksEnabled && <MetricCard compact title="Tamamlanmayan günlük iş" value={count(report.summary.pendingTasks)} detail="Döneme bağlı açık işler" tone={report.summary.pendingTasks > 0 ? "warning" : "success"} icon={ClipboardList} />}
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
          {reservationsEnabled && <section className="report-operation-section is-reservations">
            <h3>Etkin rezervasyon alanları</h3>
            <div className="report-compact-counters">
              <ReportCounter label="Gelen rezervasyon" value={report.pensionAndRequests.incomingReservations} />
              <ReportCounter label="Onaylanan" value={report.pensionAndRequests.approvedReservations} />
              <ReportCounter label="Bekleyen" value={report.pensionAndRequests.pendingReservations} warning />
              <ReportCounter label="İptal / reddedilen" value={report.pensionAndRequests.cancelledOrRejectedReservations} />
              {accommodationReservationsEnabled && <ReportCounter label="Konaklama gecesi" value={report.pensionAndRequests.accommodationNights} />}
            </div>
          </section>}
          {requestsEnabled && <section className="report-operation-section is-requests">
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

      </div>}
      </section>
    </PageWorkSurface>
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

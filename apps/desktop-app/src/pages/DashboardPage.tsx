import {
  AlertTriangle,
  BedDouble,
  Cake,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  MessageCircle,
  MessageSquareText,
  PackageMinus,
  ReceiptText,
  Sparkles,
  UtensilsCrossed
} from "lucide-react";
import type { DesktopDashboardData, DesktopSetupData } from "../../electron/database";
import type { AutomaticSyncStatus } from "../../electron/sync-coordinator";
import type { SyncState } from "../app/runtime-state";
import {
  buildDashboardView,
  formatDashboardDate,
  formatLongTurkishDate,
  type DashboardDateUrgency,
  type DashboardPriorityItem
} from "../app/dashboard";
import { SystemHealthPanel } from "../components/dashboard/SystemHealthPanel";
import { ActionButton } from "../components/ui/ActionButton";
import { Panel } from "../components/ui/Panel";
import { StatusBadge, type StatusTone } from "../components/ui/StatusBadge";

type DashboardRequest = DesktopDashboardData["requests"][number];

interface DashboardPageProps {
  data: DesktopDashboardData;
  setupData: DesktopSetupData;
  automaticSyncStatus: AutomaticSyncStatus;
  features: {
    rooms: boolean;
    tables: boolean;
    whatsapp: boolean;
    android: boolean;
  };
  aiEnabled: boolean;
  customersEnabled: boolean;
  requestsEnabled: boolean;
  tasksEnabled: boolean;
  calendarEnabled: boolean;
  reservationsEnabled: boolean;
  availableRoomCount: number;
  onReplyRequest: (request: DashboardRequest) => void;
  onOpenCustomerWork: (request?: DashboardRequest) => void;
  onOpenReservation: (reservation: DesktopDashboardData["reservations"][number]) => void;
  onCompleteTask: (taskId: string) => void;
  dailyAiState: SyncState;
  dailyAiMessage: string;
  dailyAiContent: string;
  dailyAiFallback: boolean;
  onGenerateDailyAi: () => void;
  onPrepareBirthday: (customerId: string) => void;
  birthdayPreparingId?: string;
  formatRequestType: (value: string) => string;
  formatRequestStatus: (value: string) => string;
  getRequestStatusTone: (status: string) => StatusTone;
  isRequestWaitingForReply: (status: string) => boolean;
  formatTaskDue: (task: DesktopDashboardData["dailyTasks"][number]) => string;
  formatReservationDate: (reservation: DesktopDashboardData["reservations"][number]) => string;
}

export function DashboardPage({
  data,
  setupData,
  automaticSyncStatus,
  features,
  aiEnabled,
  customersEnabled,
  requestsEnabled,
  tasksEnabled,
  calendarEnabled,
  reservationsEnabled,
  availableRoomCount,
  onReplyRequest,
  onOpenCustomerWork,
  onOpenReservation,
  onCompleteTask,
  dailyAiState,
  dailyAiMessage,
  dailyAiContent,
  dailyAiFallback,
  onGenerateDailyAi,
  onPrepareBirthday,
  birthdayPreparingId = "",
  formatRequestType,
  formatRequestStatus,
  getRequestStatusTone,
  isRequestWaitingForReply,
  formatTaskDue,
  formatReservationDate
}: DashboardPageProps) {
  const dashboard = buildDashboardView(data, isRequestWaitingForReply);
  const waitingRequestCount = data.summary.waitingRequests;
  const openTaskCount = data.summary.pendingDailyTasks;
  const pendingReservationCount = data.summary.pendingReservations;
  const birthdayOverview = data.birthdayOverview;
  const birthdayAttentionCount = customersEnabled && birthdayOverview.enabled
    ? birthdayOverview.dueCount + birthdayOverview.invalidPhoneCount + birthdayOverview.waitingCount + birthdayOverview.failedCount
    : 0;
  const operationalAttention = data.attention ?? {
    pendingRequests: 0,
    pendingReservations: 0,
    paymentWaitingTables: 0,
    overdueTasks: 0,
    incompleteTasks: 0,
    outOfStockItems: 0,
    lowStockItems: 0,
    totalCount: 0,
    items: []
  };
  const paymentWaitingCount = operationalAttention.paymentWaitingTables;
  const stockAttentionCount = operationalAttention.outOfStockItems + operationalAttention.lowStockItems;
  const operationalAttentionItems = operationalAttention.items.filter((item) =>
    item.kind === "payment_waiting" || item.kind === "out_of_stock" || item.kind === "low_stock"
  );
  const attentionCount = waitingRequestCount
    + openTaskCount
    + pendingReservationCount
    + birthdayAttentionCount
    + paymentWaitingCount
    + stockAttentionCount;
  const visiblePriorityItems = dashboard.priorityItems;
  const visibleScheduleItems = dashboard.scheduleItems;
  const hasCapacityMetrics = features.rooms || features.tables || (features.whatsapp && customersEnabled);
  const capacityVisible = hasCapacityMetrics || aiEnabled;

  const renderPriorityItem = (item: DashboardPriorityItem, index: number) => (
    <li className={`dashboard-priority-item priority-${item.kind}`} key={item.key}>
      <span className="dashboard-priority-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <span className="dashboard-priority-icon" aria-hidden="true">
        {item.kind === "request" ? <MessageCircle size={18} /> : item.kind === "task" ? <ClipboardCheck size={18} /> : <CalendarCheck2 size={18} />}
      </span>
      <div className="dashboard-priority-copy">
        <div className="dashboard-priority-title-row">
          <div>
            <span>{getPriorityKicker(item)}</span>
            <h3>{getPriorityTitle(item)}</h3>
          </div>
          <PriorityBadge
            item={item}
            formatRequestStatus={formatRequestStatus}
            getRequestStatusTone={getRequestStatusTone}
          />
        </div>
        <p className="dashboard-priority-meta">
          {getPriorityMeta(item, dashboard.today, formatRequestType, formatTaskDue, formatReservationDate)}
        </p>
        {getPriorityDescription(item) && <p className="dashboard-priority-description">{getPriorityDescription(item)}</p>}
      </div>
      <div className="dashboard-priority-action">
        {item.kind === "request" ? (
          <ActionButton
            variant="secondary"
            onClick={() => (features.whatsapp || aiEnabled) ? onReplyRequest(item.request) : onOpenCustomerWork(item.request)}
            aria-label={`${item.request.customer_name} talebini ${(features.whatsapp || aiEnabled) ? "yanıtla" : "incele"}`}
          >
            {(features.whatsapp || aiEnabled) ? "Yanıtla" : "İncele"}
            <ChevronRight size={15} aria-hidden="true" />
          </ActionButton>
        ) : item.kind === "task" ? (
          <ActionButton
            variant="ghost"
            onClick={() => onCompleteTask(item.task.id)}
            aria-label={`${item.task.title} işini tamamla`}
          >
            <Check size={15} aria-hidden="true" />
            Tamamla
          </ActionButton>
        ) : (
          <ActionButton
            variant="secondary"
            onClick={() => onOpenReservation(item.reservation)}
            aria-label={`${item.reservation.customerName || item.reservation.title} rezervasyonunu incele`}
          >
            İncele
            <ChevronRight size={15} aria-hidden="true" />
          </ActionButton>
        )}
      </div>
    </li>
  );

  return (
    <div className="dashboard-page page-section">
      <section className="dashboard-briefing" aria-labelledby="dashboard-briefing-title">
        <div className="dashboard-day-card">
          <p className="dashboard-date"><Clock3 size={15} aria-hidden="true" />{formatLongTurkishDate(dashboard.today)}</p>
          <h2 id="dashboard-briefing-title">
            {attentionCount > 0 ? `${attentionCount} konu ilgi bekliyor.` : "Bugün için açık konu yok."}
          </h2>
          <p>{attentionCount > 0 ? "Öncelikli işleri tek sırada takip edin." : "Yeni bir iş geldiğinde burada öne çıkaracağız."}</p>
        </div>

        <div className="dashboard-attention-grid" aria-label="İlgi bekleyen konular">
          {requestsEnabled && <AttentionCard tone="info" icon={MessageCircle} value={waitingRequestCount} label="müşteri yanıt bekliyor" />}
          {tasksEnabled && <AttentionCard tone="wait" icon={ClipboardCheck} value={openTaskCount} label="açık iş bulunuyor" />}
          {reservationsEnabled && <AttentionCard tone="wait" icon={CalendarCheck2} value={pendingReservationCount} label="rezervasyon onay bekliyor" />}
          {customersEnabled && birthdayOverview.enabled && birthdayOverview.candidates.length > 0 && (
            <AttentionCard tone="info" icon={Cake} value={birthdayOverview.candidates.length} label="müşterinin doğum günü var" />
          )}
          {paymentWaitingCount > 0 && (
            <AttentionCard tone="wait" icon={ReceiptText} value={paymentWaitingCount} label="masa hesap bekliyor" />
          )}
          {stockAttentionCount > 0 && (
            <AttentionCard tone={operationalAttention.outOfStockItems > 0 ? "danger" : "wait"} icon={PackageMinus} value={stockAttentionCount} label="stok uyarısı var" />
          )}
        </div>
      </section>

      <SystemHealthPanel
        data={data}
        setup={setupData}
        syncStatus={automaticSyncStatus}
        features={features}
        aiEnabled={aiEnabled}
      />

      <section className="dashboard-workspace">
        <Panel className="dashboard-priority-panel" aria-labelledby="dashboard-priority-title">
          <div className="dashboard-section-heading page-toolbar">
            <div>
              <p>Öncelik sırası</p>
              <h2 id="dashboard-priority-title">Şimdi yapılacaklar</h2>
            </div>
            {requestsEnabled && (
              <ActionButton variant="ghost" size="sm" onClick={() => onOpenCustomerWork()}>
                Tüm talepler
                <ChevronRight size={15} aria-hidden="true" />
              </ActionButton>
            )}
          </div>

          {visiblePriorityItems.length === 0 ? (
            <div className="dashboard-clear-state">
              <CheckCircle2 size={30} aria-hidden="true" />
              <div><strong>Öncelikli bir iş görünmüyor.</strong><p>Etkin operasyonlardaki yeni işler burada sıralanacak.</p></div>
            </div>
          ) : (
            <ol className="dashboard-priority-list" id="dashboard-priority-list">
              {visiblePriorityItems.map(renderPriorityItem)}
            </ol>
          )}

        </Panel>

        {(operationalAttentionItems.length > 0 || calendarEnabled || capacityVisible || (customersEnabled && birthdayOverview.enabled && birthdayOverview.candidates.length > 0)) && <aside className="dashboard-side" aria-label="Takvim ve işletme durumu">
          {operationalAttentionItems.length > 0 && (
            <Panel className="dashboard-operational-attention-panel" padding="compact">
              <div className="dashboard-section-heading page-toolbar compact">
                <div>
                  <p>Dikkat gerektirenler</p>
                  <h2>Anlık durum</h2>
                </div>
                <AlertTriangle size={19} aria-hidden="true" />
              </div>
              <div className="dashboard-operational-attention-list">
                {operationalAttentionItems.map((item, index) => (
                  <article key={`${item.kind}:${item.title}:${index}`} className={`is-${item.kind}`}>
                    <span className="dashboard-operational-attention-icon" aria-hidden="true">
                      {item.kind === "payment_waiting" ? <ReceiptText size={16} /> : <PackageMinus size={16} />}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      {item.detail && <span>{item.detail}</span>}
                    </div>
                  </article>
                ))}
              </div>
            </Panel>
          )}

          {capacityVisible && <Panel className="dashboard-capacity-panel" padding="compact">
            <div className="dashboard-section-heading page-toolbar compact">
              <div>
                <p>{hasCapacityMetrics ? "Anlık durum" : "AI Yardımcı"}</p>
                <h2>{hasCapacityMetrics ? "İşletme kapasitesi" : "Günlük değerlendirme"}</h2>
              </div>
            </div>
            {hasCapacityMetrics && (
              <div className="dashboard-capacity-list">
                {features.rooms && (
                  <div><BedDouble size={17} aria-hidden="true" /><span><strong>{availableRoomCount}/{data.summary.totalRooms}</strong> oda uygun</span></div>
                )}
                {features.tables && (
                  <div><UtensilsCrossed size={17} aria-hidden="true" /><span><strong>{data.summary.availableTables}</strong> masa uygun</span></div>
                )}
                {features.whatsapp && customersEnabled && (
                  <div><MessageSquareText size={17} aria-hidden="true" /><span><strong>{data.summary.preparedWhatsAppMessages}</strong> hazır cevap</span></div>
                )}
              </div>
            )}
            {aiEnabled && (
              <>
                <ActionButton
                  className="dashboard-ai-command"
                  variant="secondary"
                  size="sm"
                  onClick={onGenerateDailyAi}
                  disabled={dailyAiState === "loading"}
                >
                  <Sparkles size={15} aria-hidden="true" />
                  {dailyAiState === "loading" ? "Değerlendiriliyor" : dailyAiContent ? "Yeniden değerlendir" : "Günü değerlendir"}
                </ActionButton>
                {(dailyAiMessage || dailyAiContent) && (
                  <div className="dashboard-ai-evaluation" aria-live="polite">
                    {dailyAiMessage && (
                      <p className={`dashboard-ai-evaluation-status is-${dailyAiState}`}>
                        {dailyAiFallback && dailyAiState === "success" ? "Yerel değerlendirme · " : ""}
                        {dailyAiMessage}
                      </p>
                    )}
                    {dailyAiContent && <div className="dashboard-ai-evaluation-content">{dailyAiContent}</div>}
                  </div>
                )}
              </>
            )}
          </Panel>}

          {customersEnabled && birthdayOverview.enabled && birthdayOverview.candidates.length > 0 && (
            <Panel className="dashboard-birthday-panel" padding="compact">
              <div className="dashboard-section-heading page-toolbar compact">
                <div>
                  <p>Doğum Günü Mesajları</p>
                  <h2>Bugün {birthdayOverview.candidates.length} müşteri</h2>
                </div>
                <Cake size={19} aria-hidden="true" />
              </div>
              {birthdayOverview.mode === "automatic" ? (
                <>
                  {birthdayOverview.sentCount > 0 && <p className="dashboard-birthday-summary">Bugün {birthdayOverview.sentCount} mesaj gönderildi.</p>}
                  {birthdayOverview.waitingCount > 0 && <p className="dashboard-birthday-summary">{birthdayOverview.waitingCount} mesaj bekliyor.</p>}
                  {birthdayOverview.failedCount > 0 && <p className="dashboard-birthday-summary is-unavailable">{birthdayOverview.failedCount} gönderim başarısız.</p>}
                  {birthdayOverview.sentCount === 0 && birthdayOverview.waitingCount === 0 && birthdayOverview.failedCount === 0 && <p className="dashboard-birthday-summary">Mesajlar seçtiğiniz saatten itibaren aynı gün otomatik gönderilir.</p>}
                </>
              ) : (
                <p className="dashboard-birthday-summary">Bugün doğum günü olan müşterileri kontrol edip WhatsApp mesajını hazırlayın.</p>
              )}
              {!features.whatsapp && <p className="dashboard-birthday-summary is-unavailable">WhatsApp etkin değil</p>}
              <ul className="dashboard-birthday-list">
                {birthdayOverview.candidates.slice(0, 6).map((candidate) => (
                  <li key={candidate.customerId}>
                    <div className="dashboard-birthday-customer">
                      <strong>{candidate.customerName || "Müşterimiz"}</strong>
                      <span>{candidate.phone || "Telefon yok"}</span>
                    </div>
                    <div className="dashboard-birthday-actions">
                      <StatusBadge tone={birthdayStatusTone(candidate.eligibility)}>{birthdayStatusLabel(candidate.eligibility)}</StatusBadge>
                      {features.whatsapp && birthdayOverview.mode === "manual" && (candidate.eligibility === "due" || candidate.eligibility === "prepared") && (
                        <ActionButton
                          variant="secondary"
                          size="sm"
                          onClick={() => onPrepareBirthday(candidate.customerId)}
                          disabled={birthdayPreparingId === candidate.customerId}
                        >
                          {birthdayPreparingId === candidate.customerId ? "Hazırlanıyor" : candidate.eligibility === "prepared" ? "Tekrar hazırla" : "WhatsApp’a Hazırla"}
                        </ActionButton>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {birthdayOverview.candidates.length > 6 && <p className="dashboard-side-note">{birthdayOverview.candidates.length - 6} müşteri daha var.</p>}
            </Panel>
          )}

          {calendarEnabled && <Panel className="dashboard-timeline-panel" padding="compact">
            <div className="dashboard-section-heading page-toolbar compact">
              <div>
                <p>Takvim</p>
                <h2>Sıradaki zamanlar</h2>
              </div>
              <StatusBadge tone={visibleScheduleItems.some((item) => item.kind !== "request" && item.urgency === "overdue") ? "danger" : "neutral"}>
                {dashboard.scheduleItems.length}
              </StatusBadge>
            </div>

            {visibleScheduleItems.length === 0 ? (
              <p className="dashboard-side-empty">{reservationsEnabled && tasksEnabled
                ? "Planlanmış açık iş veya rezervasyon yok."
                : reservationsEnabled ? "Planlanmış rezervasyon yok."
                  : tasksEnabled ? "Planlanmış açık iş yok." : "Takvimde gösterilecek kayıt yok."}</p>
            ) : (
              <ol className="dashboard-timeline-list">
                {visibleScheduleItems.map((item) => (
                  <li key={`schedule:${item.key}`}>
                    <span className={`dashboard-timeline-dot urgency-${item.kind === "request" ? "upcoming" : item.urgency}`} aria-hidden="true" />
                    <div>
                      <strong>{getPriorityTitle(item)}</strong>
                      <span>{getScheduleDate(item, dashboard.today)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>}
        </aside>}
      </section>
    </div>
  );
}

function AttentionCard({ tone, icon: Icon, value, label }: { tone: StatusTone; icon: typeof MessageCircle; value: number; label: string }) {
  return (
    <article className={`dashboard-attention-card tone-${tone}`}>
      <span className="dashboard-attention-icon" aria-hidden="true"><Icon size={19} /></span>
      <div><strong>{value}</strong><span>{label}</span></div>
    </article>
  );
}

function PriorityBadge({
  item,
  formatRequestStatus,
  getRequestStatusTone
}: {
  item: DashboardPriorityItem;
  formatRequestStatus: (value: string) => string;
  getRequestStatusTone: (status: string) => StatusTone;
}) {
  if (item.kind === "request") {
    return <StatusBadge tone={getRequestStatusTone(item.request.status)}>{formatRequestStatus(item.request.status)}</StatusBadge>;
  }

  if (item.kind === "reservation") {
    return <StatusBadge tone={item.urgency === "overdue" ? "danger" : "wait"}>{item.urgency === "overdue" ? "Tarihi geçti" : "Onay bekliyor"}</StatusBadge>;
  }

  const tone: StatusTone = item.urgency === "overdue" ? "danger" : item.urgency === "today" ? "wait" : "neutral";
  return <StatusBadge tone={tone}>{formatUrgency(item.urgency)}</StatusBadge>;
}

function getPriorityKicker(item: DashboardPriorityItem) {
  if (item.kind === "request") {
    return "Müşteri dönüşü";
  }
  return item.kind === "task" ? "Açık iş" : "Rezervasyon onayı";
}

function getPriorityTitle(item: DashboardPriorityItem) {
  if (item.kind === "request") {
    return item.request.customer_name;
  }
  if (item.kind === "task") {
    return item.task.title;
  }
  return item.reservation.customerName || item.reservation.title;
}

function getPriorityDescription(item: DashboardPriorityItem) {
  if (item.kind === "request") {
    return item.request.message;
  }
  if (item.kind === "task") {
    return item.task.description;
  }
  return item.reservation.notes;
}

function getPriorityMeta(
  item: DashboardPriorityItem,
  today: string,
  formatRequestType: (value: string) => string,
  formatTaskDue: (task: DesktopDashboardData["dailyTasks"][number]) => string,
  formatReservationDate: (reservation: DesktopDashboardData["reservations"][number]) => string
) {
  if (item.kind === "request") {
    const requestDate = item.request.date_text || formatDashboardDate(item.request.start_date, item.request.time, today);
    return [formatRequestType(item.request.request_type), requestDate, `${item.request.guest_count} kişi`].filter(Boolean).join(" · ");
  }
  if (item.kind === "task") {
    return item.task.dueDate ? formatDashboardDate(item.task.dueDate, item.task.dueTime, today) : formatTaskDue(item.task);
  }
  return item.reservation.startDate ? formatDashboardDate(item.reservation.startDate, item.reservation.time, today) : formatReservationDate(item.reservation);
}

function getScheduleDate(item: DashboardPriorityItem, today: string) {
  if (item.kind === "task") {
    return formatDashboardDate(item.task.dueDate, item.task.dueTime, today);
  }
  if (item.kind === "reservation") {
    if (item.reservation.status !== "pending" && item.reservation.startDate && item.reservation.startDate < today && (!item.reservation.endDate || item.reservation.endDate >= today)) {
      return ["Bugün devam ediyor", item.reservation.time].filter(Boolean).join(" · ");
    }
    return formatDashboardDate(item.reservation.startDate, item.reservation.time, today);
  }
  return "";
}

function formatUrgency(urgency: DashboardDateUrgency) {
  const labels: Record<DashboardDateUrgency, string> = {
    overdue: "Gecikti",
    today: "Bugün",
    upcoming: "Planlı",
    undated: "Tarih yok"
  };
  return labels[urgency];
}

function birthdayStatusLabel(status: string) {
  if (status === "already_sent") return "Bu yıl gönderildi";
  if (status === "prepared") return "Hazırlandı";
  if (status === "invalid_phone") return "Telefon geçersiz";
  if (status === "waiting") return "Bekliyor";
  if (status === "failed") return "Gönderim başarısız";
  return "Hazır";
}

function birthdayStatusTone(status: string): StatusTone {
  if (status === "already_sent") return "success";
  if (status === "prepared") return "info";
  if (status === "invalid_phone") return "danger";
  if (status === "failed") return "danger";
  if (status === "waiting") return "wait";
  return "wait";
}

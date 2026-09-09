import {
  BedDouble,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  MessageCircle,
  MessageSquareText,
  Sparkles,
  UtensilsCrossed
} from "lucide-react";
import type { DesktopDashboardData } from "../../electron/database";
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
  features: {
    rooms: boolean;
    tables: boolean;
    whatsapp: boolean;
    android: boolean;
  };
  aiEnabled: boolean;
  customersEnabled: boolean;
  tasksEnabled: boolean;
  calendarEnabled: boolean;
  reservationsEnabled: boolean;
  availableRoomCount: number;
  onReplyRequest: (request: DashboardRequest) => void;
  onOpenCustomerWork: (request?: DashboardRequest) => void;
  onOpenReservation: (reservation: DesktopDashboardData["reservations"][number]) => void;
  onCompleteTask: (taskId: string) => void;
  onOpenDailyAi: () => void;
  formatRequestType: (value: string) => string;
  formatRequestStatus: (value: string) => string;
  getRequestStatusTone: (status: string) => StatusTone;
  isRequestWaitingForReply: (status: string) => boolean;
  formatTaskDue: (task: DesktopDashboardData["dailyTasks"][number]) => string;
  formatReservationDate: (reservation: DesktopDashboardData["reservations"][number]) => string;
}

export function DashboardPage({
  data,
  features,
  aiEnabled,
  customersEnabled,
  tasksEnabled,
  calendarEnabled,
  reservationsEnabled,
  availableRoomCount,
  onReplyRequest,
  onOpenCustomerWork,
  onOpenReservation,
  onCompleteTask,
  onOpenDailyAi,
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
  const attentionCount = waitingRequestCount + openTaskCount + pendingReservationCount;
  const visiblePriorityItems = dashboard.priorityItems.slice(0, 6);
  const hiddenPriorityCount = Math.max(0, attentionCount - visiblePriorityItems.length);
  const visibleScheduleItems = dashboard.scheduleItems.slice(0, 4);
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
    <div className="dashboard-page">
      <section className="dashboard-briefing" aria-labelledby="dashboard-briefing-title">
        <div className="dashboard-day-card">
          <p className="dashboard-date"><Clock3 size={15} aria-hidden="true" />{formatLongTurkishDate(dashboard.today)}</p>
          <h2 id="dashboard-briefing-title">
            {attentionCount > 0 ? `${attentionCount} konu ilgi bekliyor.` : "Bugün için açık konu yok."}
          </h2>
          <p>{attentionCount > 0 ? "Öncelikli işleri tek sırada takip edin." : "Yeni bir iş geldiğinde burada öne çıkaracağız."}</p>
        </div>

        <div className="dashboard-attention-grid" aria-label="İlgi bekleyen konular">
          {customersEnabled && <AttentionCard tone="info" icon={MessageCircle} value={waitingRequestCount} label="müşteri yanıt bekliyor" />}
          {tasksEnabled && <AttentionCard tone="wait" icon={ClipboardCheck} value={openTaskCount} label="açık iş bulunuyor" />}
          {reservationsEnabled && <AttentionCard tone="wait" icon={CalendarCheck2} value={pendingReservationCount} label="rezervasyon onay bekliyor" />}
        </div>
      </section>

      <SystemHealthPanel data={data} features={features} aiEnabled={aiEnabled} />

      <section className="dashboard-workspace">
        <Panel className="dashboard-priority-panel" aria-labelledby="dashboard-priority-title">
          <div className="dashboard-section-heading">
            <div>
              <p>Öncelik sırası</p>
              <h2 id="dashboard-priority-title">Şimdi yapılacaklar</h2>
            </div>
            {customersEnabled && (
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

          {hiddenPriorityCount > 0 && (
            <p className="dashboard-list-footnote">En önemli 6 kayıt gösteriliyor. {hiddenPriorityCount} kayıt daha ilgili sayfalarda bekliyor.</p>
          )}
        </Panel>

        {(calendarEnabled || capacityVisible) && <aside className="dashboard-side" aria-label="Takvim ve işletme durumu">
          {calendarEnabled && <Panel className="dashboard-timeline-panel" padding="compact">
            <div className="dashboard-section-heading compact">
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

            {dashboard.scheduleItems.length > visibleScheduleItems.length && (
              <p className="dashboard-side-note">{dashboard.scheduleItems.length - visibleScheduleItems.length} planlı kayıt daha var.</p>
            )}
          </Panel>}

          {capacityVisible && <Panel className="dashboard-capacity-panel" padding="compact">
            <div className="dashboard-section-heading compact">
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
              <ActionButton className="dashboard-ai-command" variant="secondary" size="sm" onClick={onOpenDailyAi}>
                <Sparkles size={15} aria-hidden="true" />
                Günü değerlendir
              </ActionButton>
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

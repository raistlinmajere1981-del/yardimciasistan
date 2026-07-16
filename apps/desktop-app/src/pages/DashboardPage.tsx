import { CheckCircle2, MessageCircle, Phone, Sparkles } from "lucide-react";
import type { DesktopDashboardData } from "../../electron/database";
import { ActionButton } from "../components/ui/ActionButton";
import { CompactList } from "../components/ui/CompactList";
import { CompactListItem } from "../components/ui/CompactListItem";
import { MetricCard, type MetricCardProps } from "../components/ui/MetricCard";
import { Panel } from "../components/ui/Panel";
import { StatusBadge, type StatusTone } from "../components/ui/StatusBadge";

type DashboardRequest = DesktopDashboardData["requests"][number];

interface DashboardPageProps {
  data: DesktopDashboardData;
  metrics: MetricCardProps[];
  aiEnabled: boolean;
  onCallRequest: (request: DashboardRequest) => void;
  onOpenWhatsApp: (request: DashboardRequest) => void;
  onCompleteTask: (taskId: string) => void;
  onOpenDailyAi: () => void;
  formatRequestType: (value: string) => string;
  formatRequestStatus: (value: string) => string;
  getRequestStatusTone: (status: string) => StatusTone;
  isRequestWaitingForReply: (status: string) => boolean;
  formatTaskDue: (task: DesktopDashboardData["dailyTasks"][number]) => string;
  formatReservationDate: (reservation: DesktopDashboardData["reservations"][number]) => string;
  formatReservationStatus: (status: string) => string;
}

export function DashboardPage({
  data,
  metrics,
  aiEnabled,
  onCallRequest,
  onOpenWhatsApp,
  onCompleteTask,
  onOpenDailyAi,
  formatRequestType,
  formatRequestStatus,
  getRequestStatusTone,
  isRequestWaitingForReply,
  formatTaskDue,
  formatReservationDate,
  formatReservationStatus
}: DashboardPageProps) {
  const pendingTasks = data.dailyTasks.filter((task) => task.status === "pending");
  const waitingRequests = data.requests.filter((request) => isRequestWaitingForReply(request.status));
  const upcomingReservations = data.reservations.filter(
    (reservation) => !["rejected", "cancelled", "completed"].includes(reservation.status)
  );

  return (
    <div className="dashboard-page">
      <section className="metric-grid" aria-label="Günlük durum">
        {metrics.map((metric) => <MetricCard {...metric} key={metric.title} />)}
      </section>

      <section className="dashboard-grid">
        <Panel className="requests-panel" aria-labelledby="dashboard-requests-title">
          <div className="panel-heading">
            <div>
              <p>Son talepler</p>
              <h2 id="dashboard-requests-title">Müşteri talepleri</h2>
            </div>
            <StatusBadge tone="info">{data.requests.length} kayıt</StatusBadge>
          </div>

          <CompactList className="request-list">
            {data.requests.length === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={28} aria-hidden="true" />
                <strong>Henüz yeni talep yok.</strong>
                <p>Web sitesinden gelen talepler burada görünecek.</p>
              </div>
            ) : (
              data.requests.map((request) => (
                <CompactListItem
                  className="dashboard-request-row"
                  title={request.customer_name}
                  leading={(
                    <StatusBadge tone={getRequestStatusTone(request.status)}>
                      {formatRequestStatus(request.status)}
                    </StatusBadge>
                  )}
                  meta={(
                    <>
                      <span>{formatRequestType(request.request_type)}</span>
                      <span>{request.date_text || formatDateForDisplay(request.start_date) || "Tarih yok"}</span>
                      <span>{request.guest_count} kişi</span>
                    </>
                  )}
                  description={request.message || undefined}
                  actions={(
                    <>
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        onClick={() => onCallRequest(request)}
                        aria-label={`${request.customer_name} isimli müşteriyi ara`}
                      >
                        <Phone size={14} aria-hidden="true" />
                        Ara
                      </ActionButton>
                      <ActionButton
                        variant="whatsapp"
                        size="sm"
                        onClick={() => onOpenWhatsApp(request)}
                        aria-label={`${request.customer_name} için WhatsApp'ı aç`}
                      >
                        <MessageCircle size={14} aria-hidden="true" />
                        WhatsApp
                      </ActionButton>
                    </>
                  )}
                  key={request.id}
                />
              ))
            )}
          </CompactList>
        </Panel>

        <aside className="side-column dashboard-operations" aria-label="Günlük operasyon özeti">
          <Panel padding="compact">
            <div className="panel-heading compact">
              <div><p>Bugün</p><h2>Bugünkü işler</h2></div>
              <StatusBadge tone="wait">{pendingTasks.length} bekliyor</StatusBadge>
            </div>
            <CompactList className="dashboard-compact-list">
              {pendingTasks.slice(0, 2).map((task) => (
                <article key={task.id}>
                  <div><strong>{task.title}</strong><span>{formatTaskDue(task)}</span></div>
                  <ActionButton variant="ghost" size="sm" onClick={() => onCompleteTask(task.id)}>Tamamla</ActionButton>
                </article>
              ))}
              {pendingTasks.length === 0 && <p className="quiet-message">Bugün için bekleyen iş yok.</p>}
            </CompactList>
          </Panel>

          <Panel padding="compact">
            <div className="panel-heading compact">
              <div><p>Takip</p><h2>Cevap bekleyen müşteriler</h2></div>
              <StatusBadge tone={waitingRequests.length > 0 ? "wait" : "neutral"}>{waitingRequests.length}</StatusBadge>
            </div>
            <CompactList className="dashboard-compact-list">
              {waitingRequests.slice(0, 2).map((request) => (
                <article key={request.id}>
                  <div><strong>{request.customer_name}</strong><span>{formatRequestType(request.request_type)}</span></div>
                  <ActionButton variant="ghost" size="sm" onClick={() => onOpenWhatsApp(request)}>Yanıtla</ActionButton>
                </article>
              ))}
              {waitingRequests.length === 0 && <p className="quiet-message">Cevap bekleyen müşteri yok.</p>}
            </CompactList>
          </Panel>

          <Panel padding="compact">
            <div className="panel-heading compact">
              <div><p>Yaklaşan</p><h2>Rezervasyonlar</h2></div>
              <StatusBadge tone={upcomingReservations.length > 0 ? "info" : "neutral"}>{upcomingReservations.length}</StatusBadge>
            </div>
            <CompactList className="dashboard-compact-list">
              {upcomingReservations.slice(0, 2).map((reservation) => (
                <article key={reservation.id}>
                  <div><strong>{reservation.customerName || reservation.title}</strong><span>{formatReservationDate(reservation)}</span></div>
                  <StatusBadge tone={reservation.status === "pending" ? "wait" : "ok"}>
                    {formatReservationStatus(reservation.status)}
                  </StatusBadge>
                </article>
              ))}
              {upcomingReservations.length === 0 && <p className="quiet-message">Yaklaşan rezervasyon yok.</p>}
            </CompactList>
            {aiEnabled && (
              <ActionButton className="dashboard-ai-command" size="sm" onClick={onOpenDailyAi}>
                <Sparkles size={15} aria-hidden="true" />
                Bugünü Değerlendir
              </ActionButton>
            )}
          </Panel>
        </aside>
      </section>
    </div>
  );
}

function formatDateForDisplay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

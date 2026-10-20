import { DataTransferLauncher } from "../data-transfer/DataTransferOverlay";
import { usePageViewState, usePageViewScroll } from "../../app/page-view-state";
import { useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, CalendarClock, IdCard, Plus, Trash2, Users } from "lucide-react";
import type { DesktopCustomerMutationResult, DesktopDashboardData, DesktopIdentityImageAnalyzeResult, SaveCustomerInput } from "../../../electron/database";
import { formatCustomerLastContactDate } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListItem } from "../ui/DataList";
import { ChoiceChips } from "../ui/ChoiceChips";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";

type CustomerFilter = "all" | "dealers" | "staying" | "reserved" | "kbs_pending" | "kbs_failed";

interface CustomersWorkspaceProps {
  customers: DesktopDashboardData["customers"];
  stays: DesktopDashboardData["customerRoomStays"];
  reservations: DesktopDashboardData["reservations"];
  notifications: DesktopDashboardData["hospitalityNotifications"];
  kbsOverview: DesktopDashboardData["kbsOverview"];
  aiEnabled: boolean;
  wholesaleEnabled?: boolean;
  staysEnabled?: boolean;
  reservationsEnabled?: boolean;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File, isCurrent?: () => boolean) => Promise<DesktopIdentityImageAnalyzeResult>;
  onDelete: (customer: DesktopDashboardData["customers"][number]) => void | Promise<unknown>;
  onSendKbs: (notificationId: string, customerId: string) => void | Promise<unknown>;
}

export function CustomersWorkspace({
  customers,
  stays,
  reservations,
  notifications,
  kbsOverview,
  wholesaleEnabled = false,
  staysEnabled = false,
  reservationsEnabled = false,
  onDelete,
  onSendKbs
}: CustomersWorkspaceProps) {
  const navigation = useWorkspaceNavigation();
  const [searchText, setSearchText] = usePageViewState("customers.search", "");
  const [filter, setFilter] = usePageViewState<CustomerFilter>("customers.filter", "all");
  const paged = Boolean(window.yardimciDesktop?.listCustomers);
  const [pageData, setPageData] = useState<{items: typeof customers; total: number; matched: number; hasDealers?:boolean; context?:{stays:typeof stays; reservations:typeof reservations; notifications:typeof notifications}}>({items:[],total:0,matched:0});
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [pushedRevision, setPushedRevision] = useState(0);
  const lastReadQuery = useRef("");
  const [loading, setLoading] = useState(paged);
  const [loadError, setLoadError] = useState("");
  // The current page can contain customers beyond the dashboard's bounded projection.
  // Keep canonical invalidation reads, but perform them without resetting the visible list.
  useEffect(() => {
    if (!paged) return;
    return window.yardimciDesktop?.onDashboardDataChanged?.(() => setPushedRevision(value => value + 1));
  }, [paged]);
  useEffect(() => {
    if (!paged) return;
    let current = true;
    const query = JSON.stringify([searchText, filter, offset, revision]);
    if (lastReadQuery.current !== query) {
      setLoading(true); setLoadError("");
      lastReadQuery.current = query;
    }
    const timer = setTimeout(() => {
      void window.yardimciDesktop!.listCustomers({search:searchText,filter,limit:50,offset}).then(value=>{
        if(current) {
          setPageData(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
          setLoadError("");
          if(offset>=value.matched && offset>0) setOffset(0);
        }
      }).catch(error=>{if(current)setLoadError(error instanceof Error?error.message:"Müşteriler okunamadı.");}).finally(()=>{if(current)setLoading(false);});
    }, 150);
    return () => {current=false;clearTimeout(timer);};
  }, [customers, filter, offset, paged, pushedRevision, revision, searchText]);
  const listCustomers = paged ? pageData.items : customers;
  const hasDealerCustomers = wholesaleEnabled && (paged ? pageData.hasDealers !== false : customers.some(customer=>Boolean(customer.commercialProfile)));
  const hasStayCustomers = staysEnabled;
  const hasReservationCustomers = reservationsEnabled;

  const listStays=pageData.context?.stays ?? stays;
  const listReservations=pageData.context?.reservations ?? reservations;
  const listNotifications=pageData.context?.notifications ?? notifications;
  const rows = useMemo(() => listCustomers.map((customer) => {
    const customerStays = listStays.filter((stay) => stayHasCustomer(stay, customer.id));
    const activeStay = customerStays.find((stay) => stay.status === "checked_in");
    const plannedStay = customerStays.find((stay) => stay.status === "planned");
    const activeReservations = listReservations.filter((reservation) =>
      reservation.customerId === customer.id && ["pending", "approved"].includes(reservation.status)
    );
    const arrivalNotification = activeStay
      ? listNotifications.find((notification) =>
          notification.customerId === customer.id
          && notification.stayId === activeStay.id
          && notification.kind === "arrival"
        )
      : undefined;
    const kbsState = !kbsOverview.enabled || !activeStay
      ? "none"
      : arrivalNotification?.status === "sent"
        ? "sent"
        : arrivalNotification?.status === "failed"
          ? "failed"
          : "pending";
    const roomText = activeStay
      ? roomLabel(activeStay.roomNumber, activeStay.roomName)
      : plannedStay
        ? roomLabel(plannedStay.roomNumber, plannedStay.roomName) + " · planlı"
        : "";
    const haystack = [
      customer.fullName,
      customer.phone,
      customer.email,
      customer.identityNumber,
      customer.notes,
      ...(wholesaleEnabled && customer.commercialProfile ? [
        customer.commercialProfile.companyName,
        customer.commercialProfile.taxOffice,
        customer.commercialProfile.taxNumber,
        customer.commercialProfile.authorizedPerson
      ] : []),
      ...customerStays.map((stay) => stay.roomName + " " + stay.roomNumber)
    ].join(" ").toLocaleLowerCase("tr-TR");
    return { customer, activeStay, plannedStay, activeReservations, arrivalNotification, kbsState, roomText, haystack };
  }).filter((row) => {
    if (paged) return true;
    const searchOk = row.haystack.includes(searchText.trim().toLocaleLowerCase("tr-TR"));
    if (!searchOk) return false;
    if (filter === "dealers") return Boolean(row.customer.commercialProfile);
    if (filter === "staying") return Boolean(row.activeStay);
    if (filter === "reserved") return row.activeReservations.length > 0 || Boolean(row.plannedStay);
    if (filter === "kbs_pending") return row.kbsState === "pending";
    if (filter === "kbs_failed") return row.kbsState === "failed";
    return true;
  }), [listCustomers, paged, filter, kbsOverview.enabled, listNotifications, listReservations, searchText, listStays, wholesaleEnabled]);

  useEffect(() => {
    if (filter === "dealers" && !hasDealerCustomers) setFilter("all");
    if (filter === "staying" && !hasStayCustomers) setFilter("all");
    if (filter === "reserved" && !hasReservationCustomers) setFilter("all");
    if ((filter === "kbs_pending" || filter === "kbs_failed") && !kbsOverview.enabled) setFilter("all");
  }, [filter, hasDealerCustomers, hasReservationCustomers, hasStayCustomers, kbsOverview.enabled, setFilter]);

  const pageScroll = usePageViewScroll(`customers.scroll`, rows.length);
  return <section className="panel customers-workspace" aria-label="Müşteri yönetimi">
    <div className="card__header">
      <div><p>Müşteriler</p><h2>{paged ? `${offset + rows.length} / ${pageData.matched} kayıt${pageData.matched !== pageData.total ? ` · toplam ${pageData.total}` : ""}` : `${rows.length} / ${customers.length} kayıt`}</h2></div>
      <div className="data-transfer-launch-actions"><ActionButton size="sm" type="button" onClick={() => navigation.openWorkspace({ entityType: "customer", entityId: "new-customer", mode: "create", returnContext: { page: "customerWork" } }, { onReturn: () => setRevision(value => value + 1) })}><Plus size={15} aria-hidden="true" />Yeni Müşteri</ActionButton><DataTransferLauncher entity="customers" search={searchText} customerFilter={filter} onChanged={() => {setRevision(value=>value+1);}} /></div>
    </div>

    <div className="customer-list-controls">
      <label className="customer-search form-field form-field--medium">
        <span>Ara</span>
        <input
          value={searchText}
          onChange={(event) => {setSearchText(event.target.value);setOffset(0);}}
          placeholder={wholesaleEnabled
            ? "Ad, telefon, firma, vergi no veya not"
            : hasStayCustomers
              ? "Ad, telefon, kimlik, not veya oda"
              : "Ad, telefon, kimlik veya not"}
        />
      </label>
      <ChoiceChips
        className="customer-filter-row"
        ariaLabel="Müşteri filtresi"
        value={filter}
        onChange={value=>{setFilter(value);setOffset(0);}}
        options={[
          { id: "all", label: "Tümü" },
          ...(hasDealerCustomers ? [{ id: "dealers" as const, label: "Bayiler" }] : []),
          ...(hasStayCustomers ? [{ id: "staying" as const, label: "Konaklayanlar" }] : []),
          ...(hasReservationCustomers ? [{ id: "reserved" as const, label: "Rezervasyonu Olanlar" }] : []),
          ...(kbsOverview.enabled
            ? [
                { id: "kbs_pending" as const, label: "Bildirim Bekleyen" },
                { id: "kbs_failed" as const, label: "Bildirim Hatalı" }
              ]
            : [])
        ]}
      />
    </div>

    {loadError && <p role="alert">{loadError}</p>}
    <DataList aria-busy={loading} ref={pageScroll} className="customers-workspace__items">
      {rows.length === 0 ? !loading && !loadError && <div className="empty-state"><Users size={24} aria-hidden="true" /><strong>Müşteri bulunamadı.</strong><p>Arama veya filtreyi değiştirin.</p></div> : rows.map((row) => {
        const customer = row.customer;
        const activityDate = customer.lastContactAt || customer.updatedAt;
        const openCustomer = () => navigation.openWorkspace({
          entityType: "customer",
          entityId: customer.id,
          mode: "main",
          returnContext: { page: "customerWork", entityId: customer.id }
        });
        return <DataListItem
          className="customer-record-row interactive-surface"
          key={customer.id}
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("button, a, input, select, textarea, [role=button]")) return;
            openCustomer();
          }}
          leading={<span className={"status-dot " + (row.activeStay ? "tone-success" : row.activeReservations.length > 0 ? "tone-warning" : "tone-neutral")} aria-hidden="true" />}
          title={<button className="customer-record-row__open" type="button" onClick={openCustomer}>{customer.fullName}</button>}
          meta={<>
            <span className="customer-record-row__phone">{customer.phone || "Telefon yok"}</span>
            {row.roomText && <span><BedDouble size={14} aria-hidden="true" />{row.roomText}</span>}
            {row.activeReservations.length > 0 && <span><CalendarClock size={14} aria-hidden="true" />{row.activeReservations.length} aktif rezervasyon</span>}
            {wholesaleEnabled && customer.commercialProfile && <>
              <span>{customer.commercialProfile.companyName}</span>
              <StatusBadge tone={dealerTone(customer.commercialProfile.dealerStatus)}>
                {dealerLabel(customer.commercialProfile.dealerStatus)}
              </StatusBadge>
            </>}
            {kbsOverview.enabled && row.activeStay && <StatusBadge tone={kbsTone(row.kbsState)}>{kbsLabel(row.kbsState)}</StatusBadge>}
          </>}
          actions={<>
            {activityDate && (
              <span className="customer-record-row__date">
                <small>{customer.lastContactAt ? "Son temas" : "Son güncelleme"}</small>
                <time dateTime={activityDate}>{formatCustomerLastContactDate(activityDate)}</time>
              </span>
            )}
            {kbsOverview.enabled && row.activeStay && row.kbsState !== "sent" && row.arrivalNotification && (
              <ActionButton
                variant="secondary"
                size="sm"
                type="button"
                disabled={!kbsOverview.configured || !row.arrivalNotification.identityReady}
                onClick={() => { void onSendKbs(row.arrivalNotification!.id, customer.id); }}
              >
                <IdCard size={15} aria-hidden="true" />
                {!kbsOverview.configured
                  ? "KBS Ayarları Eksik"
                  : row.arrivalNotification.identityReady
                    ? "Kimlik Bildir"
                    : "Kimlik Eksik"}
              </ActionButton>
            )}
            <ActionButton variant="danger" size="sm" type="button" onClick={() => { void onDelete(customer); }}>
              <Trash2 size={15} aria-hidden="true" />Sil
            </ActionButton>
          </>}
        />;
      })}
    </DataList>

    {paged && <div className="data-transfer-overlay__actions">
      <ActionButton variant="secondary" disabled={loading || offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Önceki müşteriler</ActionButton>
      <span>{pageData.matched ? offset+1 : 0}–{offset+rows.length} / {pageData.matched}</span>
      <ActionButton variant="secondary" disabled={loading || offset+50>=pageData.matched} onClick={()=>setOffset(offset+50)}>Sonraki müşteriler</ActionButton>
    </div>}

  </section>;
}

function stayHasCustomer(stay: DesktopDashboardData["customerRoomStays"][number], customerId: string) {
  return stay.customerId === customerId || stay.guests.some((guest) => guest.customerId === customerId);
}

function roomLabel(number: string, name: string) {
  return number ? "Oda " + number : name || "Oda";
}

function kbsLabel(state: string) {
  if (state === "sent") return "KBS bildirildi";
  if (state === "failed") return "KBS hata";
  return "KBS bekliyor";
}

function kbsTone(state: string): StatusTone {
  if (state === "sent") return "success";
  if (state === "failed") return "danger";
  return "warning";
}


function dealerLabel(status: string) {
  if (status === "active") return "Aktif bayi";
  if (status === "inactive") return "Pasif bayi";
  return "Pasif bayi";
}

function dealerTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "inactive") return "neutral";
  return "warning";
}

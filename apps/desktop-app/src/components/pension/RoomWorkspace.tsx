import { useEffect, useRef, useState } from "react";
import { projectRoomState } from "@yardimci-asistan/shared";
import type { DesktopDashboardData, DesktopStatusUpdateResult } from "../../../electron/database";
import { defaultRoomAssignmentForm, formatCustomerRoomStayStatus, formatStayDateRange } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { WorkspaceTabs, WorkspaceTabList, WorkspaceTabPanel } from "../workspace/WorkspaceTabs";
import type { RoomWorkspaceIntent as WorkspaceIntent } from "../workspace/workspace-intent";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { ReservationRoomAssignment, assignReservationRoom } from "./ReservationRoomAssignment";
import { RoomAccount, RoomAccountOperation, accountFlowTitle, type AccountOperation } from "./RoomAccount";
import { useRoomFolioController } from "./use-room-folio-controller";
import { minorMoney, formatDateRange } from "./folio-format";
import { roomConditionLabel, roomToday } from "./room-presentation";

type Tab = NonNullable<WorkspaceIntent["mode"]>;
type StayFlow = { kind: "assignment" | "create-stay" | "linked-stay" | "room-status" }
  | { kind: "check-in" | "checkout" | "cancel-stay" | "replan-stay"; stayId: string };
type Flow = StayFlow | AccountOperation | null;
const accountKinds = new Set(["add-charge", "add-menu-item", "payment", "void-payment", "account-details", "close-account"]);
const flowTitles = { assignment: "Rezervasyon Ata", "create-stay": "Manuel Konaklama Oluştur", "linked-stay": "Rezervasyondan Konaklama Oluştur",
  "room-status": "Oda Durumunu Değiştir", "check-in": "Giriş Yap", checkout: "Misafir Çıkışı", "cancel-stay": "Konaklamayı İptal Et", "replan-stay": "Konaklamayı Yeniden Planla", ...accountFlowTitle };

export interface RoomWorkspaceProps {
  intent: WorkspaceIntent; data: DesktopDashboardData; onDashboard: (data: DesktopDashboardData) => void;
  staysEnabled: boolean; reservationsEnabled: boolean; folioEnabled: boolean; menuEnabled: boolean;
}

export function RoomWorkspace({ intent, data, onDashboard, staysEnabled, reservationsEnabled, folioEnabled, menuEnabled }: RoomWorkspaceProps) {
  const navigation = useWorkspaceNavigation();
  const [tab, setTab] = useState<Tab>(intent.mode === "account" && !folioEnabled ? "summary" : intent.mode ?? "summary");
  const [flow, setFlow] = useState<Flow>(() => intent.action === "create-stay" && staysEnabled ? { kind: "create-stay" }
    : intent.action === "assign-reservation" && reservationsEnabled ? { kind: "assignment" }
      : intent.action === "payment" && folioEnabled ? { kind: "payment" } : null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [reservationId, setReservationId] = useState("");
  const [roomStatus, setRoomStatus] = useState("available");
  const [draft, setDraft] = useState(() => defaultRoomAssignmentForm(intent.customerId ?? "", intent.entityId));
  const begin = useRequestGeneration();
  const mutationRunning = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const room = data.rooms.find(item => item.id === intent.entityId);
  const roomStays = data.customerRoomStays.filter(stay => stay.roomId === intent.entityId);
  const refreshKey = roomStays.map(stay => `${stay.id}:${stay.status}:${stay.updatedAt}`).join("|") + room?.updatedAt;
  const account = useRoomFolioController(intent.entityId, folioEnabled, refreshKey);
  const blocked = useWorkspaceCloseGuard({ busy: busy || account.busy, dirty });
  const tabs: { id: Tab; label: string }[] = [{ id: "summary", label: "Özet" }, { id: "stay", label: "Konaklama" },
    ...(folioEnabled ? [{ id: "account" as const, label: "Hesap" }] : []), { id: "history", label: "Geçmiş" }];
  useEffect(() => { if (flow) titleRef.current?.focus(); }, [flow]);

  function start(next: NonNullable<Flow>) {
    if (busy || account.busy || dirty) return;
    setMessage(""); setError(false); setFlow(next);
    if (next.kind === "create-stay") setDraft(defaultRoomAssignmentForm(intent.customerId ?? "", intent.entityId));
    if (next.kind === "assignment" || next.kind === "linked-stay") setReservationId("");
    if (next.kind === "room-status") setRoomStatus(room?.status === "cleaning" ? "available" : room?.status ?? "available");
  }
  function finish() {
    setDirty(false); setFlow(null);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('dialog[open] [role="tab"][aria-selected="true"]')?.focus());
  }
  async function mutate(operation: () => Promise<DesktopStatusUpdateResult>, after?: () => Promise<string | undefined>) {
    if (mutationRunning.current) return;
    mutationRunning.current = true;
    const current = begin();
    setBusy(true); setError(false); setMessage("");
    try {
      const result = await operation();
      if (!current()) return;
      if (!result.ok) { setError(true); setMessage(result.message); return; }
      onDashboard(result.dashboardData);
      const detail = await after?.();
      if (!current()) return;
      setMessage(detail || result.message);
      finish();
    } catch {
      if (current()) { setError(true); setMessage("İşlem sonucu doğrulanamadı. Yenilemeden yeniden göndermeyin."); }
    } finally { mutationRunning.current = false; if (current()) setBusy(false); }
  }
  if (!room) return <WorkspaceFrame title="Oda kullanılamıyor" presentation={navigation.current!.presentation} onClose={() => navigation.closeWorkspace()}
    returnFocusRef={navigation.returnFocusRef}><p>Oda kaydı bulunamadı veya bu yetenek kullanılamıyor.</p></WorkspaceFrame>;
  const state = projectRoomState(room, roomStays, data.reservations, roomToday());
  const currentStay = roomStays.find(stay => stay.status === "checked_in") ?? roomStays.find(stay => stay.status === "planned");
  const plannedReservations = data.reservations.filter(item => state.planning.reservationIds.includes(item.id));
  const selectedStay = roomStays.find(stay => stay.id === account.selected?.stayId);
  const departed = selectedStay?.status === "checked_out";
  const roomPrice = account.data.rooms.find(item => item.id === room.id);
  const bridge = window.yardimciDesktop!;
  const eligibleReservations = data.reservations.filter(item => item.reservationType === "room" && item.status === "approved" && item.roomIds.includes(room.id));
  const task = data.dailyTasks.find(item => item.relatedType === "room" && item.relatedId === room.id && item.status === "pending");
  const stayForFlow = flow && "stayId" in flow ? roomStays.find(stay => stay.id === flow.stayId) : undefined;
  async function submitStayFlow() {
    if (!flow) return;
    if (flow.kind === "assignment") {
      const reservation = data.reservations.find(item => item.id === reservationId);
      if (reservation) await mutate(() => assignReservationRoom(reservation, room!.id));
    } else if (flow.kind === "linked-stay") {
      await mutate(() => bridge.createStayFromReservation({ reservationId, roomId: room!.id }));
    } else if (flow.kind === "create-stay") {
      await mutate(() => bridge.assignCustomerRoom({ ...draft, roomId: room!.id, guestCount: Number(draft.guestCount), status: "planned" }));
    } else if (flow.kind === "room-status") {
      await mutate(() => bridge.updateRoomStatus({ roomId: room!.id, status: roomStatus }));
    } else if (flow.kind === "check-in") {
      const stayId = flow.stayId;
      await mutate(() => bridge.checkInStay(stayId), async () => {
        if (!folioEnabled) return "Misafir girişi tamamlandı.";
        const financial = await account.mutate(() => bridge.openRoomFolio(stayId));
        return financial?.ok ? "Misafir girişi tamamlandı · Oda hesabı açıldı."
          : "Misafir girişi tamamlandı; hesap açılamadı. Konaklama sekmesinden Hesabı Aç ile yeniden deneyin.";
      });
    } else if (flow.kind === "checkout") {
      const stayId = flow.stayId;
      await mutate(() => bridge.checkoutStay(stayId), async () => {
        if (!folioEnabled) return "Misafir çıkışı tamamlandı. Odanın fiziksel durumunu kontrol edip temizlik tamamlandığında Hazır olarak işaretleyin.";
        try {
          const snapshot = await bridge.getRoomFolioData();
          account.applySnapshot(snapshot);
          const debt = snapshot.folios.find(item => item.stayId === stayId)?.remainingMinor ?? 0;
          return debt > 0 ? `Çıkış tamamlandı · ${minorMoney(debt)} açık hesap. Odanın temizlik durumunu kontrol edin.`
            : "Misafir çıkışı tamamlandı. Odanın fiziksel durumunu kontrol edip temizlik tamamlandığında Hazır olarak işaretleyin.";
        } catch {
          void account.refresh();
          return "Misafir çıkışı tamamlandı. Oda hesap durumu doğrulanamadı; Hesap sekmesinden Yenile ile kontrol edin.";
        }
      });
    } else if (flow.kind === "cancel-stay" || flow.kind === "replan-stay") {
      await mutate(() => bridge.updateCustomerRoomStayStatus({ stayId: flow.stayId, status: flow.kind === "cancel-stay" ? "cancelled" : "planned" }));
    }
  }
  return <WorkspaceTabs value={tab}>
    <WorkspaceFrame title={room.number ? `Oda ${room.number} · ${room.name}` : room.name}
      context={<div className="room-workspace-context">
        <span>Fiziksel durum: {roomConditionLabel[state.operationalCondition]}{!room.isActive && " · Etkin değil"}</span>
        <span>Doluluk: {state.occupancy.status === "occupied" ? "Misafir içeride" : "Boş"}</span>
        <span>Planlama: {state.planning.reservationIds.length} rezervasyon · {state.planning.plannedStayIds.length} konaklama</span>
        {currentStay && <span>{currentStay.customerName} · {formatStayDateRange(currentStay)}</span>}
      </div>}
      actions={!flow && <>
        {state.operationalCondition === "cleaning" ? <ActionButton disabled={busy || account.busy} onClick={() => start({ kind: "room-status" })}>Temizliği Tamamla</ActionButton>
          : staysEnabled && currentStay?.status === "checked_in" ? <ActionButton disabled={busy || account.busy} onClick={() => start({ kind: "checkout", stayId: currentStay.id })}>Misafir Çıkışı</ActionButton>
            : staysEnabled && currentStay?.status === "planned" ? <ActionButton disabled={busy || account.busy} onClick={() => start({ kind: "check-in", stayId: currentStay.id })}>Giriş Yap</ActionButton> : null}
      </>}
      presentation={navigation.current!.presentation} onPresentationChange={navigation.updateWorkspacePresentation}
      onClose={() => navigation.closeWorkspace()} closeBlocked={blocked} returnFocusRef={navigation.returnFocusRef}
      navigation={<WorkspaceTabList tabs={tabs} label="Oda çalışma alanı" onChange={value => {
        if (flow || busy || account.busy) { setMessage("Önce açık işlemi tamamlayın veya Vazgeç ile geri dönün."); return; }
        setTab(value); navigation.updateWorkspaceMode({ entityType: "room", mode: value });
      }} />}
      footer={flow && <div className="action-row"><ActionButton variant="secondary" disabled={busy || account.busy} onClick={finish}>{dirty ? "Değişiklikleri Bırak" : "Vazgeç"}</ActionButton>
        <span role="status">{busy || account.busy ? "İşlem sürüyor…" : dirty ? "Kaydedilmemiş değişiklikler var." : "İşlem bu çalışma alanında tamamlanır."}</span></div>}>
      {message && <p role={error ? "alert" : "status"}>{message}</p>}
      {folioEnabled && account.message && <p role={account.error ? "alert" : "status"}>{account.message}</p>}
      {folioEnabled && account.error && <ActionButton variant="secondary" disabled={busy || account.busy} onClick={() => void account.refresh()}>Hesabı Yenile</ActionButton>}
      {flow ? <section className="form-stack" aria-label={flowTitles[flow.kind]} onChange={() => setDirty(true)}>
        <h3 ref={titleRef} tabIndex={-1}>{flowTitles[flow.kind]}</h3>
        {accountKinds.has(flow.kind) ? account.selected
          ? <RoomAccountOperation operation={flow as AccountOperation} folio={account.selected} controller={account} onDone={() => { setTab("account"); finish(); }} />
          : <p>{account.loading ? "Hesap hazırlanıyor…" : "Bu oda için açık hesap bulunamadı."}</p>
          : <form className="form-stack" onSubmit={event => { event.preventDefault(); void submitStayFlow(); }}>
            <fieldset className="form-stack" disabled={busy || account.busy}>
              {flow.kind === "assignment" && <ReservationRoomAssignment reservations={data.reservations} rooms={data.rooms} fixed="room"
                reservationId={reservationId} roomId={room.id} onChange={value => setReservationId(value)} />}
              {flow.kind === "linked-stay" && <><p>Onaylı rezervasyondaki müşteri, tarihler ve rezervasyon bağlantısı korunur. Oda ataması değişmez.</p>
                <label className="form-field form-field--long">Rezervasyon<select aria-label="Rezervasyon" required value={reservationId} onChange={event => setReservationId(event.target.value)}><option value="">Rezervasyon seçin</option>
                  {eligibleReservations.map(item => <option key={item.id} value={item.id}>{item.title || item.customerName} · {item.startDate} – {item.endDate}</option>)}
                </select></label></>}
              {flow.kind === "create-stay" && <>
                <p>Rezervasyondan bağımsız, planlı bir konaklama oluşturulur. Misafir girişi ayrı işlemdir.</p>
                <label className="form-field form-field--long">Müşteri<select aria-label="Müşteri" required value={draft.customerId} disabled={Boolean(intent.customerId)} onChange={event => setDraft({ ...draft, customerId: event.target.value })}>
                  <option value="">Müşteri seçin</option>{data.customers.map(item => <option value={item.id} key={item.id}>{item.fullName}</option>)}
                </select></label>
                <div className="form-row">
                  <label className="form-field form-field--short">Giriş tarihi<input lang="tr-TR" required type="date" value={draft.checkInDate} onChange={event => setDraft({ ...draft, checkInDate: event.target.value })} /></label>
                  <label className="form-field form-field--short">Çıkış tarihi<input lang="tr-TR" type="date" min={draft.checkInDate} value={draft.checkOutDate} onChange={event => setDraft({ ...draft, checkOutDate: event.target.value })} /></label>
                  <label className="form-field form-field--xs">Kişi sayısı<input required type="number" min={1} max={50} value={draft.guestCount} onChange={event => setDraft({ ...draft, guestCount: event.target.value })} /></label>
                </div>
                <label className="form-field form-field--fluid">Konaklama notu<textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
              </>}
              {flow.kind === "room-status" && <>
                <p>Hazır durumu, fiziksel temizlik ve hazırlığın tamamlandığını belirtir. Hesap tahsilatı bu durumu değiştirmez.</p>
                <label className="form-field form-field--medium">Fiziksel oda durumu<select aria-label="Fiziksel oda durumu" value={roomStatus} onChange={event => setRoomStatus(event.target.value)}>
                  {!["available", "cleaning", "maintenance", "out_of_service"].includes(roomStatus) && <option value={roomStatus}>Mevcut durum</option>}
                  <option value="available">Hazır</option><option value="cleaning">Temizlik bekliyor</option><option value="maintenance">Bakımda</option><option value="out_of_service">Hizmet dışı</option>
                </select></label>
              </>}
              {flow.kind === "check-in" && <p>{stayForFlow?.customerName} için giriş kaydedilecek.{folioEnabled && " Ardından oda hesabı açılacak."}</p>}
              {flow.kind === "checkout" && <p>{stayForFlow?.customerName} için misafir çıkışı tamamlanacak. Oda temizlik durumuna geçer; başka aktif konaklama varsa onun durumu korunur. Borç varsa hesap açık kalır.</p>}
              {flow.kind === "replan-stay" && <p>Konaklama yeniden planlanacak. Kapasite ve tarih çakışmaları kontrol edilecek.</p>}
              {flow.kind === "cancel-stay" && <p>Konaklama iptal edilecek. Rezervasyon değişmeyecek. Fiziksel çıkış, Misafir Çıkışı işlemiyle kaydedilir.</p>}
              <ActionButton type="submit">{flow.kind === "checkout" ? "Çıkışı Tamamla" : flow.kind === "check-in" ? "Girişi Tamamla" : flow.kind === "room-status" && room.status === "cleaning" && roomStatus === "available" ? "Temizliği Tamamla" : "Kaydet"}</ActionButton>
            </fieldset>
          </form>}
      </section> : null}
      <div hidden={Boolean(flow)}>
        <WorkspaceTabPanel value="summary"><div className="form-stack">
          <h3>Oda profili</h3><p>{room.capacity} kişi · {room.bedInfo || "Yatak bilgisi yok"} · {room.floor || "Kat bilgisi yok"}</p>
          <p>{room.description || room.features.join(", ") || "Ek oda bilgisi yok."}</p>
          {folioEnabled && roomPrice && <p>Varsayılan gecelik fiyat: {minorMoney(roomPrice.nightlyPriceMinor)}</p>}
          <p>Oda profili ve varsayılan fiyat Ayarlar → Oda Yönetimi bölümünden düzenlenir.</p>
          {plannedReservations.map(item => <p key={item.id}>Rezervasyon: {item.title || item.customerName} · {formatDateRange(item.startDate, item.endDate)}</p>)}
          {currentStay?.notes && <p>Konaklama notu: {currentStay.notes}</p>}
          {task && <p>Güncel iş: {task.title}</p>}
          {folioEnabled && account.selected && <p>Hesap: {account.selected.status === "open" ? "Açık" : "Kapalı"} · {minorMoney(account.selected.remainingMinor)} kalan</p>}
          <ActionButton variant="secondary" onClick={() => setTab("stay")}>Konaklama İşlemlerine Git</ActionButton>
        </div></WorkspaceTabPanel>
        <WorkspaceTabPanel value="stay"><div className="form-stack">
          <div className="action-row">
            {reservationsEnabled && <ActionButton variant="secondary" onClick={() => start({ kind: "assignment" })}>Rezervasyon Ata</ActionButton>}
            {staysEnabled && <ActionButton onClick={() => start({ kind: "create-stay" })}>Manuel Konaklama Oluştur</ActionButton>}
            {staysEnabled && reservationsEnabled && <ActionButton variant="secondary" onClick={() => start({ kind: "linked-stay" })}>Rezervasyondan Konaklama Oluştur</ActionButton>}
            <ActionButton variant="secondary" onClick={() => start({ kind: "room-status" })}>Oda Durumunu Değiştir</ActionButton>
          </div>
          {roomStays.filter(stay => ["planned", "checked_in"].includes(stay.status)).map(stay => <article className="room-stay-record" key={stay.id}>
            <h3>{stay.customerName}</h3><p>{formatCustomerRoomStayStatus(stay.status)} · {formatStayDateRange(stay)} · {stay.guestCount} kişi</p>
            <p>{stay.reservationId ? `Rezervasyon: ${data.reservations.find(item => item.id === stay.reservationId)?.title || "Bağlantılı kayıt"}` : "Manuel konaklama · Rezervasyondan bağımsız"}</p>
            {staysEnabled && <div className="action-row">
              {stay.status === "planned" && <><ActionButton onClick={() => start({ kind: "check-in", stayId: stay.id })}>Giriş Yap</ActionButton><ActionButton variant="danger" onClick={() => start({ kind: "cancel-stay", stayId: stay.id })}>Planı İptal Et</ActionButton></>}
              {stay.status === "checked_in" && <><ActionButton onClick={() => start({ kind: "checkout", stayId: stay.id })}>Misafir Çıkışı</ActionButton><ActionButton variant="danger" onClick={() => start({ kind: "cancel-stay", stayId: stay.id })}>Konaklamayı İptal Et</ActionButton></>}
              {folioEnabled && stay.status === "checked_in" && !account.folios.some(item => item.stayId === stay.id) && <ActionButton disabled={account.loading || account.busy} variant="secondary" onClick={() => void account.mutate(() => bridge.openRoomFolio(stay.id))}>Hesabı Aç</ActionButton>}
            </div>}
          </article>)}
          {departed && <p>Misafir çıkışı tamamlandı · {account.selected!.remainingMinor > 0 ? `${minorMoney(account.selected!.remainingMinor)} açık hesap` : "Hesap borcu yok"}. Fiziksel durum: {roomConditionLabel[state.operationalCondition]}.</p>}
          {roomStays.length === 0 && <p>Konaklama kaydı yok.</p>}
        </div></WorkspaceTabPanel>
        {folioEnabled && <WorkspaceTabPanel value="account"><RoomAccount controller={account} menuEnabled={menuEnabled} departed={departed} onAction={start} /></WorkspaceTabPanel>}
        <WorkspaceTabPanel value="history"><div className="form-stack"><h3>Yakın dönem kayıtları</h3>
          <p>Yakın dönem konaklamalar ve mevcut hesaplar gösterilir; tam geçmiş değildir.</p>
          {roomStays.map(stay => <article key={stay.id}><strong>{stay.customerName}</strong><p>{formatCustomerRoomStayStatus(stay.status)} · {formatStayDateRange(stay)}</p>{staysEnabled && stay.status === "cancelled" && <ActionButton variant="secondary" onClick={() => start({ kind: "replan-stay", stayId: stay.id })}>Yeniden Planla</ActionButton>}</article>)}
          {folioEnabled && account.folios.map(folio => <article key={folio.id}><strong>{folio.customerName} · {folio.status === "open" ? "Açık hesap" : "Kapalı hesap"}</strong><p>{formatDateRange(folio.checkInDate, folio.plannedCheckOutDate)} · {minorMoney(folio.remainingMinor)} kalan</p>
            <ActionButton variant="secondary" onClick={() => { account.select(folio.id); setTab("account"); }}>Hesabı Gör</ActionButton></article>)}
        </div></WorkspaceTabPanel>
      </div>
    </WorkspaceFrame>
  </WorkspaceTabs>;
}

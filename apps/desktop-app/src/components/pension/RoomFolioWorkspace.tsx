import { useEffect, useMemo, useState } from "react";
import { Banknote, BedDouble, CalendarDays, CheckCircle2, Minus, Plus, ReceiptText, Trash2, Users, X } from "lucide-react";
import type {
  DesktopRoomFolio,
  DesktopRoomFolioData,
  DesktopRoomFolioItem,
  DesktopRoomFolioMutationResult,
  DesktopRoomFolioStay,
  RoomFolioPaymentMethod
} from "../../../electron/room-folio";
import { MetricCard } from "../ui/MetricCard";
import { Panel } from "../ui/Panel";

const EMPTY_DATA: DesktopRoomFolioData = {
  generatedAt: "",
  rooms: [],
  activeStays: [],
  folios: [],
  menuCategories: [],
  menuItems: []
};

interface RoomFolioWorkspaceProps {
  refreshKey: string;
  menuEnabled: boolean;
}

type ConfirmationAction =
  | { kind: "checkout" }
  | { kind: "void-payment"; paymentId: string; amountMinor: number }
  | null;

export function RoomFolioWorkspace({ refreshKey, menuEnabled }: RoomFolioWorkspaceProps) {
  const [data, setData] = useState<DesktopRoomFolioData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFolioId, setSelectedFolioId] = useState("");
  const [roomPriceDrafts, setRoomPriceDrafts] = useState<Record<string, string>>({});
  const [guestDraft, setGuestDraft] = useState("1");
  const [checkInDraft, setCheckInDraft] = useState("");
  const [checkOutDraft, setCheckOutDraft] = useState("");
  const [nightlyDraft, setNightlyDraft] = useState("");
  const [manualLodging, setManualLodging] = useState(false);
  const [lodgingTotalDraft, setLodgingTotalDraft] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [menuCategory, setMenuCategory] = useState("all");
  const [manualKind, setManualKind] = useState<"manual_charge" | "discount">("manual_charge");
  const [manualLabel, setManualLabel] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<RoomFolioPaymentMethod>("cash");
  const [showPayment, setShowPayment] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction>(null);

  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getRoomFolioData) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void bridge.getRoomFolioData()
      .then((next) => { if (active) setData(next); })
      .catch(() => { if (active) setMessage("Oda adisyonları hazırlanamadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  const selectedFolio = useMemo(
    () => data.folios.find((folio) => folio.id === selectedFolioId) ?? null,
    [data.folios, selectedFolioId]
  );

  const filteredMenu = useMemo(() => {
    if (!menuEnabled) return [];
    const search = menuSearch.trim().toLocaleLowerCase("tr-TR");
    return data.menuItems.filter((item) => {
      if (menuCategory !== "all" && item.categoryId !== menuCategory) return false;
      if (!search) return true;
      return `${item.name} ${item.description}`.toLocaleLowerCase("tr-TR").includes(search);
    });
  }, [data.menuItems, menuCategory, menuEnabled, menuSearch]);

  const checkedInCount = data.activeStays.filter((stay) => stay.status === "checked_in").length;
  const openFolios = data.folios.filter((folio) => folio.status === "open");
  const openBalance = openFolios.reduce((sum, folio) => sum + folio.remainingMinor, 0);

  function syncFolioDrafts(folio: DesktopRoomFolio) {
    setGuestDraft(String(folio.guestCount));
    setCheckInDraft(isoToTurkishDateDraft(folio.checkInDate));
    setCheckOutDraft(isoToTurkishDateDraft(folio.plannedCheckOutDate));
    setNightlyDraft(minorToInput(folio.nightlyPriceMinor));
    setManualLodging(folio.lodgingManualOverride);
    setLodgingTotalDraft(minorToInput(folio.lodgingTotalMinor));
    setPaymentAmount(minorToInput(folio.remainingMinor));
    setPaymentMethod("cash");
    setShowPayment(false);
    setConfirmationAction(null);
    setManualLabel("");
    setManualAmount("");
    setMenuSearch("");
    setMenuCategory("all");
  }

  function openExistingFolio(folioId: string) {
    const folio = data.folios.find((item) => item.id === folioId);
    if (!folio) return;
    setSelectedFolioId(folio.id);
    syncFolioDrafts(folio);
    setMessage("");
  }

  async function applyMutation(promise: Promise<DesktopRoomFolioMutationResult>, keepFolioId = "") {
    setSaving(true);
    try {
      const result = await promise;
      setMessage(result.message);
      if (result.ok) {
        setData(result.data);
        const folioId = result.folioId || keepFolioId || selectedFolioId;
        if (folioId) {
          setSelectedFolioId(folioId);
          const folio = result.data.folios.find((item) => item.id === folioId);
          if (folio) syncFolioDrafts(folio);
        }
      }
      return result;
    } catch {
      setMessage("İşlem tamamlanamadı.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveRoomPrice(roomId: string, currentMinor: number) {
    const bridge = window.yardimciDesktop;
    if (!bridge?.setRoomNightlyPrice) return;
    const amountMinor = parseMoneyToMinor(roomPriceDrafts[roomId] ?? minorToInput(currentMinor));
    if (amountMinor < 0) {
      setMessage("Geçerli bir gecelik oda fiyatı girin.");
      return;
    }
    const result = await applyMutation(bridge.setRoomNightlyPrice({ roomId, amountMinor, currency: "TRY" }));
    if (result?.ok) setRoomPriceDrafts((current) => ({ ...current, [roomId]: "" }));
  }

  async function openStay(stay: DesktopRoomFolioStay) {
    const bridge = window.yardimciDesktop;
    if (!bridge?.openRoomFolio) return;
    if (stay.nightlyPriceMinor <= 0) {
      setMessage(`${stay.roomName} için önce gecelik fiyat girin.`);
      return;
    }
    const result = await applyMutation(bridge.openRoomFolio(stay.id));
    if (result?.ok && result.folioId) openExistingFolioFromData(result.data, result.folioId);
  }

  function openExistingFolioFromData(next: DesktopRoomFolioData, folioId: string) {
    const folio = next.folios.find((item) => item.id === folioId);
    if (!folio) return;
    setSelectedFolioId(folioId);
    syncFolioDrafts(folio);
  }

  async function saveFolioDetails() {
    const bridge = window.yardimciDesktop;
    if (!selectedFolio || !bridge?.updateRoomFolioDetails) return;
    const nightlyPriceMinor = parseMoneyToMinor(nightlyDraft);
    const lodgingTotalMinor = parseMoneyToMinor(lodgingTotalDraft);
    const guestCount = Math.max(1, Math.min(50, Math.trunc(Number(guestDraft) || 1)));
    const checkInDate = parseTurkishDateDraft(checkInDraft);
    const checkOutDate = checkOutDraft.trim() ? parseTurkishDateDraft(checkOutDraft) : "";
    if (!checkInDate || (checkOutDraft.trim() && !checkOutDate)) {
      setMessage("Tarihleri GG.AA.YYYY biçiminde ve geçerli bir tarih olarak girin.");
      return;
    }
    if (checkOutDate && checkOutDate < checkInDate) {
      setMessage("Çıkış tarihi giriş tarihinden önce olamaz.");
      return;
    }
    if (nightlyPriceMinor < 0 || (manualLodging && lodgingTotalMinor < 0)) {
      setMessage("Konaklama tutarlarını kontrol edin.");
      return;
    }
    await applyMutation(bridge.updateRoomFolioDetails({
      folioId: selectedFolio.id,
      guestCount,
      checkInDate,
      plannedCheckOutDate: checkOutDate,
      nightlyPriceMinor,
      lodgingTotalMinor: manualLodging ? lodgingTotalMinor : undefined,
      lodgingManualOverride: manualLodging
    }), selectedFolio.id);
  }

  async function addMenuItem(menuItemId: string) {
    const bridge = window.yardimciDesktop;
    if (!selectedFolio || !bridge?.addRoomFolioMenuItem) return;
    const existingItem = selectedFolio.items.find(
      (item) => item.kind === "menu" && item.menuItemId === menuItemId && !item.note.trim()
    );
    if (existingItem && bridge.updateRoomFolioItemQuantity) {
      await applyMutation(
        bridge.updateRoomFolioItemQuantity({ itemId: existingItem.id, quantity: existingItem.quantity + 1 }),
        selectedFolio.id
      );
      return;
    }
    await applyMutation(bridge.addRoomFolioMenuItem({ folioId: selectedFolio.id, menuItemId, quantity: 1 }), selectedFolio.id);
  }

  async function changeItemQuantity(item: DesktopRoomFolioItem, delta: number) {
    const bridge = window.yardimciDesktop;
    if (!selectedFolio || !bridge?.updateRoomFolioItemQuantity || !bridge?.removeRoomFolioItem) return;
    const nextQuantity = item.quantity + delta;
    if (nextQuantity <= 0) {
      await applyMutation(bridge.removeRoomFolioItem(item.id), selectedFolio.id);
      return;
    }
    await applyMutation(bridge.updateRoomFolioItemQuantity({ itemId: item.id, quantity: nextQuantity }), selectedFolio.id);
  }

  async function removeItem(itemId: string) {
    const bridge = window.yardimciDesktop;
    if (!selectedFolio || !bridge?.removeRoomFolioItem) return;
    await applyMutation(bridge.removeRoomFolioItem(itemId), selectedFolio.id);
  }

  async function addManualItem() {
    const bridge = window.yardimciDesktop;
    if (!selectedFolio || !bridge?.addRoomFolioManualItem) return;
    const amountMinor = parseMoneyToMinor(manualAmount);
    if (!manualLabel.trim() || amountMinor <= 0) {
      setMessage("Ek ücret/indirim için açıklama ve tutar girin.");
      return;
    }
    const result = await applyMutation(bridge.addRoomFolioManualItem({
      folioId: selectedFolio.id,
      kind: manualKind,
      label: manualLabel.trim(),
      amountMinor
    }), selectedFolio.id);
    if (result?.ok) {
      setManualLabel("");
      setManualAmount("");
    }
  }

  async function addPayment() {
    const bridge = window.yardimciDesktop;
    if (!selectedFolio || !bridge?.addRoomFolioPayment) return;
    const amountMinor = parseMoneyToMinor(paymentAmount);
    if (amountMinor <= 0) {
      setMessage("Geçerli bir ödeme tutarı girin.");
      return;
    }
    const result = await applyMutation(bridge.addRoomFolioPayment({
      folioId: selectedFolio.id,
      amountMinor,
      paymentMethod
    }), selectedFolio.id);
    if (result?.ok) setShowPayment(false);
  }

  function requestVoidPayment(paymentId: string, amountMinor: number) {
    setConfirmationAction({ kind: "void-payment", paymentId, amountMinor });
  }

  function requestCheckout() {
    if (!selectedFolio) return;
    setConfirmationAction({ kind: "checkout" });
  }

  async function confirmAction() {
    const bridge = window.yardimciDesktop;
    if (!selectedFolio || !confirmationAction) return;
    if (confirmationAction.kind === "void-payment") {
      if (!bridge?.voidRoomFolioPayment) return;
      const paymentId = confirmationAction.paymentId;
      setConfirmationAction(null);
      await applyMutation(bridge.voidRoomFolioPayment(paymentId), selectedFolio.id);
      return;
    }
    if (!bridge?.checkoutRoomFolio) return;
    const allowOutstanding = selectedFolio.remainingMinor > 0;
    setConfirmationAction(null);
    const result = await applyMutation(
      bridge.checkoutRoomFolio({ folioId: selectedFolio.id, allowOutstanding }),
      selectedFolio.id
    );
    if (result?.ok) setSelectedFolioId("");
  }

  return (
    <section className="room-folio-workspace" aria-label="Oda adisyonları">
      <Panel className="room-folio-overview-panel">
        <div className="room-folio-title-row">
          <div>
            <p className="panel-eyebrow">Oda hesabı</p>
            <h2>Konaklama ve Oda Adisyonları</h2>
            <p>Girişten çıkışa kadar konaklama, restoran ürünleri ve tahsilat tek hesapta.</p>
          </div>
          {loading && <span>Hazırlanıyor…</span>}
        </div>
        <div className="room-folio-summary-grid">
          <MetricCard compact title="Odada kalan" value={String(checkedInCount)} detail="Aktif konaklama" tone="info" icon={BedDouble} />
          <MetricCard compact title="Açık adisyon" value={String(openFolios.length)} detail="Çıkış yapılmamış" tone="neutral" icon={ReceiptText} />
          <MetricCard compact title="Bekleyen ödeme" value={minorMoney(openBalance)} detail="Açık oda hesapları" tone={openBalance > 0 ? "wait" : "ok"} icon={Banknote} />
        </div>
      </Panel>

      <Panel className="room-price-panel" padding="compact">
        <details>
          <summary>Oda gecelik fiyatlarını düzenle</summary>
          <p className="room-price-help">Bu fiyat yeni açılan oda adisyonuna başlangıç fiyatı olarak alınır. Açık adisyonlar sonradan etkilenmez.</p>
          <div className="room-price-grid">
            {data.rooms.map((room) => (
              <label className="room-price-card" key={room.id}>
                <span><strong>{room.name}</strong>{room.number && <small>No {room.number}</small>}</span>
                <span className="room-price-editor">
                  <input
                    inputMode="decimal"
                    aria-label={`${room.name} gecelik fiyatı`}
                    value={roomPriceDrafts[room.id] ?? minorToInput(room.nightlyPriceMinor)}
                    onChange={(event) => setRoomPriceDrafts((current) => ({ ...current, [room.id]: event.target.value }))}
                  />
                  <span>₺ / gece</span>
                  <button type="button" disabled={saving} onClick={() => void saveRoomPrice(room.id, room.nightlyPriceMinor)}>Kaydet</button>
                </span>
              </label>
            ))}
          </div>
        </details>
      </Panel>

      <section className="room-folio-stays-section">
        <div className="room-folio-section-heading">
          <div><h3>Aktif ve Planlanan Konaklamalar</h3><p>Odaya girişte adisyonu açın; çıkış işlemini aynı hesaptan tamamlayın.</p></div>
          <span>{data.activeStays.length} kayıt</span>
        </div>
        {data.activeStays.length === 0 ? (
          <Panel><p className="room-folio-empty">Aktif veya planlanan konaklama yok.</p></Panel>
        ) : (
          <div className="room-folio-stay-grid">
            {data.activeStays.map((stay) => {
              const folio = data.folios.find((item) => item.id === stay.folioId);
              return <StayCard stay={stay} folio={folio} onOpen={() => folio ? openExistingFolio(folio.id) : void openStay(stay)} key={stay.id} />;
            })}
          </div>
        )}
      </section>

      {message && <p className="room-folio-message" role="status">{message}</p>}

      {selectedFolio && selectedFolio.status === "open" && (
        <div className="room-folio-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedFolioId(""); }}>
          <section className="room-folio-drawer" role="dialog" aria-modal="true" aria-label={`${selectedFolio.roomName} oda adisyonu`}>
            <header className="room-folio-drawer-header">
              <div>
                <p className="panel-eyebrow">Oda adisyonu</p>
                <h2>{selectedFolio.roomName} — {selectedFolio.customerName}</h2>
                <span>{selectedFolio.guestCount} kişi · {formatDateRange(selectedFolio.checkInDate, selectedFolio.plannedCheckOutDate)}</span>
              </div>
              <button className="room-folio-close" type="button" aria-label="Kapat" onClick={() => setSelectedFolioId("")}><X size={19} /></button>
            </header>

            <div className="room-folio-drawer-body">
              <section className="room-folio-details-card">
                <div className="room-folio-subheading"><h3>Konaklama</h3><span>{selectedFolio.nights} gece</span></div>
                <div className="room-folio-details-grid">
                  <label><Users size={15} /> Kişi sayısı<input type="number" min={1} max={50} value={guestDraft} onChange={(e) => setGuestDraft(e.target.value)} /></label>
                  <label><CalendarDays size={15} /> Giriş<input type="text" inputMode="numeric" maxLength={10} placeholder="GG.AA.YYYY" value={checkInDraft} onChange={(e) => setCheckInDraft(normalizeTurkishDateDraft(e.target.value))} /></label>
                  <label><CalendarDays size={15} /> Çıkış<input type="text" inputMode="numeric" maxLength={10} placeholder="GG.AA.YYYY" value={checkOutDraft} onChange={(e) => setCheckOutDraft(normalizeTurkishDateDraft(e.target.value))} /></label>
                  <label>Gecelik fiyat<input inputMode="decimal" value={nightlyDraft} onChange={(e) => setNightlyDraft(e.target.value)} /></label>
                </div>
                <div className="room-folio-details-actions">
                  <div>
                    <label className="room-folio-manual-total-toggle">
                      <input type="checkbox" checked={manualLodging} onChange={(e) => setManualLodging(e.target.checked)} />
                      Konaklama toplamını elle belirle
                    </label>
                    {manualLodging && <label className="room-folio-total-input">Konaklama toplamı<input inputMode="decimal" value={lodgingTotalDraft} onChange={(e) => setLodgingTotalDraft(e.target.value)} /></label>}
                  </div>
                  <button className="room-folio-secondary-button" type="button" disabled={saving} onClick={() => void saveFolioDetails()}>Bilgileri Kaydet</button>
                </div>
              </section>

              <div className="room-folio-account-layout">
                {menuEnabled && <section className="room-folio-menu-panel">
                  <div className="room-folio-subheading"><h3>Restoran Menüsünden Ekle</h3><span>{filteredMenu.length} ürün</span></div>
                  <input className="room-folio-menu-search" value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} placeholder="Ürün ara" />
                  <div className="room-folio-category-tabs">
                    <button className={menuCategory === "all" ? "is-active" : ""} type="button" onClick={() => setMenuCategory("all")}>Tümü</button>
                    {data.menuCategories.map((category) => (
                      <button className={menuCategory === category.id ? "is-active" : ""} type="button" onClick={() => setMenuCategory(category.id)} key={category.id}>{category.name}</button>
                    ))}
                  </div>
                  <div className="room-folio-menu-list">
                    {filteredMenu.map((item) => (
                      <article key={item.id}>
                        <div><strong>{item.name}</strong><span>{item.categoryName}</span></div>
                        <div><b>{minorMoney(item.priceMinor)}</b><button type="button" disabled={saving || (item.stockQuantity !== null && item.stockQuantity < item.stockConsumptionQuantity)} onClick={() => void addMenuItem(item.id)}><Plus size={15} /> Ekle</button></div>
                      </article>
                    ))}
                  </div>
                </section>}

                <section className="room-folio-account-panel">
                  <div className="room-folio-subheading"><h3>Hesap</h3><span>{selectedFolio.items.length + 1} kalem</span></div>
                  <div className="room-folio-line-list">
                    <article className="is-lodging">
                      <div><strong>Konaklama · {selectedFolio.nights} gece</strong><span>{minorMoney(selectedFolio.nightlyPriceMinor)} / gece</span></div>
                      <b>{minorMoney(selectedFolio.lodgingTotalMinor)}</b>
                    </article>
                    {selectedFolio.items.map((item) => (
                      <article className={item.kind === "discount" ? "is-discount" : ""} key={item.id}>
                        <div><strong>{item.label}</strong><span>{item.kind === "menu" ? `${item.quantity} adet · ${minorMoney(item.unitPriceMinor)}` : item.kind === "discount" ? "İndirim" : "Ek ücret"}</span></div>
                        {item.kind === "menu" && <div className="room-folio-quantity"><button type="button" disabled={saving} onClick={() => void changeItemQuantity(item, -1)}><Minus size={14} /></button><span>{item.quantity}</span><button type="button" disabled={saving} onClick={() => void changeItemQuantity(item, 1)}><Plus size={14} /></button></div>}
                        <b>{item.lineTotalMinor < 0 ? "−" : ""}{minorMoney(Math.abs(item.lineTotalMinor))}</b>
                        <button className="room-folio-line-remove" type="button" disabled={saving} aria-label={`${item.label} kalemini çıkar`} onClick={() => void removeItem(item.id)}><Trash2 size={14} /></button>
                      </article>
                    ))}
                  </div>

                  <div className="room-folio-manual-item-form">
                    <select value={manualKind} onChange={(e) => setManualKind(e.target.value as "manual_charge" | "discount")}>
                      <option value="manual_charge">Ek ücret</option>
                      <option value="discount">İndirim</option>
                    </select>
                    <input value={manualLabel} onChange={(e) => setManualLabel(e.target.value)} placeholder="Örn. ek yatak" />
                    <input inputMode="decimal" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="0,00" />
                    <button type="button" disabled={saving} onClick={() => void addManualItem()}>Ekle</button>
                  </div>

                  <div className="room-folio-totals">
                    <span>Toplam <strong>{minorMoney(selectedFolio.chargeTotalMinor)}</strong></span>
                    <span>Tahsil edilen <strong>{minorMoney(selectedFolio.paidTotalMinor)}</strong></span>
                    <span className={selectedFolio.remainingMinor > 0 ? "is-waiting" : "is-paid"}>Kalan <strong>{minorMoney(selectedFolio.remainingMinor)}</strong></span>
                  </div>

                  {selectedFolio.payments.length > 0 && (
                    <div className="room-folio-payment-history">
                      <strong>Tahsilatlar</strong>
                      {selectedFolio.payments.map((payment) => (
                        <div key={payment.id}><span>{paymentMethodLabel(payment.paymentMethod)} · {formatDateTime(payment.paidAt)}{payment.source === "legacy" ? " · Kapora" : ""}</span><b>{minorMoney(payment.amountMinor)}</b>{payment.source === "direct" && <button type="button" disabled={saving} onClick={() => requestVoidPayment(payment.id, payment.amountMinor)} aria-label="Tahsilatı geri al"><Trash2 size={13} /></button>}</div>
                      ))}
                    </div>
                  )}

                  {showPayment ? (
                    <div className="room-folio-payment-form">
                      <input inputMode="decimal" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Tutar" autoFocus />
                      <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as RoomFolioPaymentMethod)}>
                        <option value="cash">Nakit</option><option value="card">Kart</option><option value="bank">Banka</option><option value="other">Diğer</option>
                      </select>
                      <button type="button" disabled={saving} onClick={() => void addPayment()}>Ödemeyi Kaydet</button>
                      <button className="is-secondary" type="button" onClick={() => setShowPayment(false)}>Vazgeç</button>
                    </div>
                  ) : selectedFolio.remainingMinor > 0 ? (
                    <button className="room-folio-payment-button" type="button" disabled={saving} onClick={() => { setPaymentAmount(minorToInput(selectedFolio.remainingMinor)); setShowPayment(true); }}><Banknote size={16} /> Ödeme Al</button>
                  ) : (
                    <div className="room-folio-payment-complete" role="status">
                      <CheckCircle2 size={18} aria-hidden="true" />
                      <div><strong>Ödeme tamamlandı</strong><span>Oda hesabının tamamı tahsil edildi.</span></div>
                    </div>
                  )}
                </section>
              </div>
            </div>

            <footer className="room-folio-drawer-footer">
              <span>{selectedFolio.remainingMinor > 0 ? `${minorMoney(selectedFolio.remainingMinor)} ödeme bekliyor` : "Hesap tamamlandı"}</span>
              <button className="room-folio-checkout-button" type="button" disabled={saving} onClick={requestCheckout}>Çıkış Yap</button>
            </footer>

            {confirmationAction && (
              <div className="room-folio-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmationAction(null); }}>
                <section className="room-folio-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="room-folio-confirm-title">
                  {confirmationAction.kind === "checkout" ? (
                    <>
                      <div className="room-folio-confirm-copy">
                        <p className="panel-eyebrow">Çıkış işlemi</p>
                        <h3 id="room-folio-confirm-title">
                          {selectedFolio.remainingMinor > 0 ? `${minorMoney(selectedFolio.remainingMinor)} ödeme kaldı` : "Çıkışı tamamla"}
                        </h3>
                        <p>
                          {selectedFolio.remainingMinor > 0
                            ? "Bu tutar müşterinin kalan alacağı olarak korunacak ve oda boşaltılacak."
                            : "Misafirin çıkışı tamamlanacak ve oda adisyonu kapatılacak."}
                        </p>
                      </div>
                      <div className="room-folio-confirm-actions">
                        <button className="is-secondary" type="button" onClick={() => setConfirmationAction(null)}>Vazgeç</button>
                        <button className={selectedFolio.remainingMinor > 0 ? "is-warning" : "is-primary"} type="button" disabled={saving} onClick={() => void confirmAction()}>
                          {selectedFolio.remainingMinor > 0 ? "Alacak Bırak ve Çıkış Yap" : "Çıkışı Tamamla"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="room-folio-confirm-copy">
                        <p className="panel-eyebrow">Tahsilat düzeltme</p>
                        <h3 id="room-folio-confirm-title">{minorMoney(confirmationAction.amountMinor)} tahsilatı geri alınsın mı?</h3>
                        <p>Bu ödeme oda hesabından ve kasa kayıtlarından geri alınacak.</p>
                      </div>
                      <div className="room-folio-confirm-actions">
                        <button className="is-secondary" type="button" onClick={() => setConfirmationAction(null)}>Vazgeç</button>
                        <button className="is-warning" type="button" disabled={saving} onClick={() => void confirmAction()}>Tahsilatı Geri Al</button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function StayCard({ stay, folio, onOpen }: { stay: DesktopRoomFolioStay; folio?: DesktopRoomFolio; onOpen: () => void }) {
  return (
    <Panel className={`room-folio-stay-card ${stay.status === "checked_in" ? "is-occupied" : ""}`} padding="compact">
      <div className="room-folio-stay-heading">
        <div><strong>{stay.roomName}</strong><span>{stay.customerName}</span></div>
        <b>{stay.status === "checked_in" ? "Odada" : "Planlandı"}</b>
      </div>
      <div className="room-folio-stay-meta"><span><Users size={14} /> {stay.guestCount} kişi</span><span><CalendarDays size={14} /> {formatDateRange(stay.checkInDate, stay.checkOutDate)}</span></div>
      {folio ? (
        <div className="room-folio-stay-money"><span>Hesap <strong>{minorMoney(folio.chargeTotalMinor)}</strong></span><span>Tahsil <strong>{minorMoney(folio.paidTotalMinor)}</strong></span><span>Kalan <strong>{minorMoney(folio.remainingMinor)}</strong></span></div>
      ) : (
        <p className="room-folio-stay-price">Gecelik: <strong>{stay.nightlyPriceMinor > 0 ? minorMoney(stay.nightlyPriceMinor) : "Fiyat girilmemiş"}</strong></p>
      )}
      <button type="button" onClick={onOpen}>{folio ? "Oda Adisyonunu Aç" : stay.status === "checked_in" ? "Adisyon Aç" : "Giriş Yap / Adisyon Aç"}</button>
    </Panel>
  );
}

function parseMoneyToMinor(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(/₺/g, "").replace(/\./g, "").replace(",", ".");
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : -1;
}

function minorToInput(value: number): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
}

function minorMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
}

function normalizeTurkishDateDraft(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function isoToTurkishDateDraft(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value || "";
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function parseTurkishDateDraft(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateRange(start: string, end: string): string {
  const startText = formatDate(start);
  const endText = formatDate(end);
  return end ? `${startText} – ${endText}` : startText;
}

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function paymentMethodLabel(method: RoomFolioPaymentMethod): string {
  if (method === "cash") return "Nakit";
  if (method === "card") return "Kart";
  if (method === "bank") return "Banka";
  if (method === "other") return "Diğer";
  return "Belirtilmedi";
}

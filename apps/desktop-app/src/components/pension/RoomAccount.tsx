import { useEffect, useState } from "react";
import type { DesktopRoomFolio } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { MoneyInput } from "../ui/MoneyInput";
import { minorMoney, minorToInput, parseMoneyToMinor, paymentMethodLabel, formatDateTime, formatDateRange } from "./folio-format";
import type { RoomFolioController } from "./use-room-folio-controller";
import { RoomAccountPayment } from "./RoomAccountPayment";
import { useConfirmDialog } from "../ui/useConfirmDialog";

export function RoomAccount({ controller, menuEnabled, currentStayId, focusFolioId, ambiguous, disabled, onDirty }: {
  controller: RoomFolioController;
  menuEnabled: boolean;
  currentStayId?: string;
  focusFolioId?: string;
  ambiguous: boolean;
  disabled: boolean;
  onDirty: (key: string, dirty: boolean) => void;
}) {
  const current = controller.selected;
  const previous = controller.folios.filter(item => item.stayId !== currentStayId && item.status === "open"
    && !controller.data.activeStays.some(stay => stay.id === item.stayId && ["planned", "checked_in"].includes(stay.status)));
  const focusedPrevious = Boolean(focusFolioId && previous.some(folio => folio.id === focusFolioId));
  const [previousOpen, setPreviousOpen] = useState(focusedPrevious);

  useEffect(() => {
    if (focusedPrevious) setPreviousOpen(true);
  }, [focusedPrevious, focusFolioId]);

  return <>
    {controller.loading && <p role="status">Hesap hazırlanıyor…</p>}
    {previous.some(folio => folio.remainingMinor > 0) && <p className="operation-prior-debt">
      Önceki borç · {minorMoney(previous.reduce((total, folio) => total + Math.max(0, folio.remainingMinor), 0))}
    </p>}
    <section aria-label="Mevcut konaklama hesabı" className="operation-section form-stack">
      <h4>Konaklama hesabı</h4>
      {current ? <AccountRecord
        key={current.id}
        folio={current}
        controller={controller}
        menuEnabled={menuEnabled}
        disabled={disabled}
        onDirty={(scope, dirty) => onDirty(`${current.id}:${scope}`, dirty)}
      /> : <>
        <p>{ambiguous
          ? "Birden fazla girişli konaklama var; mevcut hesap belirlenemedi. Konaklama kayıtlarını kontrol edin."
          : currentStayId
            ? "Bu konaklama için hesap henüz açılmadı."
            : "Aktif misafir hesabı yok. Giriş tamamlandığında konaklama hesabı burada görünür."}</p>
        {currentStayId && <ActionButton disabled={disabled} onClick={() => void controller.mutate(() => window.yardimciDesktop!.openRoomFolio(currentStayId))}>
          Hesabı Aç
        </ActionButton>}
      </>}
    </section>
    {controller.error && <ActionButton variant="secondary" disabled={controller.busy} onClick={() => void controller.refresh()}>Hesabı Yenile</ActionButton>}
    {previous.length > 0 && <section className="operation-section room-previous-accounts" aria-label="Önceki hesaplar">
      <details
        open={focusedPrevious || previousOpen}
        onToggle={event => {
          if (!focusedPrevious) setPreviousOpen(event.currentTarget.open);
        }}
      >
        <summary>Önceki hesaplar ({previous.length})</summary>
        <div className="form-stack">
          {previous.map(folio => <AccountRecord
            key={folio.id}
            folio={folio}
            controller={controller}
            menuEnabled={menuEnabled}
            departed
            disabled={disabled}
            onDirty={(scope, dirty) => onDirty(`${folio.id}:${scope}`, dirty)}
          />)}
        </div>
      </details>
    </section>}
  </>;
}

function AccountRecord({ folio, controller, menuEnabled, departed = false, disabled, onDirty }: {
  folio: DesktopRoomFolio;
  controller: RoomFolioController;
  menuEnabled: boolean;
  departed?: boolean;
  disabled: boolean;
  onDirty: (scope: string, dirty: boolean) => void;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const open = folio.status === "open";
  const editable = open && !departed;
  const [lodgingEditing, setLodgingEditing] = useState(false);
  const [lodgingDraft, setLodgingDraft] = useState(() => minorToInput(folio.lodgingTotalMinor));
  const [discountEditing, setDiscountEditing] = useState(false);
  const discountMinor = folio.items
    .filter(item => item.kind === "discount")
    .reduce((sum, item) => sum + Math.max(0, -item.lineTotalMinor), 0);
  const [discountDraft, setDiscountDraft] = useState(() => minorToInput(discountMinor));
  const visibleItems = folio.items.filter(item => item.kind !== "discount");
  const extrasMinor = visibleItems.reduce((sum, item) => sum + Math.max(0, item.lineTotalMinor), 0);
  const parsedLodging = parseMoneyToMinor(lodgingDraft);
  const parsedDiscount = parseMoneyToMinor(discountDraft);
  const lodgingInvalid = parsedLodging === null
    || parsedLodging < 0
    || parsedLodging + extrasMinor - discountMinor < folio.paidTotalMinor;
  const maxDiscountMinor = Math.max(0, folio.chargeTotalMinor + discountMinor - folio.paidTotalMinor);
  const discountInvalid = parsedDiscount === null || parsedDiscount < 0 || parsedDiscount > maxDiscountMinor;

  useEffect(() => {
    if (!lodgingEditing) setLodgingDraft(minorToInput(folio.lodgingTotalMinor));
  }, [folio.lodgingTotalMinor, lodgingEditing]);

  useEffect(() => {
    if (!discountEditing) setDiscountDraft(minorToInput(discountMinor));
  }, [discountMinor, discountEditing]);

  function cancelEditors() {
    setLodgingEditing(false);
    setDiscountEditing(false);
    setLodgingDraft(minorToInput(folio.lodgingTotalMinor));
    setDiscountDraft(minorToInput(discountMinor));
    onDirty("lodging", false);
    onDirty("discount", false);
  }

  async function applyLodging() {
    if (disabled || lodgingInvalid || parsedLodging === null) return;
    const result = await controller.mutate(() => window.yardimciDesktop!.updateRoomFolioDetails({
      folioId: folio.id,
      guestCount: folio.guestCount,
      checkInDate: folio.checkInDate,
      plannedCheckOutDate: folio.plannedCheckOutDate,
      nightlyPriceMinor: folio.nightlyPriceMinor,
      lodgingManualOverride: true,
      lodgingTotalMinor: parsedLodging
    }), "details");
    if (result?.ok) {
      setLodgingEditing(false);
      onDirty("lodging", false);
    }
  }

  async function applyDiscount() {
    if (disabled || discountInvalid || parsedDiscount === null) return;
    const result = await controller.mutate(() => window.yardimciDesktop!.setRoomFolioDiscount({
      folioId: folio.id,
      amountMinor: parsedDiscount
    }), "adjustments");
    if (result?.ok) {
      setDiscountEditing(false);
      onDirty("discount", false);
    }
  }

  async function requestVoid(payment: DesktopRoomFolio["payments"][number]) {
    const approved = await confirm({
      title: "Tahsilatı geri al",
      description: "Seçilen tahsilat oda hesabından ve kasa kayıtlarından geri alınacak.",
      confirmLabel: "Tahsilatı Geri Al",
      tone: "danger",
      details: <dl className="operation-facts">
        <div><dt>Misafir</dt><dd>{folio.customerName}</dd></div>
        <div><dt>Tahsilat</dt><dd>{minorMoney(payment.amountMinor)} · {paymentMethodLabel(payment.paymentMethod)}</dd></div>
        <div><dt>Tarih</dt><dd>{formatDateTime(payment.paidAt)}</dd></div>
      </dl>
    });
    if (approved) void controller.mutate(() => window.yardimciDesktop!.voidRoomFolioPayment(payment.id));
  }

  async function requestClose() {
    const approved = await confirm({
      title: "Oda hesabını kapat",
      description: "Tahsilatı tamamlanmış bu hesap kapatılacak. Konaklama ve oda durumu değişmeyecek.",
      confirmLabel: "Hesabı Kapat",
      tone: "warning",
      details: <dl className="operation-facts">
        <div><dt>Misafir</dt><dd>{folio.customerName}</dd></div>
        <div><dt>Toplam</dt><dd>{minorMoney(folio.chargeTotalMinor)}</dd></div>
        <div><dt>Ödenen</dt><dd>{minorMoney(folio.paidTotalMinor)}</dd></div>
      </dl>
    });
    if (approved) void controller.mutate(() => window.yardimciDesktop!.checkoutRoomFolio({ folioId: folio.id }));
  }

  return <>
    <article className="room-account-record form-stack" tabIndex={-1} data-folio-id={folio.id} data-stay-id={folio.stayId}>
      <div>
        <strong>Hesap sahibi: {folio.customerName}</strong>
        {(departed || !open) && <p>{departed ? "Çıkışı yapılmış konaklama" : "Kapalı hesap"} · {formatDateRange(folio.checkInDate, folio.plannedCheckOutDate)}</p>}
      </div>
      <dl className="operation-facts room-account-facts">
        <div className="room-account-editable-row">
          <dt>Konaklama · {folio.nights} gece</dt>
          <dd>
            {!lodgingEditing ? <>
              <span>{minorMoney(folio.lodgingTotalMinor)}</span>
              {editable && <ActionButton variant="ghost" size="sm" disabled={disabled} onClick={() => {
                setDiscountEditing(false);
                setDiscountDraft(minorToInput(discountMinor));
                setLodgingEditing(true);
                onDirty("discount", false);
              }}>Düzenle</ActionButton>}
            </> : <div className="room-account-inline-editor">
              <MoneyInput
                aria-label="Konaklama tutarı"
                value={lodgingDraft}
                onChange={value => {
                  setLodgingDraft(value);
                  onDirty("lodging", value !== minorToInput(folio.lodgingTotalMinor));
                }}
                aria-invalid={lodgingInvalid || undefined}
                disabled={disabled}
              />
              <ActionButton size="sm" disabled={disabled || lodgingInvalid} onClick={() => void applyLodging()}>Uygula</ActionButton>
              <ActionButton variant="ghost" size="sm" disabled={disabled} onClick={cancelEditors}>Vazgeç</ActionButton>
            </div>}
          </dd>
        </div>
        <div><dt>Ekstralar</dt><dd>{minorMoney(extrasMinor)}</dd></div>
        <div className="room-account-editable-row">
          <dt>İndirim</dt>
          <dd>
            {!discountEditing ? <>
              <span>{minorMoney(discountMinor)}</span>
              {editable && <ActionButton variant="ghost" size="sm" disabled={disabled} onClick={() => {
                setLodgingEditing(false);
                setLodgingDraft(minorToInput(folio.lodgingTotalMinor));
                setDiscountEditing(true);
                onDirty("lodging", false);
              }}>Düzenle</ActionButton>}
            </> : <div className="room-account-inline-editor">
              <MoneyInput
                aria-label="İndirim tutarı"
                value={discountDraft}
                onChange={value => {
                  setDiscountDraft(value);
                  onDirty("discount", value !== minorToInput(discountMinor));
                }}
                aria-invalid={discountInvalid || undefined}
                disabled={disabled}
              />
              <ActionButton size="sm" disabled={disabled || discountInvalid} onClick={() => void applyDiscount()}>Uygula</ActionButton>
              <ActionButton variant="ghost" size="sm" disabled={disabled} onClick={cancelEditors}>Vazgeç</ActionButton>
            </div>}
          </dd>
        </div>
        <div><dt>Toplam</dt><dd>{minorMoney(folio.chargeTotalMinor)}</dd></div>
        <div><dt>Ödenen</dt><dd>{minorMoney(folio.paidTotalMinor)}</dd></div>
        <div className="operation-balance"><dt>Kalan</dt><dd>{minorMoney(folio.remainingMinor)}</dd></div>
      </dl>
      {open && <RoomAccountPayment folio={folio} controller={controller} disabled={disabled} onDirty={dirty => onDirty("payment", dirty)} />}
      {departed && visibleItems.length > 0 && <div className="room-folio-line-list">
        {visibleItems.map(item => <article key={item.id}>
          <div>
            <strong>{item.label}</strong>
            <span>{item.kind === "menu" ? `${item.quantity} adet · ${minorMoney(item.unitPriceMinor)}` : "Ek ücret"}</span>
          </div>
          <b>{minorMoney(item.lineTotalMinor)}</b>
          {open && <div className="action-row">
            {item.kind === "menu" && menuEnabled && <>
              <ActionButton variant="secondary" disabled={disabled} aria-label={`${item.label} miktarını azalt`} onClick={() => void controller.mutate(() => item.quantity <= 1
                ? window.yardimciDesktop!.removeRoomFolioItem(item.id)
                : window.yardimciDesktop!.updateRoomFolioItemQuantity({ itemId: item.id, quantity: item.quantity - 1 }))}>−</ActionButton>
              <ActionButton variant="secondary" disabled={disabled} aria-label={`${item.label} miktarını artır`} onClick={() => void controller.mutate(() =>
                window.yardimciDesktop!.updateRoomFolioItemQuantity({ itemId: item.id, quantity: item.quantity + 1 }))}>+</ActionButton>
            </>}
            <ActionButton variant="danger" disabled={disabled} aria-label={`${item.label} kalemini çıkar`} onClick={() =>
              void controller.mutate(() => window.yardimciDesktop!.removeRoomFolioItem(item.id))}>Çıkar</ActionButton>
          </div>}
        </article>)}
      </div>}
      <div className="room-folio-payment-history">
        <h4>Tahsilatlar</h4>
        {folio.payments.length === 0 && <p>Henüz tahsilat yok.</p>}
        {folio.payments.map(payment => <div key={payment.id}>
          <span>{paymentMethodLabel(payment.paymentMethod)} · {formatDateTime(payment.paidAt)}{payment.origin === "reservation" && " · Kapora"}</span>
          <b>{minorMoney(payment.amountMinor)}</b>
          {open && payment.origin === "direct" && <ActionButton variant="danger" disabled={disabled} onClick={() => void requestVoid(payment)}>
            Tahsilatı Geri Al
          </ActionButton>}
        </div>)}
      </div>
      {departed && open && folio.remainingMinor === 0 && <ActionButton variant="secondary" disabled={disabled} onClick={() => void requestClose()}>
        Hesabı Kapat
      </ActionButton>}
    </article>
    {confirmDialog}
  </>;
}

import { useEffect, useState } from "react";
import { formatMajorToInput, parseMoneyInput } from "@yardimci-asistan/shared";
import type { DesktopDashboardData, DesktopTableOrder } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { MoneyInput } from "../ui/MoneyInput";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import type { useTableOrderController } from "./use-table-order-controller";
import type { useTableOrderBenefits } from "./use-table-order-benefits";
import { formatMoney, getOrderCurrency } from "./table-presentation";

export function TableAccountPanel({ table, controller, disabled, benefits, onCloseOrder }: {
  table: DesktopDashboardData["tables"][number];
  controller: ReturnType<typeof useTableOrderController>;
  disabled: boolean;
  benefits: ReturnType<typeof useTableOrderBenefits>;
  onCloseOrder: (status: "paid") => void;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const order = controller.active;
  const [discountEditing, setDiscountEditing] = useState(false);
  const [discountDraft, setDiscountDraft] = useState("");
  const parsedDiscount = parseMoneyInput(discountDraft);
  const discountMajor = parsedDiscount.status === "empty" ? 0 : parsedDiscount.major;
  const discountInvalid = parsedDiscount.status === "invalid"
    || discountMajor === null
    || discountMajor > (order?.subtotal ?? 0);

  useEffect(() => {
    setDiscountDraft(formatMajorToInput(order?.discountTotal ?? 0));
    setDiscountEditing(false);
  }, [order?.id, order?.discountTotal]);

  if (!order) return null;
  const activeOrder = order;
  const quoted = benefits.pending.current?.benefits.expectedQuote ?? benefits.current?.quote;

  async function applyDiscount(value = discountMajor ?? 0) {
    if (disabled || !Number.isFinite(value) || value < 0 || value > activeOrder.subtotal) return;
    if (await controller.discount(value)) setDiscountEditing(false);
  }

  async function requestPaidClose() {
    if (disabled || benefits.active) return;
    const approved = await confirm({
      eyebrow: table.name,
      title: "Hesabı kapat",
      description: "Tahsilatın alındığını onayladığınızda adisyon ödendi olarak kapatılır.",
      confirmLabel: "Ödendi / Kapat",
      tone: "warning",
      details: <dl className="operation-facts">
        <div><dt>Masa</dt><dd>{table.name}</dd></div>
        <div><dt>Ürün</dt><dd>{activeOrder.itemCount} adet</dd></div>
        <div><dt>Toplam</dt><dd>{formatMoney(activeOrder.total, getOrderCurrency(activeOrder))}</dd></div>
      </dl>
    });
    if (approved) onCloseOrder("paid");
  }

  async function requestBenefitsClose() {
    const captured = benefits.beginConfirmation();
    if (!captured) return;
    const q = captured.value.quote;
    try {
      const approved = await confirm({ eyebrow: table.name, title: "İndirim ve Puan ile hesabı kapat",
        description: "Belirtilen tahsilatı aldığınızı onaylayın. Puan kullanımı ve kazanımı adisyonla birlikte kaydedilir.",
        confirmLabel: "Tahsilatı Onayla ve Kapat", tone: "warning",
        details: <dl className="operation-facts">
          <div><dt>Ödeme yöntemi</dt><dd>{paymentLabels[benefits.method]}</dd></div>
          <div><dt>İndirim</dt><dd>{formatMoney(q.discountMinor / 100, q.currency)}</dd></div>
          <div><dt>Kullanılacak Puan</dt><dd>{formatMoney(q.pointsTenderMinor / 100, q.currency)}</dd></div>
          <div><dt>Tahsil edilecek tutar</dt><dd>{formatMoney(q.payableMinor / 100, q.currency)}</dd></div>
          <div><dt>Kazanılacak Puan</dt><dd>{formatMoney(q.pointsEarnPreviewMinor / 100, q.currency)}</dd></div>
        </dl> });
      if (approved) await benefits.submit(captured);
    } finally { benefits.cancelConfirmation(); }
  }

  return <>
    <section className="operation-section table-account-section form-stack" aria-label="Masa hesabı">
      <h4>Hesap</h4>
      <dl className="operation-facts">
        <div><dt>Ara toplam</dt><dd>{formatMoney(order.subtotal, getOrderCurrency(order))}</dd></div>
        <div className="table-discount-summary">
          <dt>İndirim</dt>
          <dd>
            {!discountEditing ? <>
              <span>{formatMoney(order.discountTotal, getOrderCurrency(order))}</span>
              <ActionButton variant="ghost" size="sm" disabled={disabled || benefits.active || order.subtotal <= 0} onClick={() => setDiscountEditing(true)}>
                Düzenle
              </ActionButton>
            </> : <>
              <div className="table-discount-inline-editor">
                <MoneyInput
                  aria-label="İndirim tutarı"
                  value={discountDraft}
                  onChange={setDiscountDraft}
                  aria-invalid={discountInvalid || undefined}
                  disabled={disabled}
                />
                <ActionButton size="sm" disabled={disabled || discountInvalid} onClick={() => void applyDiscount()}>Uygula</ActionButton>
                <ActionButton variant="ghost" size="sm" disabled={disabled} onClick={() => {
                  setDiscountDraft(formatMajorToInput(order.discountTotal));
                  setDiscountEditing(false);
                }}>Vazgeç</ActionButton>
              </div>
              {discountInvalid && <small role="alert">İndirim 0 ile ara toplam arasında olmalı.</small>}
            </>}
          </dd>
        </div>
        <div className="operation-balance"><dt>Kalan / toplam</dt><dd>{formatMoney(order.total, getOrderCurrency(order))}</dd></div>
      </dl>
      {(benefits.available || benefits.active || benefits.pending.current) && <div className="form-stack">
        <label><input type="checkbox" checked={benefits.active} disabled={disabled || discountEditing || controller.dirty}
          onChange={event => benefits.select(event.target.checked)} /> İndirim ve Puan</label>
        {(benefits.active || benefits.pending.current) && <>
          <label>Ödeme yöntemi
            <select aria-label="Adisyon ödeme yöntemi" value={benefits.method} disabled={disabled}
              onChange={event => benefits.setMethod(event.target.value as typeof benefits.method)}>
              {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {benefits.availability?.families.coupon && <label>Kupon kodu
            <input aria-label="Kupon kodu" value={benefits.coupon.current} disabled={disabled} maxLength={128}
              autoComplete="off" spellCheck={false} onChange={event => benefits.setCoupon(event.target.value)} />
          </label>}
          {benefits.pointsAvailable && <label>Kullanılacak Puan
            <MoneyInput aria-label="Kullanılacak Puan" value={benefits.points} onChange={benefits.setPoints} disabled={disabled}
              aria-invalid={benefits.requestedPointsMinor === null || undefined} />
            {benefits.requestedPointsMinor === null && <small role="alert">Geçerli bir Puan tutarı girin; kullanmayacaksanız 0 yazın.</small>}
          </label>}
          <ActionButton variant="secondary" disabled={disabled || !benefits.available || controller.dirty || benefits.requestedPointsMinor === null}
            busy={benefits.stage === "preview"} busyLabel="Tutar hesaplanıyor…" onClick={() => void benefits.refresh()}>Tutarı Hesapla</ActionButton>
          {quoted && <dl className="operation-facts" aria-label={benefits.pending.current ? "Doğrulanacak tahsilat" : "İndirim ve Puan önizlemesi"}>
            {benefits.pointsAvailable && benefits.current && <div><dt>Kullanılabilir Puan</dt><dd>{formatMoney(benefits.current.availablePointsMinor / 100, quoted.currency)}</dd></div>}
            <div><dt>İndirim</dt><dd>{formatMoney(quoted.discountMinor / 100, quoted.currency)}</dd></div>
            <div><dt>Puan ile ödeme</dt><dd>{formatMoney(quoted.pointsTenderMinor / 100, quoted.currency)}</dd></div>
            <div><dt>Tahsil edilecek tutar</dt><dd>{formatMoney(quoted.payableMinor / 100, quoted.currency)}</dd></div>
            <div><dt>Ödeme sonrası kazanılacak Puan</dt><dd>{formatMoney(quoted.pointsEarnPreviewMinor / 100, quoted.currency)}</dd></div>
          </dl>}
        </>}
      </div>}
      {benefits.error && <p role="alert">{benefits.error}</p>}
      {benefits.pending.current ? <ActionButton disabled={benefits.stage === "settle"} busy={benefits.stage === "settle"}
        busyLabel="Sonuç doğrulanıyor…" onClick={() => void benefits.submit()}>Adisyon Sonucunu Doğrula</ActionButton>
        : benefits.active ? <ActionButton disabled={disabled || !benefits.current}
          onClick={() => void requestBenefitsClose()}>İndirim ve Puan ile Kapat</ActionButton>
          : <ActionButton disabled={disabled} busy={controller.busy} busyLabel="Hesap kapatılıyor…" onClick={() => void requestPaidClose()}>Ödendi / Kapat</ActionButton>}
    </section>
    {confirmDialog}
  </>;
}

const paymentLabels = { cash: "Nakit", card: "Kart", bank: "Banka", other: "Diğer" };

export function TableCancelOrderAction({ table, order, disabled, onCancelOrder }: {
  table: DesktopDashboardData["tables"][number];
  order: DesktopTableOrder;
  disabled: boolean;
  onCancelOrder: () => void;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();

  async function requestCancel() {
    const approved = await confirm({
      eyebrow: table.name,
      title: "Adisyonu iptal et",
      description: "Adisyon iptal edilir ve ürün stokları geri yüklenir.",
      confirmLabel: "Adisyonu İptal Et",
      tone: "danger",
      details: <dl className="operation-facts">
        <div><dt>Ürün</dt><dd>{order.itemCount} adet</dd></div>
        <div><dt>Toplam</dt><dd>{formatMoney(order.total, getOrderCurrency(order))}</dd></div>
      </dl>
    });
    if (approved) onCancelOrder();
  }

  return <>
    <ActionButton variant="danger" size="sm" disabled={disabled} onClick={() => void requestCancel()}>Adisyonu İptal Et</ActionButton>
    {confirmDialog}
  </>;
}

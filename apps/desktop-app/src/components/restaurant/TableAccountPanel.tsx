import { useEffect, useState } from "react";
import { formatMajorToInput, parseMoneyInput } from "@yardimci-asistan/shared";
import type { DesktopDashboardData, DesktopTableOrder } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { MoneyInput } from "../ui/MoneyInput";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import type { useTableOrderController } from "./use-table-order-controller";
import { formatMoney, getOrderCurrency } from "./table-presentation";

export function TableAccountPanel({ table, controller, disabled, onCloseOrder }: {
  table: DesktopDashboardData["tables"][number];
  controller: ReturnType<typeof useTableOrderController>;
  disabled: boolean;
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

  async function applyDiscount(value = discountMajor ?? 0) {
    if (disabled || !Number.isFinite(value) || value < 0 || value > activeOrder.subtotal) return;
    if (await controller.discount(value)) setDiscountEditing(false);
  }

  async function requestPaidClose() {
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

  return <>
    <section className="operation-section table-account-section form-stack" aria-label="Masa hesabı">
      <h4>Hesap</h4>
      <dl className="operation-facts">
        <div><dt>Ara toplam</dt><dd>{formatMoney(order.subtotal, getOrderCurrency(order))}</dd></div>
        <div className="table-discount-summary">
          <dt>İndirim</dt>
          <dd>
            <span>{formatMoney(order.discountTotal, getOrderCurrency(order))}</span>
            {!discountEditing && <ActionButton variant="ghost" size="sm" disabled={disabled || order.subtotal <= 0} onClick={() => setDiscountEditing(true)}>
              Düzenle
            </ActionButton>}
          </dd>
        </div>
        <div className="operation-balance"><dt>Kalan / toplam</dt><dd>{formatMoney(order.total, getOrderCurrency(order))}</dd></div>
      </dl>
      {discountEditing && <div className="table-discount-editor">
        <label className="form-field form-field--fluid">
          <span>İndirim tutarı</span>
          <MoneyInput
            aria-label="İndirim tutarı"
            value={discountDraft}
            onChange={setDiscountDraft}
            aria-invalid={discountInvalid || undefined}
            disabled={disabled}
          />
        </label>
        <div className="action-row">
          <ActionButton size="sm" disabled={disabled || discountInvalid} onClick={() => void applyDiscount()}>Uygula</ActionButton>
          {order.discountTotal > 0 && <ActionButton variant="secondary" size="sm" disabled={disabled} onClick={() => {
            setDiscountDraft("0");
            void applyDiscount(0);
          }}>İndirimi Kaldır</ActionButton>}
          <ActionButton variant="ghost" size="sm" disabled={disabled} onClick={() => {
            setDiscountDraft(formatMajorToInput(order.discountTotal));
            setDiscountEditing(false);
          }}>Vazgeç</ActionButton>
        </div>
        {discountInvalid && <small role="alert">İndirim 0 ile ara toplam arasında olmalı.</small>}
      </div>}
      <ActionButton disabled={disabled} onClick={() => void requestPaidClose()}>Ödendi / Kapat</ActionButton>
    </section>
    {confirmDialog}
  </>;
}

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

import type { DesktopDashboardData } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import type { useTableOrderController } from "./use-table-order-controller";
import { formatMoney, getOrderCurrency } from "./table-presentation";

export function TableAccountPanel({ table, controller, disabled, onCloseOrder }: {
  table: DesktopDashboardData["tables"][number];
  controller: ReturnType<typeof useTableOrderController>;
  disabled: boolean;
  onCloseOrder: (status: "paid" | "cancelled") => void;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const order = controller.active;

  async function requestOrderClose(status: "paid" | "cancelled") {
    if (!order) return;
    const cancelling = status === "cancelled";
    const approved = await confirm({
      eyebrow: table.name,
      title: cancelling ? "Adisyonu iptal et" : "Hesabı kapat",
      description: cancelling
        ? "Adisyon iptal edilir ve ürün stokları geri yüklenir."
        : "Tahsilatın alındığını onayladığınızda adisyon ödendi olarak kapatılır.",
      confirmLabel: cancelling ? "Adisyonu İptal Et" : "Ödendi / Kapat",
      tone: cancelling ? "danger" : "warning",
      details: <dl className="operation-facts">
        <div><dt>Masa</dt><dd>{table.name} · {table.area || "Genel"}</dd></div>
        <div><dt>Ürün</dt><dd>{order.itemCount} adet</dd></div>
        <div><dt>Toplam</dt><dd>{formatMoney(order.total, getOrderCurrency(order))}</dd></div>
      </dl>
    });
    if (approved) onCloseOrder(status);
  }

  if (!order) return null;

  return <>
    <section className="operation-section table-account-section form-stack" aria-label="Masa hesabı">
      <h4>Hesap</h4>
      <dl className="operation-facts">
        <div><dt>Ara toplam</dt><dd>{formatMoney(order.subtotal, getOrderCurrency(order))}</dd></div>
        <div><dt>İndirim</dt><dd>{formatMoney(order.discountTotal, getOrderCurrency(order))}</dd></div>
        <div className="operation-balance"><dt>Kalan / toplam</dt><dd>{formatMoney(order.total, getOrderCurrency(order))}</dd></div>
      </dl>
      <ActionButton disabled={disabled} onClick={() => void requestOrderClose("paid")}>Ödendi / Kapat</ActionButton>
      <details className="table-account-more">
        <summary>Diğer işlemler</summary>
        <ActionButton variant="danger" size="sm" disabled={disabled} onClick={() => void requestOrderClose("cancelled")}>Adisyonu İptal Et</ActionButton>
      </details>
    </section>
    {confirmDialog}
  </>;
}

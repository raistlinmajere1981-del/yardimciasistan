import { useEffect, useState } from "react";
import type { DesktopTableOrder, DesktopDashboardData } from "../../../electron/database";
import type { DesktopRoomFolioData } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { SearchSelect } from "../ui/SearchSelect";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { formatMoney, getOrderCurrency } from "./table-presentation";

/** Target selection inside Table Workspace. Execution belongs to its guarded operation. */
export function TableRoomTransfer({ order, busy, onTransfer, revision, customerId, dashboard }: {
  order: DesktopTableOrder;
  busy: boolean;
  onTransfer: (folioId: string) => void;
  revision: number;
  customerId: string;
  dashboard: DesktopDashboardData;
}) {
  const [data, setData] = useState<DesktopRoomFolioData | null>(null);
  const [folioId, setFolioId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const begin = useRequestGeneration();
  const { confirm, confirmDialog } = useConfirmDialog();

  useEffect(() => {
    const current = begin();
    setLoading(true);
    setData(null);
    setFolioId("");
    void window.yardimciDesktop?.getRoomFolioData().then(result => {
      if (!current()) return;
      setData(result);
      setMessage("");
      setLoading(false);
    }).catch(() => {
      if (current()) {
        setMessage("Açık oda hesapları okunamadı.");
        setLoading(false);
      }
    });
    return () => { begin(); };
  }, [begin, revision, customerId]);

  const stays = (dashboard.roomOperations?.flatMap(room => room.stays) ?? dashboard.customerRoomStays)
    .filter(stay => stay.status === "checked_in"
      && (!customerId || stay.guests?.some(guest => guest.customerId === customerId && guest.status === "checked_in")));
  const folios = data?.folios.filter(folio =>
    folio.status === "open"
    && stays.some(stay => stay.id === folio.stayId)
    && folio.currency === getOrderCurrency(order)) ?? [];
  const selectedId = folios.length === 1 ? folios[0]?.id ?? folioId : folioId;
  const selected = folios.find(folio => folio.id === selectedId);

  async function requestTransfer() {
    if (!selected) return;
    const roomLabel = selected.roomNumber ? `Oda ${selected.roomNumber}` : selected.roomName;
    const approved = await confirm({
      eyebrow: order.tableName,
      title: "Oda hesabına aktar",
      description: `${formatMoney(order.total, getOrderCurrency(order))} masa hesabı ${roomLabel} hesabına aktarılacak. Masa adisyonu kapanır.`,
      confirmLabel: "Aktar",
      tone: "warning",
      details: <dl className="operation-facts">
        <div><dt>Masa</dt><dd>{order.tableName}</dd></div>
        <div><dt>Oda</dt><dd>{roomLabel}</dd></div>
        <div><dt>Misafir</dt><dd>{selected.customerName || "-"}</dd></div>
      </dl>
    });
    if (approved) onTransfer(selected.id);
  }

  return <div className="table-relation-block table-room-transfer" aria-label="Odaya yazdırma" aria-busy={loading}>
    <span className="table-relation-label">Oda hesabı</span>
    {folios.length > 1 && <SearchSelect
      ariaLabel="Oda hesabı"
      value={selectedId}
      onChange={setFolioId}
      disabled={busy}
      placeholder="Oda hesabı seçin"
      searchPlaceholder="Oda veya misafir ara"
      options={folios.map(folio => ({
        id: folio.id,
        label: folio.roomNumber ? `Oda ${folio.roomNumber}` : folio.roomName,
        description: `${folio.customerName || "Misafir"} · ${formatMoney(folio.remainingMinor / 100, folio.currency)} açık`,
        keywords: `${folio.roomName} ${folio.roomNumber} ${folio.customerName}`
      }))}
    />}
    <div className="table-room-transfer-row">
      {selected ? <div className="table-relation-summary">
        <strong>{selected.roomNumber ? `Oda ${selected.roomNumber}` : selected.roomName}</strong>
        <small>{selected.customerName || "Misafir"} · açık hesap</small>
      </div> : <span className="table-relation-empty">
        {!loading && (message || (data && folios.length === 0 ? "Uygun açık oda hesabı yok." : "Oda hesabı seçin."))}
      </span>}
      <ActionButton size="sm" onClick={() => void requestTransfer()} disabled={busy || loading || !selected}>Odaya Aktar</ActionButton>
    </div>
    {confirmDialog}
  </div>;
}

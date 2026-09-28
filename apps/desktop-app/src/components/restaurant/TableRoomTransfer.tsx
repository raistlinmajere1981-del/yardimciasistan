import { useEffect, useState } from "react";
import type { DesktopTableOrder, DesktopDashboardData } from "../../../electron/database";
import type { DesktopRoomFolioData } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { SearchSelect } from "../ui/SearchSelect";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { formatMoney, getOrderCurrency } from "./table-presentation";

/** Target selection inside Table Workspace. Execution belongs to its guarded operation. */
export function TableRoomTransfer({ order, busy, onTransfer, revision, customerId, dashboard }: {
  order: DesktopTableOrder; busy: boolean;
  onTransfer: (folioId: string) => void; revision: number;
  customerId: string; dashboard: DesktopDashboardData;
}) {
  const [data, setData] = useState<DesktopRoomFolioData | null>(null);
  const [folioId, setFolioId] = useState("");
  const [message, setMessage] = useState("Oda hesapları yükleniyor...");
  const [loading, setLoading] = useState(true);
  const begin = useRequestGeneration();
  useEffect(() => {
    const current = begin();
    setLoading(true); setData(null); setFolioId("");
    void window.yardimciDesktop?.getRoomFolioData().then(result => {
      if (!current()) return;
      setData(result); setMessage(""); setLoading(false);
    }).catch(() => { if (current()) { setMessage("Açık oda hesapları okunamadı."); setLoading(false); } });
    return () => { begin(); };
  }, [begin, revision, customerId]);
  const stays = (dashboard.roomOperations?.flatMap(room => room.stays) ?? dashboard.customerRoomStays)
    .filter(stay => stay.status === "checked_in" && (!customerId || stay.guests?.some(guest => guest.customerId === customerId && guest.status === "checked_in")));
  const folios = data?.folios.filter(folio => folio.status === "open" && stays.some(stay => stay.id === folio.stayId) && folio.currency === getOrderCurrency(order)) ?? [];
  const selectedId = folios.length === 1 ? folios[0].id : folioId;
  const selected = folios.find(folio => folio.id === selectedId);
  return <div className="operation-section form-stack" aria-label="Odaya yazdırma">
    <h4>Odaya yazdırma</h4>
    <p>Bu aktarım masa adisyonunu kapatır; tahsilat oda hesabı üzerinden yapılır.</p>
    <p>{order.tableName} · {formatMoney(order.total, getOrderCurrency(order))}</p>
    {folios.length > 1 && <div className="form-field form-field--fluid">
      <span>Oda hesabı</span>
      <SearchSelect
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
      />
    </div>}
    {selected && <p>{selected.roomNumber ? `Oda ${selected.roomNumber}` : selected.roomName} · Ortak hesap · {selected.customerName}</p>}
    {message && <p role="status">{message}</p>}
    {data && folios.length === 0 && <p>Bu müşteri için uygun aktif oda hesabı yok. Konaklama ve hesabın para birimini kontrol edin.</p>}
    <div className="page-toolbar">
      <ActionButton onClick={() => onTransfer(selectedId)} disabled={busy || loading || !selected}>Oda Hesabına Aktar{selected?.roomNumber ? ` · Oda ${selected.roomNumber}` : ""}</ActionButton>

    </div>
  </div>;
}

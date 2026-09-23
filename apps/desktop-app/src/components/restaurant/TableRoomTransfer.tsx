import { useEffect, useState } from "react";
import type { DesktopTableOrder } from "../../../electron/database";
import type { DesktopRoomFolioData } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { formatMoney, getOrderCurrency } from "./table-presentation";

/** Target selection inside Table Workspace. Execution belongs to its guarded operation. */
export function TableRoomTransfer({ order, busy, onTransfer, onCancel }: {
  order: DesktopTableOrder; busy: boolean;
  onTransfer: (folioId: string) => void; onCancel: () => void;
}) {
  const [data, setData] = useState<DesktopRoomFolioData | null>(null);
  const [folioId, setFolioId] = useState("");
  const [message, setMessage] = useState("Oda hesapları yükleniyor...");
  const begin = useRequestGeneration();
  useEffect(() => {
    const current = begin();
    void window.yardimciDesktop?.getRoomFolioData().then(result => {
      if (!current()) return;
      setData(result); setMessage("");
    }).catch(() => { if (current()) setMessage("Açık oda hesapları okunamadı."); });
    return () => { begin(); };
  }, [begin]);
  const folios = data?.folios.filter(folio => folio.status === "open") ?? [];
  return <div className="form-stack">
    <p>Bu aktarım masa adisyonunu kapatır; tahsilat oda hesabı üzerinden yapılır.</p>
    <p>{order.tableName} · {formatMoney(order.total, getOrderCurrency(order))}</p>
    <label className="form-field">Oda hesabı
      <select aria-label="Oda hesabı" value={folioId} onChange={event => setFolioId(event.target.value)} disabled={busy}>
        <option value="">Oda hesabı seçin</option>
        {folios.map(folio => <option key={folio.id} value={folio.id}>
          {folio.roomNumber ? `Oda ${folio.roomNumber}` : folio.roomName} · {folio.customerName || "Misafir"}
        </option>)}
      </select>
    </label>
    {message && <p role="status">{message}</p>}
    {data && folios.length === 0 && <p>Açık oda hesabı yok. Önce Pansiyon üzerinden oda hesabını açın.</p>}
    <div className="page-toolbar">
      <ActionButton onClick={() => onTransfer(folioId)} disabled={busy || !folios.some(folio => folio.id === folioId)}>Aktarımı Onayla</ActionButton>
      <ActionButton variant="secondary" onClick={onCancel} disabled={busy}>Vazgeç</ActionButton>
    </div>
  </div>;
}

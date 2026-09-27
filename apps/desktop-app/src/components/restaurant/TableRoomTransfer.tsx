import { useEffect, useState } from "react";
import type { DesktopTableOrder } from "../../../electron/database";
import type { DesktopRoomFolioData } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { SearchSelect } from "../ui/SearchSelect";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { formatMoney, getOrderCurrency } from "./table-presentation";

/** Target selection inside Table Workspace. Execution belongs to its guarded operation. */
export function TableRoomTransfer({ order, busy, onTransfer, revision }: {
  order: DesktopTableOrder; busy: boolean;
  onTransfer: (folioId: string) => void; revision: number;
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
  }, [begin, revision]);
  const folios = data?.folios.filter(folio => folio.status === "open") ?? [];
  return <div className="operation-section form-stack" aria-label="Odaya yazdırma">
    <h4>Odaya yazdırma</h4>
    <p>Bu aktarım masa adisyonunu kapatır; tahsilat oda hesabı üzerinden yapılır.</p>
    <p>{order.tableName} · {formatMoney(order.total, getOrderCurrency(order))}</p>
    <div className="form-field form-field--fluid">
      <span>Oda hesabı</span>
      <SearchSelect
        ariaLabel="Oda hesabı"
        value={folioId}
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
    </div>
    {message && <p role="status">{message}</p>}
    {data && folios.length === 0 && <p>Açık oda hesabı yok. Önce Pansiyon üzerinden oda hesabını açın.</p>}
    <div className="page-toolbar">
      <ActionButton onClick={() => onTransfer(folioId)} disabled={busy || !folios.some(folio => folio.id === folioId)}>Odaya Yaz</ActionButton>

    </div>
  </div>;
}

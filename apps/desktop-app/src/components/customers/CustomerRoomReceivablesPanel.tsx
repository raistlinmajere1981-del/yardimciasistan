import { useCallback, useEffect, useMemo, useState } from "react";
import type { DesktopRoomFolio, DesktopRoomFolioData } from "../../../electron/room-folio";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";
import { RoomReceivablePaymentDialog } from "../finance/RoomReceivablePaymentDialog";
import { formatDateRange, minorMoney } from "../pension/folio-format";

export function CustomerRoomReceivablesPanel({ customerId }: { customerId: string }) {
  const [data, setData] = useState<DesktopRoomFolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DesktopRoomFolio | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await window.yardimciDesktop!.getRoomFolioData());
    } catch {
      reportAppStatus("error", "Konaklama alacakları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [customerId, reload]);

  const activeStayIds = useMemo(() => new Set((data?.activeStays ?? []).map(stay => stay.id)), [data?.activeStays]);
  const folios = useMemo(() => (data?.folios ?? []).filter(folio =>
    folio.customerId === customerId
    && folio.status === "open"
    && folio.remainingMinor > 0
    && !activeStayIds.has(folio.stayId)
  ), [activeStayIds, customerId, data?.folios]);
  const currencies = new Set(folios.map(folio => folio.currency));
  const total = folios.reduce((sum, folio) => sum + folio.remainingMinor, 0);

  if (!loading && folios.length === 0) return null;

  return <section className="panel customer-operation-card customer-room-receivables form-stack" aria-label="Konaklama alacakları">
    <div className="customer-operation-card__heading">
      <div><h3>Konaklama alacakları</h3><small>Çıkış sonrası açık kalan oda hesapları</small></div>
      {folios.length > 0 && <strong>{currencies.size === 1 ? minorMoney(total, folios[0]?.currency ?? "TRY") : `${folios.length} hesap`}</strong>}
    </div>
    {loading ? <p className="loading-state" role="status">Alacaklar yükleniyor…</p>
      : folios.length === 0 ? <p className="customer-operation-empty">Açık konaklama borcu yok.</p>
      : <div className="customer-room-receivable-list">
        {folios.map(folio => <article className="customer-room-receivable" key={folio.id}>
          <div>
            <strong>{folio.roomNumber ? `Oda ${folio.roomNumber}` : folio.roomName}</strong>
            <span>{formatDateRange(folio.checkInDate, folio.plannedCheckOutDate)}</span>
          </div>
          <b>{minorMoney(folio.remainingMinor, folio.currency)}</b>
          <ActionButton size="sm" onClick={() => setSelected(folio)}>Tahsil Et</ActionButton>
        </article>)}
      </div>}
    {selected && <RoomReceivablePaymentDialog
      folio={selected}
      onClose={() => setSelected(null)}
      onSaved={reload}
    />}
  </section>;
}

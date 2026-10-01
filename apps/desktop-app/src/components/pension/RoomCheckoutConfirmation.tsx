import type { DesktopCustomerRoomStay, DesktopRoomAccountSummary } from "../../../electron/database-types";
import { formatDateRange, minorMoney } from "./folio-format";

export function RoomCheckoutConfirmationDetails({ roomLabel, stay, account, showResult = true }: {
  roomLabel: string;
  stay: Pick<DesktopCustomerRoomStay, "customerName" | "guestCount" | "checkInDate" | "checkOutDate">;
  account?: Pick<DesktopRoomAccountSummary, "remainingMinor" | "currency">;
  showResult?: boolean;
}) {
  return <div className="form-stack">
    <dl className="operation-facts">
      <div><dt>Oda</dt><dd>{roomLabel}</dd></div>
      <div><dt>Misafir</dt><dd>{stay.customerName} · {stay.guestCount} kişi</dd></div>
      <div><dt>Konaklama</dt><dd>{formatDateRange(stay.checkInDate, stay.checkOutDate)}</dd></div>
      {account && <div><dt>Kalan hesap</dt><dd>{account.remainingMinor > 0 ? minorMoney(account.remainingMinor, account.currency) : "Ödendi"}</dd></div>}
      {showResult && <div><dt>Sonuç</dt><dd>Çıkış tamamlanır · oda temizlik bekler{account?.remainingMinor ? " · borç açık hesapta kalır" : account ? " · hesap kapanır" : ""}</dd></div>}
    </dl>
  </div>;
}

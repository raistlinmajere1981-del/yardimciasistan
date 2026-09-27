import { useState } from "react";
import type { DesktopCustomerRoomStay, DesktopRoomAccountSummary } from "../../../electron/database-types";
import type { RoomFolioPaymentMethod } from "../../../electron/room-folio";
import { ChoiceChips } from "../ui/ChoiceChips";
import { formatDateRange, minorMoney } from "./folio-format";

export function RoomCheckoutConfirmationDetails({ roomLabel, stay, account, onPaymentMethodChange }: {
  roomLabel: string;
  stay: Pick<DesktopCustomerRoomStay, "customerName" | "guestCount" | "checkInDate" | "checkOutDate">;
  account?: DesktopRoomAccountSummary;
  onPaymentMethodChange: (method: RoomFolioPaymentMethod) => void;
}) {
  const [method, setMethod] = useState<RoomFolioPaymentMethod>("cash");
  return <div className="form-stack">
    <dl className="operation-facts">
      <div><dt>Oda</dt><dd>{roomLabel}</dd></div>
      <div><dt>Misafir</dt><dd>{stay.customerName} · {stay.guestCount} kişi</dd></div>
      <div><dt>Konaklama</dt><dd>{formatDateRange(stay.checkInDate, stay.checkOutDate)}</dd></div>
      {account && <div><dt>Kalan hesap</dt><dd>{account.remainingMinor > 0 ? minorMoney(account.remainingMinor, account.currency) : "Ödendi"}</dd></div>}
      <div><dt>Sonuç</dt><dd>Çıkış tamamlanır · oda temizlik bekler{account ? " · hesap kapanır" : ""}</dd></div>
    </dl>
    {account && account.remainingMinor > 0 && <div className="form-field form-field--fluid">
      <span>Kalan tutarın ödeme yöntemi</span>
      <ChoiceChips
        ariaLabel="Çıkış ödeme yöntemi"
        value={method}
        onChange={value => { setMethod(value); onPaymentMethodChange(value); }}
        options={[
          { id: "cash", label: "Nakit" },
          { id: "card", label: "Kart" },
          { id: "bank", label: "Banka" },
          { id: "other", label: "Diğer" }
        ]}
      />
    </div>}
  </div>;
}

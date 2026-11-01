import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useMarketOrdersSession } from "../../apps/desktop-app/src/app/use-market-orders-session";
import { MarketOrdersWorkspace } from "../../apps/desktop-app/src/components/market/MarketOrdersWorkspace";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __orderBenefitsControls: {
    enabled(value: boolean): void;
    refreshAvailability(): void;
    hasSecret(): boolean;
    hasPending(): boolean;
    attemptChanges(orderId: string): void;
  };
};
function Harness() {
  const [visible, setVisible] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState("");
  const session = useMarketOrdersSession({ enabled: true, benefitsEnabled: enabled, onStateChange: (_state, message) => setStatus(message) });
  useEffect(() => {
    control.__orderBenefitsControls = { enabled: setEnabled, refreshAvailability: session.benefits.reloadAvailability,
      hasSecret: () => Boolean(session.benefits.coupon.current), hasPending: () => Boolean(session.benefits.pending.current),
      attemptChanges(orderId) {
        void session.openOrder(orderId);
        session.setSelectedOrder(null);
        session.setFulfillmentPayment("card");
        session.benefits.setPoints("0");
        session.benefits.setCoupon("");
        session.benefits.clear();
      } };
  }, [session]);
  return <>
    <nav><span role="status" data-testid="topbar-status">{status}</span>
      <button onClick={() => setVisible(value => !value)}>Görünümü değiştir</button>
      <button onClick={() => void session.reloadOrders(true)}>Siparişleri yeniden oku</button>
    </nav>
    {visible && <main style={{ height: "calc(100vh - 50px)" }}><div className="market-workspace market-workspace--orders" style={{ height: "100%" }}>
      <MarketOrdersWorkspace session={session} customerCreditEnabled busy={false} onStateChange={(_state, message) => setStatus(message)} />
    </div></main>}
  </>;
}
createRoot(document.getElementById("root")!).render(<Harness />);

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useMarketOrdersSession } from "../../apps/desktop-app/src/app/use-market-orders-session";
import { MarketOrdersWorkspace } from "../../apps/desktop-app/src/components/market/MarketOrdersWorkspace";
import "../../apps/desktop-app/src/styles/index.css";

function Harness() {
  const [visible, setVisible] = useState(true);
  const [status, setStatus] = useState("");
  const onStateChange = (_state: string, message: string) => setStatus(message);
  const session = useMarketOrdersSession({ enabled: true, onStateChange });
  return <>
    <nav><span role="status" data-testid="checkout-status">{status}</span>
      <button onClick={() => setVisible(value => !value)}>Görünümü değiştir</button>
      <button onClick={() => void session.reloadOrders(true)}>Siparişleri yeniden oku</button>
    </nav>
    {visible && <main style={{ height: "calc(100vh - 50px)" }}><div className="market-workspace market-workspace--orders" style={{ height: "100%" }}>
      <MarketOrdersWorkspace session={session} busy={false} onStateChange={onStateChange} />
    </div></main>}
  </>;
}
createRoot(document.getElementById("root")!).render(<Harness />);

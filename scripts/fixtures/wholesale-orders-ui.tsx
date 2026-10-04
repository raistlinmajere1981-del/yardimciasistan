import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import type {
  CatalogProduct,
  CommerceOrder,
  CommerceOrderDetail,
  CommerceOrderFulfillmentResult,
  CommerceResolvedUnitPrice
} from "../../packages/shared/index";
import type { DesktopCustomer } from "../../apps/desktop-app/electron/database";
import { MarketOrdersWorkspace } from "../../apps/desktop-app/src/components/market/MarketOrdersWorkspace";
import { useMarketController } from "../../apps/desktop-app/src/app/use-market-controller";
import "../../apps/desktop-app/src/styles/index.css";

type OrdersFixtureInitial = {
  customers: DesktopCustomer[];
  products: CatalogProduct[];
};

type OrdersFixtureControl = typeof window & {
  __woInitial: OrdersFixtureInitial;
  __woEmit: () => void;
  __woSetVisible: (visible: boolean) => void;
  __woListenerCount: () => number;
  __woDispose: () => void;
  __woPendingReads: () => number;
  __woCall: (method: string, args: unknown[]) => Promise<unknown>;
};

const control = window as OrdersFixtureControl;

let pendingReads = 0;
control.__woPendingReads = () => pendingReads;
async function read(method: string, args: unknown[]) {
  pendingReads++;
  try { return await control.__woCall(method, args); }
  finally { pendingReads--; }
}
const listeners = new Set<() => void>();
control.__woEmit = () => { for (const listener of listeners) listener(); };
control.__woListenerCount = () => listeners.size;
const commerceBridge = {
  onOrdersChanged: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  listOrders: (options?: unknown) =>
    read("listOrders", [options]) as Promise<CommerceOrder[]>,
  getOrder: (orderId: string) =>
    read("getOrder", [orderId]) as Promise<CommerceOrderDetail | null>,
  createOrder: (input: unknown) =>
    control.__woCall("createOrder", [input]) as Promise<CommerceOrderDetail>,
  updateOrderStatus: (input: unknown) =>
    control.__woCall("updateOrderStatus", [input]) as Promise<CommerceOrderDetail>,
  fulfillOrder: (input: unknown) =>
    control.__woCall("fulfillOrder", [input]) as Promise<CommerceOrderFulfillmentResult>,
  resolveProductPrice: (input: unknown) =>
    control.__woCall("resolveProductPrice", [input]) as Promise<CommerceResolvedUnitPrice>
};

Object.defineProperty(window, "yardimciDesktop", {
  configurable: true,
  value: { commerce: commerceBridge }
});

function Harness() {
  const [visible, setVisible] = useState(true);
  control.__woSetVisible = setVisible;
  const controller = useMarketController({ businessCapabilities: { businessId: "fixture", profileId: "market", capabilities: [], enabledCapabilities: [BUSINESS_CAPABILITIES.ORDERS] }, active: false });
  return (
    <main className="smoke-shell">
      {visible && <MarketOrdersWorkspace
        session={controller.ordersSession}
        customers={control.__woInitial.customers}
        products={control.__woInitial.products}
        busy={false}
        onStateChange={(state, message) => {
          document.body.dataset.lastState = state;
          document.body.dataset.lastMessage = message;
        }}
      />}
    </main>
  );
}

const root = createRoot(document.getElementById("root")!);
control.__woDispose = () => root.unmount();
root.render(
  <StrictMode>
    <Harness />
  </StrictMode>
);

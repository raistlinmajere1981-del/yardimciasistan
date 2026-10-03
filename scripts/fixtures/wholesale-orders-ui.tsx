import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type {
  CatalogProduct,
  CommerceOrder,
  CommerceOrderDetail,
  CommerceResolvedUnitPrice
} from "../../packages/shared/index";
import type { DesktopCustomer } from "../../apps/desktop-app/electron/database";
import { MarketOrdersWorkspace } from "../../apps/desktop-app/src/components/market/MarketOrdersWorkspace";
import "../../apps/desktop-app/src/styles/index.css";

type OrdersFixtureInitial = {
  customers: DesktopCustomer[];
  products: CatalogProduct[];
};

type OrdersFixtureControl = typeof window & {
  __woInitial: OrdersFixtureInitial;
  __woCall: (method: string, args: unknown[]) => Promise<unknown>;
};

const control = window as OrdersFixtureControl;

const commerceBridge = {
  listOrders: (options?: unknown) =>
    control.__woCall("listOrders", [options]) as Promise<CommerceOrder[]>,
  getOrder: (orderId: string) =>
    control.__woCall("getOrder", [orderId]) as Promise<CommerceOrderDetail | null>,
  createOrder: (input: unknown) =>
    control.__woCall("createOrder", [input]) as Promise<CommerceOrderDetail>,
  updateOrderStatus: (input: unknown) =>
    control.__woCall("updateOrderStatus", [input]) as Promise<CommerceOrderDetail>,
  resolveProductPrice: (input: unknown) =>
    control.__woCall("resolveProductPrice", [input]) as Promise<CommerceResolvedUnitPrice>
};

Object.defineProperty(window, "yardimciDesktop", {
  configurable: true,
  value: { commerce: commerceBridge }
});

function Harness() {
  return (
    <main className="smoke-shell">
      <MarketOrdersWorkspace
        customers={control.__woInitial.customers}
        products={control.__woInitial.products}
        busy={false}
        onStateChange={(state, message) => {
          document.body.dataset.lastState = state;
          document.body.dataset.lastMessage = message;
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
);

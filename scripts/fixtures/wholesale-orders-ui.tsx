import { catalogPageFixture } from "../test-helpers/catalog-page-fixture";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import type {
  CommerceShipment,
  CatalogProduct,
  CommerceOrder,
  CommerceOrderDetail,
  CommerceOrderFulfillmentResult,
  CommerceResolvedUnitPrice
} from "../../packages/shared/index";
import type { DesktopCustomer } from "../../apps/desktop-app/electron/database";
import { MarketPage } from "../../apps/desktop-app/src/pages/MarketPage";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import type { MarketView } from "../../apps/desktop-app/src/components/workspace/workspace-intent";
import { subscribeAppStatus } from "../../apps/desktop-app/src/app/runtime-state";
import { useEffect } from "react";
import { workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { useMarketController } from "../../apps/desktop-app/src/app/use-market-controller";
import "../../apps/desktop-app/src/styles/index.css";

type OrdersFixtureInitial = {
  view?: MarketView;
  customers: DesktopCustomer[];
  products: CatalogProduct[];
};

type OrdersFixtureControl = typeof window & {
  __woInitial: OrdersFixtureInitial;
  __woEmit: () => void;
  __woEmitShippingConfiguration: () => void;
  __woEmitShipment: (orderId: string) => void;
  __woShipmentListenerCount: () => number;
  __woSetVisible: (visible: boolean) => void;
  __woListenerCount: () => number;
  __woDispose: () => void;
  __woRefreshPrices: () => void;
  __woRejectNextCreate?: boolean;
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
const shipmentListeners = new Set<(orderId: string) => void>();
control.__woEmitShipment = (id) => { for (const listener of shipmentListeners) listener(id); };
control.__woShipmentListenerCount = () => shipmentListeners.size;
const shippingConfigListeners = new Set<() => void>();
control.__woEmitShippingConfiguration = () => { for (const listener of shippingConfigListeners) listener(); };
const commerceBridge = {
  listProducts: async (options = {}) => {
    const page = catalogPageFixture(control.__woInitial.products, options);
    for (const product of page.items) page.prices[product.id] = await control.__woCall("resolveProductPrice", [{ productId: product.id, customerId: (options as { customerId?: string }).customerId ?? "" }]) as CommerceResolvedUnitPrice;
    return page;
  },
  listCategories: () => Promise.resolve([]),
  getProductImageDataUrl: () => Promise.resolve(""),
  onShippingConfigurationChanged: (listener: () => void) => { shippingConfigListeners.add(listener); return () => { shippingConfigListeners.delete(listener); }; },
  onShipmentsChanged: (listener: (orderId: string) => void) => { shipmentListeners.add(listener); return () => { shipmentListeners.delete(listener); }; },
  onOrdersChanged: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getShippingProviderConfiguration: () => control.__woCall("getShippingProviderConfiguration", []) as Promise<import("../../packages/shared/index").ArasShippingConfiguration>,
  registerShipmentWithProvider: (shipmentId: string) => control.__woCall("registerShipmentWithProvider", [shipmentId]) as Promise<CommerceShipment>,
  refreshShipmentProviderStatus: (shipmentId: string) => control.__woCall("refreshShipmentProviderStatus", [shipmentId]) as Promise<CommerceShipment>,
  listShipmentsForOrder: (orderId: string) => read("listShipmentsForOrder", [orderId]) as Promise<CommerceShipment[]>,
  createShipmentForOrder: (orderId: string) => control.__woCall("createShipmentForOrder", [orderId]) as Promise<CommerceShipment>,
  updateShipmentStatus: (input: unknown) => control.__woCall("updateShipmentStatus", [input]) as Promise<CommerceShipment>,
  listOrders: (options?: unknown) =>
    read("listOrders", [options]) as Promise<CommerceOrder[]>,
  getOrder: (orderId: string) =>
    read("getOrder", [orderId]) as Promise<CommerceOrderDetail | null>,
  createOrder: async (input: unknown) => {
    if (control.__woRejectNextCreate) {
      control.__woRejectNextCreate = false;
      return { ok: false as const, expected: true as const, code: "invalid_order", message: "Sipariş indirimi geçersiz. Fixture doğrulaması." };
    }
    return { ok: true as const, value: await control.__woCall("createOrder", [input]) as CommerceOrderDetail };
  },
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
  const C = BUSINESS_CAPABILITIES;
  const snapshot = { businessId: "fixture", profileId: "market" as const, capabilities: [], enabledCapabilities: [C.CATALOG, C.SALES, C.CUSTOMERS, C.ORDERS, C.WHOLESALE] };
  const [view, setView] = useState<MarketView>(control.__woInitial.view ?? "orders");
  const controller = useMarketController({ businessCapabilities: snapshot, active: true });
  useEffect(() => subscribeAppStatus(({ state, message }) => {
    document.body.dataset.lastState = state;
    document.body.dataset.lastMessage = message;
  }), []);
  control.__woRefreshPrices = controller.quickSaleSession.refreshPrices;
  return <BusinessCapabilityRuntimeProvider value={{ snapshot }}><WorkspaceNavigationProvider definitions={workspaceDefinitions} page="market">
    <main className="smoke-shell">{visible && <MarketPage customers={control.__woInitial.customers} controller={controller} activeView={view} onViewChange={setView} />}</main>
  </WorkspaceNavigationProvider></BusinessCapabilityRuntimeProvider>;
}

const root = createRoot(document.getElementById("root")!);
control.__woDispose = () => root.unmount();
root.render(
  <StrictMode>
    <Harness />
  </StrictMode>
);

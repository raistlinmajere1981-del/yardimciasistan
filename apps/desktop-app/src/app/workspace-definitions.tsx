import { Suspense, lazy, type ComponentProps } from "react";
import type { CustomerWorkspace } from "../components/customers/CustomerWorkspace";
import type { ProductWorkspace } from "../components/market/ProductWorkspace";
import { roomWorkspaceDefinition } from "../components/pension/room-workspace-definition";
import { tableWorkspaceDefinition } from "../components/restaurant/table-workspace-definition";
import type { WorkspaceDefinition } from "../components/workspace/workspace-definition";
import type { CustomerWorkspaceIntent, ProductWorkspaceIntent } from "../components/workspace/workspace-intent";

export { roomWorkspaceDefinition } from "../components/pension/room-workspace-definition";
export { tableWorkspaceDefinition } from "../components/restaurant/table-workspace-definition";

const LazyCustomerWorkspace = lazy(() => import("../components/customers/CustomerWorkspace").then(module => ({ default: module.CustomerWorkspace })));
const LazyProductWorkspace = lazy(() => import("../components/market/ProductWorkspace").then(module => ({ default: module.ProductWorkspace })));

export const customerWorkspaceDefinition: WorkspaceDefinition<CustomerWorkspaceIntent, Omit<ComponentProps<typeof CustomerWorkspace>, "intent">> = {
  entityType: "customer",
  defaultPresentation: "centered",
  render: (intent, context) => <Suspense fallback={<p role="status">Müşteri bilgileri hazırlanıyor…</p>}><LazyCustomerWorkspace {...context} intent={intent} /></Suspense>
};

export const productWorkspaceDefinition: WorkspaceDefinition<ProductWorkspaceIntent, Omit<ComponentProps<typeof ProductWorkspace>, "intent">> = {
  entityType: "product",
  defaultPresentation: "centered",
  render: (intent, context) => <Suspense fallback={<p role="status">Ürün bilgileri hazırlanıyor…</p>}><LazyProductWorkspace {...context} intent={intent} /></Suspense>
};

export const workspaceDefinitions = [
  roomWorkspaceDefinition,
  tableWorkspaceDefinition,
  customerWorkspaceDefinition,
  productWorkspaceDefinition
] as const;

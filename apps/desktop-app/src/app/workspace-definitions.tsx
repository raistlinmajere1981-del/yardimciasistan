import type { ComponentProps } from "react";
import { CustomerWorkspace } from "../components/customers/CustomerWorkspace";
import { ProductWorkspace } from "../components/market/ProductWorkspace";
import { roomWorkspaceDefinition } from "../components/pension/room-workspace-definition";
import { tableWorkspaceDefinition } from "../components/restaurant/table-workspace-definition";
import type { WorkspaceDefinition } from "../components/workspace/workspace-definition";
import type { CustomerWorkspaceIntent, ProductWorkspaceIntent } from "../components/workspace/workspace-intent";

export { roomWorkspaceDefinition } from "../components/pension/room-workspace-definition";
export { tableWorkspaceDefinition } from "../components/restaurant/table-workspace-definition";

export const customerWorkspaceDefinition: WorkspaceDefinition<CustomerWorkspaceIntent, Omit<ComponentProps<typeof CustomerWorkspace>, "intent">> = {
  entityType: "customer",
  defaultPresentation: "centered",
  render: (intent, context) => <CustomerWorkspace {...context} intent={intent} />
};

export const productWorkspaceDefinition: WorkspaceDefinition<ProductWorkspaceIntent, Omit<ComponentProps<typeof ProductWorkspace>, "intent">> = {
  entityType: "product",
  defaultPresentation: "centered",
  render: (intent, context) => <ProductWorkspace {...context} intent={intent} />
};

export const workspaceDefinitions = [
  roomWorkspaceDefinition,
  tableWorkspaceDefinition,
  customerWorkspaceDefinition,
  productWorkspaceDefinition
] as const;

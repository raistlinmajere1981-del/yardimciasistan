import type { ComponentProps } from "react";
import { RoomWorkspace } from "../components/pension/RoomWorkspace";
import { TableWorkspace } from "../components/restaurant/TableWorkspace";
import { CustomerWorkspace } from "../components/customers/CustomerWorkspace";
import { MenuItemWorkspace } from "../components/menu/MenuItemWorkspace";
import { ProductWorkspace } from "../components/market/ProductWorkspace";
import type { WorkspaceDefinition } from "../components/workspace/workspace-definition";
import type { CustomerWorkspaceIntent, MenuItemWorkspaceIntent, ProductWorkspaceIntent, RoomWorkspaceIntent, TableWorkspaceIntent } from "../components/workspace/workspace-intent";

export const roomWorkspaceDefinition: WorkspaceDefinition<RoomWorkspaceIntent, Omit<ComponentProps<typeof RoomWorkspace>, "intent">> = {
  entityType: "room",
  defaultPresentation: "centered",
  render: (intent, context) => <RoomWorkspace {...context} intent={intent} />
};

export const tableWorkspaceDefinition: WorkspaceDefinition<TableWorkspaceIntent, Omit<ComponentProps<typeof TableWorkspace>, "intent">> = {
  entityType: "table",
  defaultPresentation: "full-canvas",
  render: (intent, context) => <TableWorkspace {...context} intent={intent} />
};

export const customerWorkspaceDefinition: WorkspaceDefinition<CustomerWorkspaceIntent, Omit<ComponentProps<typeof CustomerWorkspace>, "intent">> = {
  entityType: "customer",
  defaultPresentation: "centered",
  render: (intent, context) => <CustomerWorkspace {...context} intent={intent} />
};

export const menuItemWorkspaceDefinition: WorkspaceDefinition<MenuItemWorkspaceIntent, Omit<ComponentProps<typeof MenuItemWorkspace>, "intent">> = {
  entityType: "menu-item",
  defaultPresentation: "centered",
  render: (intent, context) => <MenuItemWorkspace {...context} intent={intent} />
};

export const productWorkspaceDefinition: WorkspaceDefinition<ProductWorkspaceIntent, Omit<ComponentProps<typeof ProductWorkspace>, "intent">> = {
  entityType: "product",
  defaultPresentation: "centered",
  render: (intent, context) => <ProductWorkspace {...context} intent={intent} />
};

export const workspaceDefinitions = [roomWorkspaceDefinition, tableWorkspaceDefinition, customerWorkspaceDefinition, menuItemWorkspaceDefinition, productWorkspaceDefinition] as const;

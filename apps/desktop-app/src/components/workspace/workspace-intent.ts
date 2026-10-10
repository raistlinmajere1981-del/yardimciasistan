import type { DesktopPage } from "../../app/navigation";

// Explicit entity intents; mode/action and extra payloads remain leaf-owned.
export interface RoomWorkspaceIntent {
  entityType: "room";
  entityId: string;
  mode?: "summary" | "stay" | "account" | "history";
  action?: "payment" | "create-stay" | "check-in" | "linked-stay";
  stayId?: string;
  folioId?: string;
  reservationId?: string;
  customerId?: string;
  returnContext?: WorkspaceReturnContext;
}

export interface TableWorkspaceIntent {
  entityType: "table";
  entityId: string;
  mode?: "order" | "customer" | "account" | "history";
  action?: "room-transfer";
  orderId?: string;
  returnContext?: WorkspaceReturnContext;
}

type CustomerWorkspaceMode = "main" | "history";

export interface CustomerWorkspaceIntent {
  entityType: "customer";
  entityId: string;
  mode?: CustomerWorkspaceMode;
  action?: undefined;
  returnContext?: WorkspaceReturnContext;
}

type ProductWorkspaceMode = "details" | "history";

export interface ProductWorkspaceIntent {
  entityType: "product";
  entityId: string;
  menuEntryId?: string;
  mode?: ProductWorkspaceMode;
  action?: undefined;
  returnContext?: WorkspaceReturnContext;
}

export type WorkspaceIntent = RoomWorkspaceIntent | TableWorkspaceIntent | CustomerWorkspaceIntent | ProductWorkspaceIntent;

export type WorkspaceModeUpdate = {
  [Entity in WorkspaceIntent["entityType"]]: Pick<Extract<WorkspaceIntent, { entityType: Entity }>, "entityType" | "mode" | "action">
}[WorkspaceIntent["entityType"]];

type PensionView = "rooms" | "reservations" | "daily-tasks";
type RestaurantView = "floor" | "reservations" | "daily-tasks";
export type MarketView = "quickSale" | "products" | "orders" | "phoneCarts" | "inventory" | "purchasing" | "labels";

/** View names belong to their originating page, independently of the entity opened. */
export type WorkspaceReturnContext = (
  | { page: "pension"; view?: PensionView }
  | { page: "restaurant"; view?: RestaurantView }
  | { page: "market"; view?: MarketView }
  | { page?: Exclude<DesktopPage, "pension" | "restaurant" | "market">; view?: never }
) & { entityId?: string };

export type WorkspacePresentation = "centered" | "full-canvas";

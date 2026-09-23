import type { DesktopPage } from "../../app/navigation";

// Explicit entity intents; mode/action and extra payloads remain leaf-owned.
export interface RoomWorkspaceIntent {
  entityType: "room";
  entityId: string;
  mode?: "summary" | "stay" | "account" | "history";
  action?: "payment" | "assign-reservation" | "create-stay";
  customerId?: string;
  returnContext?: WorkspaceReturnContext;
}

export interface TableWorkspaceIntent {
  entityType: "table";
  entityId: string;
  mode?: "order" | "customer" | "account" | "history";
  action?: "room-transfer";
  returnContext?: WorkspaceReturnContext;
}

export type CustomerWorkspaceMode = "summary" | "details" | "history" | "account";

export interface CustomerWorkspaceIntent {
  entityType: "customer";
  entityId: string;
  mode?: CustomerWorkspaceMode;
  action?: undefined;
  returnContext?: WorkspaceReturnContext;
}

export type WorkspaceIntent = RoomWorkspaceIntent | TableWorkspaceIntent | CustomerWorkspaceIntent;

export type WorkspaceModeUpdate = {
  [Entity in WorkspaceIntent["entityType"]]: Pick<Extract<WorkspaceIntent, { entityType: Entity }>, "entityType" | "mode" | "action">
}[WorkspaceIntent["entityType"]];

export type PensionView = "rooms" | "reservations" | "daily-tasks";
export type RestaurantView = "floor" | "reservations" | "daily-tasks";

/** View names belong to their originating page, independently of the entity opened. */
export type WorkspaceReturnContext = (
  | { page: "pension"; view?: PensionView }
  | { page: "restaurant"; view?: RestaurantView }
  | { page?: Exclude<DesktopPage, "pension" | "restaurant">; view?: never }
) & { entityId?: string };

export type WorkspacePresentation = "centered" | "full-canvas";

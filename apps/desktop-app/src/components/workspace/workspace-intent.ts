import type { DesktopPage } from "../../app/navigation";

// Explicit pilot intents; no entity registry.
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

export type WorkspaceIntent = RoomWorkspaceIntent | TableWorkspaceIntent;

export interface WorkspaceReturnContext {
  page?: DesktopPage;
  view?: "rooms" | "reservations" | "daily-tasks" | "floor";
  entityId?: string;
}

export type WorkspacePresentation = "centered" | "full-canvas";

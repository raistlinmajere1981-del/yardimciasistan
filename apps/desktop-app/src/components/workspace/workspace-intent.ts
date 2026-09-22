import type { DesktopPage } from "../../app/navigation";

// Only the first pilot's entry contract. Add discriminated variants with real consumers.
export interface WorkspaceIntent {
  entityType: "room";
  entityId: string;
  mode?: "summary" | "stay" | "account" | "history";
  action?: "payment" | "assign-reservation" | "create-stay";
  customerId?: string;
  returnContext?: WorkspaceReturnContext;
}

export interface WorkspaceReturnContext {
  page?: DesktopPage;
  view?: "rooms" | "reservations" | "daily-tasks";
  entityId?: string;
}

export type WorkspacePresentation = "centered" | "full-canvas";

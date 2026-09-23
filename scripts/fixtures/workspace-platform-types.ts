// Compiled by smoke:workspace-platform, never executed in the renderer.
import type { WorkspaceIntent, WorkspaceReturnContext, WorkspaceModeUpdate } from "../../apps/desktop-app/src/components/workspace/workspace-intent";
import { roomWorkspaceDefinition, tableWorkspaceDefinition } from "../../apps/desktop-app/src/app/workspace-definitions";
import type { WorkspaceDefinition } from "../../apps/desktop-app/src/components/workspace/workspace-definition";

export function intentContracts(intent: WorkspaceIntent) {
  if (intent.entityType === "room") {
    const action: "payment" | "assign-reservation" | "create-stay" | undefined = intent.action;
    const customer: string | undefined = intent.customerId;
    return { action, customer };
  }
  const action: "room-transfer" | undefined = intent.action;
  // @ts-expect-error Table intent cannot acquire the Room-specific payload.
  const _customer = intent.customerId;
  return { action };
}

export const validReturns: WorkspaceReturnContext[] = [
  { page: "pension", view: "rooms" }, { page: "restaurant", view: "floor" },
  { page: "pension", view: "reservations" }, { page: "restaurant", view: "daily-tasks" },
  { page: "customerWork", entityId: "customer" }, { entityId: "selection" }
];
// @ts-expect-error Unknown entities require an explicit new leaf intent.
export const unknown: WorkspaceIntent = { entityType: "unknown", entityId: "1" };
// @ts-expect-error Room cannot request a Table action.
export const wrongAction: WorkspaceIntent = { entityType: "room", entityId: "1", action: "room-transfer" };
// @ts-expect-error Room cannot request a Table mode.
export const wrongMode: WorkspaceModeUpdate = { entityType: "room", mode: "order" };
// @ts-expect-error Pension views cannot contain Floor.
export const wrongPensionView: WorkspaceReturnContext = { page: "pension", view: "floor" };
// @ts-expect-error Restaurant views cannot contain Rooms.
export const wrongRestaurantView: WorkspaceReturnContext = { page: "restaurant", view: "rooms" };
// @ts-expect-error A page is required when specifying a view.
export const missingPage: WorkspaceReturnContext = { view: "rooms" };
// @ts-expect-error A definition's renderer must accept its entity leaf.
export const wrongRenderer: WorkspaceDefinition<Extract<WorkspaceIntent, { entityType: "table" }>, Parameters<typeof roomWorkspaceDefinition.render>[1]> = { ...tableWorkspaceDefinition, render: roomWorkspaceDefinition.render };

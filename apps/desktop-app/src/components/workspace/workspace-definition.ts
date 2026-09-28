import type { ReactNode } from "react";
import type { DesktopPage } from "../../app/navigation";
import type { WorkspaceIntent, WorkspacePresentation } from "./workspace-intent";

export type WorkspaceSessionPage = Extract<DesktopPage, "pension" | "restaurant">;

/** Static application composition. Navigation consumes only this metadata. */
export interface WorkspaceDefinitionMetadata {
  entityType: WorkspaceIntent["entityType"];
  defaultPresentation: WorkspacePresentation;
  /** Page-owned sessions stay mounted while navigating elsewhere. Omit for transient modal workspaces. */
  sessionPage?: WorkspaceSessionPage;
}

export interface WorkspaceDefinition<I extends WorkspaceIntent, Context> extends WorkspaceDefinitionMetadata {
  entityType: I["entityType"];
  render: (intent: I, context: Context) => ReactNode;
}

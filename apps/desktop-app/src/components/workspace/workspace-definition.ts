import type { ReactNode } from "react";
import type { WorkspaceIntent, WorkspacePresentation } from "./workspace-intent";

/** Static application composition. Navigation consumes only this metadata. */
export interface WorkspaceDefinitionMetadata {
  entityType: WorkspaceIntent["entityType"];
  defaultPresentation: WorkspacePresentation;
}

export interface WorkspaceDefinition<I extends WorkspaceIntent, Context> extends WorkspaceDefinitionMetadata {
  entityType: I["entityType"];
  render: (intent: I, context: Context) => ReactNode;
}

import type { ComponentProps } from "react";
import type { WorkspaceDefinition } from "../workspace/workspace-definition";
import type { TableWorkspaceIntent } from "../workspace/workspace-intent";
import { TableWorkspace } from "./TableWorkspace";

export const tableWorkspaceDefinition: WorkspaceDefinition<
  TableWorkspaceIntent,
  Omit<ComponentProps<typeof TableWorkspace>, "intent">
> = {
  entityType: "table",
  defaultPresentation: "centered",
  sessionPage: "restaurant",
  render: (intent, context) => <TableWorkspace {...context} intent={intent} />
};

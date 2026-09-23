import type { ComponentProps } from "react";
import { RoomWorkspace } from "../components/pension/RoomWorkspace";
import { TableWorkspace } from "../components/restaurant/TableWorkspace";
import type { WorkspaceDefinition } from "../components/workspace/workspace-definition";
import type { RoomWorkspaceIntent, TableWorkspaceIntent } from "../components/workspace/workspace-intent";

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

export const workspaceDefinitions = [roomWorkspaceDefinition, tableWorkspaceDefinition] as const;

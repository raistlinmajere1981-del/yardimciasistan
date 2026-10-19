import type { ComponentProps } from "react";
import type { WorkspaceDefinition } from "../workspace/workspace-definition";
import type { RoomWorkspaceIntent } from "../workspace/workspace-intent";
import { RoomWorkspace } from "./RoomWorkspace";

export const roomWorkspaceDefinition: WorkspaceDefinition<
  RoomWorkspaceIntent,
  Omit<ComponentProps<typeof RoomWorkspace>, "intent">
> = {
  entityType: "room",
  defaultPresentation: "centered",
  sessionPage: "pension",
  render: (intent, context) => <RoomWorkspace {...context} intent={intent} />
};

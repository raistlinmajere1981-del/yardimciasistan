import { Suspense, lazy, type ComponentProps } from "react";
import type { WorkspaceDefinition } from "../workspace/workspace-definition";
import type { RoomWorkspaceIntent } from "../workspace/workspace-intent";
import type { RoomWorkspace } from "./RoomWorkspace";

const LazyRoomWorkspace = lazy(() => import("./RoomWorkspace").then(module => ({ default: module.RoomWorkspace })));

export const roomWorkspaceDefinition: WorkspaceDefinition<
  RoomWorkspaceIntent,
  Omit<ComponentProps<typeof RoomWorkspace>, "intent">
> = {
  entityType: "room",
  defaultPresentation: "centered",
  sessionPage: "pension",
  render: (intent, context) => <Suspense fallback={<p role="status">Oda bilgileri hazırlanıyor…</p>}><LazyRoomWorkspace {...context} intent={intent} /></Suspense>
};

import { Suspense, lazy, type ComponentProps } from "react";
import type { WorkspaceDefinition } from "../workspace/workspace-definition";
import type { TableWorkspaceIntent } from "../workspace/workspace-intent";
import type { TableWorkspace } from "./TableWorkspace";

const LazyTableWorkspace = lazy(() => import("./TableWorkspace").then(module => ({ default: module.TableWorkspace })));

export const tableWorkspaceDefinition: WorkspaceDefinition<
  TableWorkspaceIntent,
  Omit<ComponentProps<typeof TableWorkspace>, "intent">
> = {
  entityType: "table",
  defaultPresentation: "centered",
  sessionPage: "restaurant",
  render: (intent, context) => <Suspense fallback={<p role="status">Masa bilgileri hazırlanıyor…</p>}><LazyTableWorkspace {...context} intent={intent} /></Suspense>
};

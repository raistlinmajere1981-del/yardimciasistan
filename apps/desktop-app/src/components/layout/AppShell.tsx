import type { ReactNode, RefObject } from "react";

import { WorkspaceCanvasContext, WorkspaceScaleContext } from "../workspace/WorkspaceFrame";

interface AppShellProps {
  contentScroll?: "page" | "workspace";
  sidebar: ReactNode;
  sidebarCollapsed?: boolean;
  header: ReactNode;
  children: ReactNode;
  contentRef?: RefObject<HTMLElement | null>;
  workspaceLayer?: ReactNode;
  workspaceActive?: boolean;
  overlay?: ReactNode;
  uiScale?: number;
}

export function AppShell({ contentScroll = "page", sidebar, sidebarCollapsed = false, header, children, contentRef,
  workspaceLayer, workspaceActive = false, overlay, uiScale = 1 }: AppShellProps) {
  return (
    <WorkspaceScaleContext.Provider value={uiScale}><WorkspaceCanvasContext.Provider value={contentRef ?? null}>
      <div className={sidebarCollapsed ? "desktop-shell is-sidebar-collapsed" : "desktop-shell"}>
        {sidebar}
        <main className={`content page${contentScroll === "workspace" ? " content--workspace" : ""}`} ref={contentRef} tabIndex={-1} data-workspace-return-focus>
          {header}
          <div className={workspaceActive ? "page-content is-workspace-active" : "page-content"}>
            {children}
            {workspaceLayer && <div className="persistent-workspace-layer">{workspaceLayer}</div>}
          </div>
        </main>
        {overlay}
      </div>
    </WorkspaceCanvasContext.Provider></WorkspaceScaleContext.Provider>
  );
}

import type { ReactNode, RefObject } from "react";

import { WorkspaceCanvasContext } from "../workspace/WorkspaceFrame";

interface AppShellProps {
  sidebar: ReactNode;
  sidebarCollapsed?: boolean;
  header: ReactNode;
  children: ReactNode;
  contentRef?: RefObject<HTMLElement | null>;
  overlay?: ReactNode;
}

export function AppShell({ sidebar, sidebarCollapsed = false, header, children, contentRef, overlay }: AppShellProps) {
  return (
    <WorkspaceCanvasContext.Provider value={contentRef ?? null}>
      <div className={sidebarCollapsed ? "desktop-shell is-sidebar-collapsed" : "desktop-shell"}>
        {sidebar}
        <main className="content page" ref={contentRef} tabIndex={-1} data-workspace-return-focus>
          {header}
          <div className="page-content">{children}</div>
        </main>
        {overlay}
      </div>
    </WorkspaceCanvasContext.Provider>
  );
}

import type { ReactNode, Ref } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  sidebarCollapsed?: boolean;
  header: ReactNode;
  children: ReactNode;
  contentRef?: Ref<HTMLElement>;
  overlay?: ReactNode;
}

export function AppShell({ sidebar, sidebarCollapsed = false, header, children, contentRef, overlay }: AppShellProps) {
  return (
    <div className={sidebarCollapsed ? "desktop-shell is-sidebar-collapsed" : "desktop-shell"}>
      {sidebar}
      <main className="content page" ref={contentRef}>
        {header}
        <div className="page-content">{children}</div>
      </main>
      {overlay}
    </div>
  );
}

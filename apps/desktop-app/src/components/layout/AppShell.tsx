import type { ReactNode, Ref } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  contentRef?: Ref<HTMLElement>;
  overlay?: ReactNode;
}

export function AppShell({ sidebar, header, children, contentRef, overlay }: AppShellProps) {
  return (
    <div className="desktop-shell">
      {sidebar}
      <main className="content" ref={contentRef}>
        {header}
        <div className="page-content">{children}</div>
      </main>
      {overlay}
    </div>
  );
}

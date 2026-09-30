import type { ReactNode } from "react";

interface OperationsBoardPane {
  title: string;
  toolbar?: ReactNode;
  content: ReactNode;
  ariaLabel?: string;
}

interface OperationsBoardLayoutProps {
  left?: OperationsBoardPane | null;
  center: OperationsBoardPane;
  right?: OperationsBoardPane | null;
}

function OperationsBoardPaneView({
  pane,
  position
}: {
  pane: OperationsBoardPane;
  position: "left" | "center" | "right";
}) {
  return (
    <section
      className={`operations-board__pane operations-board__pane--${position}`}
      aria-label={pane.ariaLabel ?? pane.title}
    >
      <header className="operations-board__pane-header">
        <h2>{pane.title}</h2>
        {pane.toolbar && <div className="operations-board__pane-toolbar">{pane.toolbar}</div>}
      </header>
      <div className="operations-board__pane-body">{pane.content}</div>
    </section>
  );
}

/**
 * Shared hospitality operations canvas.
 * Domain components own their data/actions; this component owns only pane geometry and scrolling.
 */
export function OperationsBoardLayout({ left, center, right }: OperationsBoardLayoutProps) {
  const layout = left && right ? "three" : left ? "left-center" : right ? "center-right" : "center";
  return (
    <div className={`operations-board operations-board--${layout}`}>
      {left && <OperationsBoardPaneView pane={left} position="left" />}
      <OperationsBoardPaneView pane={center} position="center" />
      {right && <OperationsBoardPaneView pane={right} position="right" />}
    </div>
  );
}

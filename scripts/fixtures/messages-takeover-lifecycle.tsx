import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CustomerMessagesWorkspace } from "../../apps/desktop-app/src/components/customers/CustomerMessagesWorkspace";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __m8eTakeoverSetActive?: (active: boolean) => void;
};

function Harness() {
  const [active, setActive] = useState(true);
  control.__m8eTakeoverSetActive = setActive;

  return (
    <CustomerMessagesWorkspace
      safeMode={() => <div data-testid="safe-surface">safe</div>}
      webMode={() => <div data-testid="web-surface">web</div>}
      whatsappEnabled
      prewarmWebview
      active={active}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);

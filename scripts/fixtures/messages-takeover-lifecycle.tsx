import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MessagesPage } from "../../apps/desktop-app/src/pages/MessagesPage";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __m8eTakeoverSetActive?: (active: boolean) => void;
};

function Harness() {
  const [active, setActive] = useState(true);
  control.__m8eTakeoverSetActive = setActive;

  return (
    <MessagesPage
      safeMode={<div data-testid="safe-surface">safe</div>}
      webMode={() => <div data-testid="web-surface">web</div>}
      aiTools={null}
      aiEnabled={false}
      whatsappEnabled
      automaticWebviewRequired={false}
      aiOpen={false}
      active={active}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);

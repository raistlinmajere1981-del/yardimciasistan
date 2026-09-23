import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import { useFinanceController } from "../../apps/desktop-app/src/app/use-finance-controller";
import { FinanceWorkspace } from "../../apps/desktop-app/src/components/finance/FinanceWorkspace";
import "../../apps/desktop-app/src/styles/index.css";

type HarnessPage = "finance" | "other";

const control = window as typeof window & {
  __financeInitial: { snapshot: BusinessCapabilitySnapshot };
  __financeHarness?: {
    controller: ReturnType<typeof useFinanceController>;
    setPage: (page: HarnessPage) => void;
    setCapability: (capability: BusinessCapability, enabled: boolean) => void;
  };
};

function Harness() {
  const [page, setPage] = useState<HarnessPage>("finance");
  const [snapshot, setSnapshot] = useState(control.__financeInitial.snapshot);
  const controller = useFinanceController({
    businessCapabilities: snapshot,
    active: page === "finance",
    enabled: true
  });

  control.__financeHarness = {
    controller,
    setPage,
    setCapability: (capability, enabled) => {
      setSnapshot((current) => {
        const next = new Set(current.enabledCapabilities);
        if (enabled) next.add(capability);
        else next.delete(capability);
        return {
          ...current,
          enabledCapabilities: [...next],
          capabilities: current.capabilities.map((item) => item.capability === capability
            ? { ...item, enabled }
            : item)
        };
      });
    }
  };

  return (
    <main>
      <nav aria-label="Finance test navigation">
        <button type="button" onClick={() => setPage("finance")}>Kasa</button>
        <button type="button" onClick={() => setPage("other")}>Diğer</button>
      </nav>
      {page === "finance"
        ? controller.financeEnabled
          ? <FinanceWorkspace controller={controller} />
          : <section aria-label="Finance kapalı"><h1>Kasa kapalı</h1></section>
        : <section aria-label="Diğer sayfa"><h1>Diğer</h1></section>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);

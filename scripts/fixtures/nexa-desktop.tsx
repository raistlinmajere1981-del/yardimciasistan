import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "lucide-react";
import { Sidebar } from "../../apps/desktop-app/src/components/layout/Sidebar";
import { useDashboardAi } from "../../apps/desktop-app/src/app/use-dashboard-ai";
import { observeNexaAi } from "../../apps/desktop-app/src/app/nexa-activity";
import type { DesktopPage } from "../../apps/desktop-app/src/app/navigation";
import "../../apps/desktop-app/src/styles/index.css";

const ids: DesktopPage[] = ["dashboard", "customerWork", "pension", "restaurant", "market", "menu", "campaigns", "marketing", "calendar", "reports", "settings"];
function Harness() {
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState<DesktopPage>("dashboard");
  const ai = useDashboardAi(true);
  return <div className={collapsed ? "desktop-shell is-sidebar-collapsed" : "desktop-shell"}>
    <Sidebar items={ids.map((id) => ({ id, label: id === "settings" ? "Ayarlar" : id, icon: Home }))}
      activePage={page} onNavigate={setPage} collapsed={collapsed} onToggleCollapsed={() => setCollapsed(!collapsed)} />
    <main><button onClick={() => void ai.generateDailyEvaluation()}>AI cevabı iste</button>
      <button onClick={() => void observeNexaAi(async () => ({ ok: true }), "success")}>AI işlemini doğrula</button>
      <p data-testid="selected-page">{page}</p><p data-testid="ai-result">{ai.content || ai.message}</p>
    </main>
  </div>;
}
document.documentElement.dataset.colorScheme = "light";
document.documentElement.dataset.motion = "system";
createRoot(document.getElementById("root")!).render(<Harness />);

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "lucide-react";
import { Sidebar } from "../../apps/desktop-app/src/components/layout/Sidebar";
import { useDashboardAi } from "../../apps/desktop-app/src/app/use-dashboard-ai";
import { observeNexaAi } from "../../apps/desktop-app/src/app/nexa-activity";
import type { DesktopPage } from "../../apps/desktop-app/src/app/navigation";
import { SpeechTextField } from "../../apps/desktop-app/src/components/speech/SpeechTextField";
import { FormDialog } from "../../apps/desktop-app/src/components/ui/FormDialog";
import "../../apps/desktop-app/src/styles/index.css";

const ids: DesktopPage[] = ["dashboard", "customerWork", "pension", "restaurant", "market", "menu", "campaigns", "marketing", "calendar", "reports", "settings"];
function Harness() {
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState<DesktopPage>("dashboard");
  const [editor, setEditor] = useState(false);
  const [text, setText] = useState("");
  const ai = useDashboardAi(true);
  return <div className={collapsed ? "desktop-shell is-sidebar-collapsed" : "desktop-shell"}>
    <Sidebar items={ids.map((id) => ({ id, label: id === "settings" ? "Ayarlar" : id, icon: Home }))}
      activePage={page} onNavigate={setPage} collapsed={collapsed} onToggleCollapsed={() => setCollapsed(!collapsed)} />
    <main><button onClick={() => void ai.generateDailyEvaluation()}>AI cevabı iste</button>
      <button onClick={() => void observeNexaAi(async () => ({ ok: true }), "success")}>AI işlemini doğrula</button>
      <button onClick={() => setEditor(true)}>Dikte editörünü aç</button>
      {editor && <FormDialog title="Dikte editörü" onClose={() => setEditor(false)} onSubmit={event => event.preventDefault()} footer={null}>
        <SpeechTextField label="Not" value={text} onChange={setText} rows={3} maxLength={500} />
      </FormDialog>}
      <p data-testid="selected-page">{page}</p><p data-testid="ai-result">{ai.content || ai.message}</p>
    </main>
  </div>;
}
document.documentElement.dataset.colorScheme = "light";
document.documentElement.dataset.motion = "system";
createRoot(document.getElementById("root")!).render(<Harness />);

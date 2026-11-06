import type { RegisterPageLeaveGuard } from "../app/page-navigation-guard";
import { CommerceBenefitsWorkspace } from "../components/marketing/CommerceBenefitsWorkspace";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";

export function BenefitsPage({ enabled, onMessage, registerPageLeaveGuard }: {
  enabled: boolean; onMessage?: (message: string) => void; registerPageLeaveGuard?: RegisterPageLeaveGuard;
}) {
  return <FeatureWorkspacePage label="İndirim ve Puan" bodyLabel="İndirim ve Puan çalışma alanı" layout="fill">
    {enabled ? <CommerceBenefitsWorkspace {...(onMessage ? { onMessage } : {})} {...(registerPageLeaveGuard ? { registerPageLeaveGuard } : {})} />
      : <p>İndirim ve Puan bu işletmede etkin değil.</p>}
  </FeatureWorkspacePage>;
}

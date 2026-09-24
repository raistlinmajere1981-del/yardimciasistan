import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import { defaultSetupData } from "../../apps/desktop-app/src/app/bootstrap-defaults";
import type { CapabilityCondition } from "../../apps/desktop-app/src/app/capability-condition";
import { buildNavigationFromContributions, type NavigationContribution } from "../../apps/desktop-app/src/app/navigation";
import { StagedSettingsContributionSlot, type SettingsSectionContribution } from "../../apps/desktop-app/src/app/settings-section-contributions";
import { toSetupForm } from "../../apps/desktop-app/src/app/setup-model";
import { pensionNavigationContribution } from "../../apps/desktop-app/src/components/pension/pension-navigation";
import { roomWorkspaceDefinition } from "../../apps/desktop-app/src/components/pension/room-workspace-definition";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import "../../apps/desktop-app/src/styles/index.css";

const testNavigationContribution = {
  pageId: "pension",
  icon: pensionNavigationContribution.icon,
  order: 35,
  condition: { allOf: [C.ACCOMMODATION_ROOMS] },
  contentScroll: "workspace",
  presentation: {
    label: "Test Konaklama",
    eyebrow: "Test",
    title: "Test Konaklama",
    description: "Canonical Pension page reuse fixture."
  }
} satisfies NavigationContribution;

const testSettingsContribution: SettingsSectionContribution<"operations"> = {
  definition: {
    id: "settings-test-room-contribution",
    category: "operations",
    title: "Test Oda Katkısı",
    keywords: "test oda contribution",
    persistence: "staged",
    condition: { allOf: [C.ACCOMMODATION_ROOMS] }
  },
  render: ({ draft, onChange }) => (
    <label className="form-field form-field--short">
      Test oda sayısı
      <input
        aria-label="Test oda sayısı"
        value={draft.roomCount}
        onChange={(event) => onChange({ roomCount: event.target.value })}
      />
    </label>
  )
};

// @ts-expect-error Operations contributions cannot write Business-owned fields.
const invalidOperationsPatch: Parameters<Parameters<typeof testSettingsContribution.render>[0]["onChange"]>[0] = { businessName: "cross-category-write" };
// @ts-expect-error Capability groups are deliberately non-empty.
const invalidEmptyCondition: CapabilityCondition = { allOf: [] };
// @ts-expect-error anyOf only accepts capability leaves or one allOf group.
const invalidRecursiveCondition: CapabilityCondition = { anyOf: [{ anyOf: [C.AI] }] };

export const testFeatureComposition = {
  navigation: testNavigationContribution,
  settings: [testSettingsContribution],
  workspace: roomWorkspaceDefinition
} as const;

function ContributionFixture() {
  const navigation = useWorkspaceNavigation();
  const [form, setForm] = useState(() => ({ ...toSetupForm(defaultSetupData), roomCount: "2" }));
  const [data, setData] = useState(window.fixtureDashboard);
  const runtimeSnapshot = {
    profileId: "pension",
    enabledCapabilities: [C.ACCOMMODATION_ROOMS]
  };
  const items = buildNavigationFromContributions(runtimeSnapshot, [testFeatureComposition.navigation]);
  window.fixtureRoomCount = () => form.roomCount;

  return <AppShell
    contentScroll="workspace"
    sidebar={<aside className="sidebar">Stage 9 fixture</aside>}
    header={<header className="page-header"><h1>Test Feature</h1></header>}
    overlay={<WorkspaceHost
      definition={testFeatureComposition.workspace}
      context={{ data, onDashboard: setData, ...window.fixtureCapabilities }}
    />}
  >
    <section aria-label="Test feature katkıları" className="form-stack">
      <nav aria-label="Test feature navigation">
        {items.map((item) => <button type="button" key={item.id}>{item.label}</button>)}
      </nav>
      <StagedSettingsContributionSlot
        category="operations"
        form={form}
        onFormChange={setForm}
        busy={false}
        configurationCapabilities={[C.ACCOMMODATION_ROOMS]}
        initialized
        runtimeSnapshot={runtimeSnapshot}
        contributions={testFeatureComposition.settings}
      />
      <button
        type="button"
        onClick={() => navigation.openWorkspace({
          entityType: "room",
          entityId: "room-101",
          mode: "summary",
          returnContext: { page: "pension", view: "rooms" }
        })}
      >
        Test oda çalışma alanını aç
      </button>
      <output aria-label="Test oda sayısı sonucu">{form.roomCount}</output>
    </section>
  </AppShell>;
}

function Fixture() {
  return <WorkspaceNavigationProvider
    definitions={[testFeatureComposition.workspace]}
    page="pension"
  >
    <ContributionFixture />
  </WorkspaceNavigationProvider>;
}

void invalidOperationsPatch;
void invalidEmptyCondition;
void invalidRecursiveCondition;

createRoot(document.getElementById("root")!).render(<Fixture />);

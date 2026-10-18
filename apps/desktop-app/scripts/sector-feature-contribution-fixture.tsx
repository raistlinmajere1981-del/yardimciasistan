import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../electron/business-capability-store";
import type { DesktopDashboardData } from "../electron/database";
import { defaultSetupData } from "../src/app/bootstrap-defaults";
import type { CapabilityCondition } from "../src/app/capability-condition";
import { buildNavigationFromContributions, type NavigationContribution } from "../src/app/navigation";
import { StagedSettingsContributionSlot, type SettingsSectionContribution } from "../src/app/settings-section-contributions";
import { toSetupForm } from "../src/app/setup-model";
import { pensionNavigationContribution } from "../src/components/pension/pension-navigation";
import { roomWorkspaceDefinition } from "../src/components/pension/room-workspace-definition";
import { AppShell } from "../src/components/layout/AppShell";
import { HospitalityWorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../src/components/workspace/WorkspaceNavigation";
import "../src/styles/index.css";

const fixtureWindow = window as unknown as {
  fixtureDashboard: DesktopDashboardData;
  fixtureCapabilities: {
    staysEnabled: boolean;
    reservationsEnabled: boolean;
    folioEnabled: boolean;
    menuEnabled: boolean;
  };
  fixtureAiBaseUrl: () => string;
};

const testNavigationContribution = {
  pageId: "pension",
  icon: pensionNavigationContribution.icon,
  order: 35,
  condition: { allOf: [C.ACCOMMODATION_ROOMS] },
  contentScroll: "workspace",
  presentation: {
    label: "Test Konaklama",
    title: "Test Konaklama"
  }
} satisfies NavigationContribution;

const testSettingsContribution: SettingsSectionContribution<"services"> = {
  definition: {
    id: "settings-test-service-contribution",
    category: "services",
    title: "Test Servis Katkısı",
    keywords: "test service contribution",
    persistence: "staged",
    condition: { allOf: [C.ACCOMMODATION_ROOMS] }
  },
  render: ({ draft, onChange }) => (
    <label className="form-field form-field--short">
      Test AI adresi
      <input
        aria-label="Test AI adresi"
        value={draft.aiBaseUrl}
        onChange={(event) => onChange({ aiBaseUrl: event.target.value })}
      />
    </label>
  )
};

// @ts-expect-error Services contributions cannot write Business-owned fields.
const invalidOperationsPatch: Parameters<Parameters<typeof testSettingsContribution.render>[0]["onChange"]>[0] = { businessName: "cross-category-write" };
// @ts-expect-error Web transport has an independent persistence owner.
const invalidWebTransportPatch: Parameters<Parameters<typeof testSettingsContribution.render>[0]["onChange"]>[0] = { webModuleUrl: "https://other.example.test" };
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
  const [form, setForm] = useState(() => ({ ...toSetupForm(defaultSetupData), aiBaseUrl: "https://fixture.example.test" }));
  const [data, setData] = useState(fixtureWindow.fixtureDashboard);
  const runtimeSnapshot: BusinessCapabilitySnapshot = {
    businessId: "stage-9-fixture",
    profileId: "pension",
    capabilities: [],
    enabledCapabilities: [C.ACCOMMODATION_ROOMS]
  };
  const items = buildNavigationFromContributions(runtimeSnapshot, [testFeatureComposition.navigation]);
  fixtureWindow.fixtureAiBaseUrl = () => form.aiBaseUrl;

  return <AppShell
    contentScroll="workspace"
    workspaceActive={Boolean(navigation.hospitalitySessions.pension)}
    workspaceLayer={<HospitalityWorkspaceHost
      page="pension"
      activePage="pension"
      definition={testFeatureComposition.workspace}
      context={{ data, onDashboard: setData, ...fixtureWindow.fixtureCapabilities, customersEnabled: false, aiEnabled: false,
        onSaveCustomer: async () => ({ ok: false as const, message: "fixture" }),
        onAnalyzeIdentity: async () => ({ ok: false as const, message: "fixture" }) }}
    />}
    sidebar={<aside className="sidebar">Stage 9 fixture</aside>}
    header={<header className="page-header"><h1>Test Feature</h1></header>}
  >
    <section aria-label="Test feature katkıları" className="form-stack">
      <nav aria-label="Test feature navigation">
        {items.map((item) => <button type="button" key={item.id}>{item.label}</button>)}
      </nav>
      <StagedSettingsContributionSlot
        category="services"
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
      <output aria-label="Test AI adresi sonucu">{form.aiBaseUrl}</output>
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
void invalidWebTransportPatch;
void invalidEmptyCondition;
void invalidRecursiveCondition;

createRoot(document.getElementById("root")!).render(<Fixture />);

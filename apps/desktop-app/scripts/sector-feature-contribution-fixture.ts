import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../electron/business-capability-store";
import type { DesktopDashboardData } from "../electron/database";
import { defaultSetupData } from "../src/app/bootstrap-defaults";
import type { CapabilityCondition } from "../src/app/capability-condition";
import { buildNavigationFromContributions, type NavigationContribution } from "../src/app/navigation";
import {
  StagedSettingsContributionSlot,
  type SettingsSectionContribution
} from "../src/app/settings-section-contributions";
import { toSetupForm } from "../src/app/setup-model";
import { pensionNavigationContribution } from "../src/components/pension/pension-navigation";
import { roomWorkspaceDefinition } from "../src/components/pension/room-workspace-definition";
import { AppShell } from "../src/components/layout/AppShell";
import {
  WorkspaceHost,
  WorkspaceNavigationProvider,
  useWorkspaceNavigation
} from "../src/components/workspace/WorkspaceNavigation";
import "../src/styles/index.css";

const fixtureWindow = window as unknown as {
  fixtureDashboard: DesktopDashboardData;
  fixtureCapabilities: {
    staysEnabled: boolean;
    reservationsEnabled: boolean;
    folioEnabled: boolean;
    menuEnabled: boolean;
  };
  fixtureRoomCount: () => string;
};

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
  render: ({ draft, onChange }) => h(
    "label",
    { className: "form-field form-field--short" },
    "Test oda sayısı",
    h("input", {
      "aria-label": "Test oda sayısı",
      value: draft.roomCount,
      onChange: (event) => onChange({ roomCount: event.currentTarget.value })
    })
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
  const [data, setData] = useState(fixtureWindow.fixtureDashboard);
  const runtimeSnapshot: BusinessCapabilitySnapshot = {
    businessId: "stage-9-fixture",
    profileId: "pension",
    capabilities: [],
    enabledCapabilities: [C.ACCOMMODATION_ROOMS]
  };
  const items = buildNavigationFromContributions(runtimeSnapshot, [testFeatureComposition.navigation]);
  fixtureWindow.fixtureRoomCount = () => form.roomCount;

  return h(
    AppShell,
    {
      contentScroll: "workspace",
      sidebar: h("aside", { className: "sidebar" }, "Stage 9 fixture"),
      header: h("header", { className: "page-header" }, h("h1", null, "Test Feature")),
      overlay: h(WorkspaceHost, {
        definition: testFeatureComposition.workspace,
        context: { data, onDashboard: setData, ...fixtureWindow.fixtureCapabilities }
      })
    },
    h(
      "section",
      { "aria-label": "Test feature katkıları", className: "form-stack" },
      h(
        "nav",
        { "aria-label": "Test feature navigation" },
        ...items.map((item) => h("button", { type: "button", key: item.id }, item.label))
      ),
      h(StagedSettingsContributionSlot, {
        category: "operations",
        form,
        onFormChange: setForm,
        busy: false,
        configurationCapabilities: [C.ACCOMMODATION_ROOMS],
        initialized: true,
        runtimeSnapshot,
        contributions: testFeatureComposition.settings
      }),
      h(
        "button",
        {
          type: "button",
          onClick: () => navigation.openWorkspace({
            entityType: "room",
            entityId: "room-101",
            mode: "summary",
            returnContext: { page: "pension", view: "rooms" }
          })
        },
        "Test oda çalışma alanını aç"
      ),
      h("output", { "aria-label": "Test oda sayısı sonucu" }, form.roomCount)
    )
  );
}

function Fixture() {
  return h(
    WorkspaceNavigationProvider,
    { definitions: [testFeatureComposition.workspace], page: "pension" },
    h(ContributionFixture)
  );
}

void invalidOperationsPatch;
void invalidEmptyCondition;
void invalidRecursiveCondition;

createRoot(document.getElementById("root")!).render(h(Fixture));

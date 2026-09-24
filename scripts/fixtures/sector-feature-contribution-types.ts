import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { CapabilityCondition } from "../../apps/desktop-app/src/app/capability-condition";
import type { NavigationContribution } from "../../apps/desktop-app/src/app/navigation";
import type { SettingsSectionContribution } from "../../apps/desktop-app/src/app/settings-section-contributions";
import { pensionNavigationContribution } from "../../apps/desktop-app/src/components/pension/pension-navigation";
import { roomWorkspaceDefinition } from "../../apps/desktop-app/src/components/pension/room-workspace-definition";

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
  render: ({ onChange }) => {
    onChange({ roomCount: "3" });
    // @ts-expect-error Operations contributions cannot write Business-owned fields.
    onChange({ businessName: "cross-category-write" });
    return null;
  }
};

// @ts-expect-error Capability groups are deliberately non-empty.
const invalidEmptyCondition: CapabilityCondition = { allOf: [] };
// @ts-expect-error anyOf only accepts capability leaves or one allOf group.
const invalidRecursiveCondition: CapabilityCondition = { anyOf: [{ anyOf: [C.AI] }] };

export const testFeatureComposition = {
  navigation: testNavigationContribution,
  settings: [testSettingsContribution],
  workspace: roomWorkspaceDefinition
} as const;

void invalidEmptyCondition;
void invalidRecursiveCondition;

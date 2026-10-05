import { Megaphone } from "lucide-react";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { NavigationContribution } from "../../app/navigation";

export const campaignNavigationContribution = {
  pageId: "campaigns", icon: Megaphone, order: 65,
  condition: { allOf: [C.CUSTOMERS, C.MESSAGING_CAMPAIGNS] }, contentScroll: "workspace",
  presentation: { label: "Kampanyalar", title: "Kampanyalar" }
} satisfies NavigationContribution;

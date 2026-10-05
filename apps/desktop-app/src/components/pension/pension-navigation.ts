import { BedDouble } from "lucide-react";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { NavigationContribution } from "../../app/navigation";

export const pensionNavigationContribution = {
  pageId: "pension",
  icon: BedDouble,
  order: 30,
  condition: { allOf: [C.ACCOMMODATION_ROOMS] },
  contentScroll: "workspace",
  presentation: { label: "Pansiyon", title: "Pansiyon" }
} satisfies NavigationContribution;

import { UtensilsCrossed } from "lucide-react";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { NavigationContribution } from "../../app/navigation";

export const restaurantNavigationContribution = {
  pageId: "restaurant",
  icon: UtensilsCrossed,
  order: 40,
  condition: { allOf: [C.FOOD_TABLES] },
  contentScroll: "workspace",
  presentation: { label: "Restoran", title: "Restoran" }
} satisfies NavigationContribution;

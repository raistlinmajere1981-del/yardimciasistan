import { UtensilsCrossed } from "lucide-react";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../../app/capabilities";
import type { NavigationContribution } from "../../app/navigation";

export const restaurantNavigationContribution = {
  pageId: "restaurant",
  icon: UtensilsCrossed,
  order: 40,
  condition: { allOf: [C.FOOD_TABLES] },
  contentScroll: "workspace",
  presentation: (capabilities) => {
    const topics = [
      "masa durumlarını",
      runtimeHasCapability(capabilities, C.FOOD_RESERVATIONS) ? "rezervasyonları" : "",
      runtimeHasCapability(capabilities, C.FOOD_ORDERS) ? "siparişleri" : "",
      runtimeHasCapability(capabilities, C.TASKS) ? "servis işlerini" : ""
    ].filter(Boolean);
    return {
      label: "Restoran",
      eyebrow: "Servis",
      title: "Restoran",
      description: `${topics.join(", ")} takip edin.`
    };
  }
} satisfies NavigationContribution;

import { BedDouble } from "lucide-react";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../../app/capabilities";
import type { NavigationContribution } from "../../app/navigation";

export const pensionNavigationContribution = {
  pageId: "pension",
  icon: BedDouble,
  order: 30,
  condition: { allOf: [C.ACCOMMODATION_ROOMS] },
  contentScroll: "workspace",
  presentation: (capabilities) => {
    const reservationsEnabled = runtimeHasCapability(capabilities, C.ACCOMMODATION_RESERVATIONS);
    const tasksEnabled = runtimeHasCapability(capabilities, C.TASKS);
    return {
      label: "Pansiyon",
      eyebrow: "Konaklama",
      title: "Pansiyon",
      description: reservationsEnabled && tasksEnabled
        ? "Rezervasyonları, odaları ve günlük işleri izleyin."
        : reservationsEnabled
          ? "Rezervasyonları ve odaları izleyin."
          : tasksEnabled
            ? "Odaları ve günlük işleri izleyin."
            : "Odaların güncel durumunu izleyin."
    };
  }
} satisfies NavigationContribution;

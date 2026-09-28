import { useState } from "react";

export interface RestaurantFilters {
  group: string;
  status: string;
}

/** Router-owned so table board filters survive page/workspace transitions. */
export function useRestaurantPageController() {
  const [filters, setFilters] = useState<RestaurantFilters>({
    group: "all",
    status: "all"
  });
  return { filters, setFilters };
}

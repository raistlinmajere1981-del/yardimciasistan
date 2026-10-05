import { usePageViewState } from "../../app/page-view-state";

export interface RestaurantFilters {
  group: string;
  status: string;
}

/** Router-owned so table board filters survive page/workspace transitions. */
export function useRestaurantPageController() {
  const [filters, setFilters] = usePageViewState<RestaurantFilters>("restaurant.filters", {
    group: "all",
    status: "all"
  });
  return { filters, setFilters };
}

import { createContext, useContext, useState } from "react";

export interface PensionFilters {
  reservationStatus: string;
  reservationDate: string;
  taskStatus: string;
}

/** Page controller stays mounted in the router so panel filters survive workspace/page transitions. */
export function usePensionPageController() {
  const [filters, setFilters] = useState<PensionFilters>({
    reservationStatus: "all",
    reservationDate: "",
    taskStatus: "pending"
  });
  return { filters, setFilters };
}

export const PensionPageContext = createContext<ReturnType<typeof usePensionPageController> | null>(null);
export const usePensionPage = () => useContext(PensionPageContext);

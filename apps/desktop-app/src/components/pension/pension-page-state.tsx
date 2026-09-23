import { createContext, useContext, useState } from "react";

import type { PensionView } from "../workspace/workspace-intent";

export type PensionMode = PensionView;
export interface PensionFilters { reservationStatus: string; reservationDate: string; taskStatus: string }

/** Page controller stays mounted in the router, preserving return context across page changes. */
export function usePensionPageController() {
  const [mode, setMode] = useState<PensionMode>("rooms");
  const [filters, setFilters] = useState<PensionFilters>({ reservationStatus: "all", reservationDate: "", taskStatus: "pending" });
  return { mode, setMode, filters, setFilters };
}
export const PensionPageContext = createContext<ReturnType<typeof usePensionPageController> | null>(null);
export const usePensionPage = () => useContext(PensionPageContext);

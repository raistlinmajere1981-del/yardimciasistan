import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopDashboardData } from "../../electron/database";

/** One dashboard owner; mutation replies cannot roll back a newer pushed snapshot. */
export function useDashboardSnapshot(initial: DesktopDashboardData) {
  const [data, commit] = useState(initial);
  const update: Dispatch<SetStateAction<DesktopDashboardData>> = useCallback(value => {
    commit(current => {
      const next = typeof value === "function" ? value(current) : value;
      return next.revision < current.revision ? current : next;
    });
  }, []);
  return [data, update] as const;
}

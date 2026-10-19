import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopDashboardData } from "../../electron/database";

/** IPC reads allocate new objects even when only the delivery revision changed.
 * Keep equal projection fields referentially stable without dropping the revision fence. */
export function reconcileDashboardSnapshot(current: DesktopDashboardData, next: DesktopDashboardData): DesktopDashboardData {
  const result = { ...next };
  let changed = false;
  for (const key of Object.keys(next) as (keyof DesktopDashboardData)[]) {
    if (current[key] === next[key] || JSON.stringify(current[key]) === JSON.stringify(next[key])) {
      Object.assign(result, { [key]: current[key] });
    } else {
      changed = true;
    }
  }
  return changed || Object.keys(current).length !== Object.keys(next).length ? result : current;
}

/** One dashboard owner; mutation replies cannot roll back a newer pushed snapshot. */
export function useDashboardSnapshot(initial: DesktopDashboardData) {
  const [data, commit] = useState(initial);
  const update: Dispatch<SetStateAction<DesktopDashboardData>> = useCallback(value => {
    commit(current => {
      const next = typeof value === "function" ? value(current) : value;
      return next.revision < current.revision ? current : reconcileDashboardSnapshot(current, next);
    });
  }, []);
  return [data, update] as const;
}

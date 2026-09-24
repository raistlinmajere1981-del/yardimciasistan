import type { DesktopPage } from "./navigation";

export type PageLeaveGuard = (
  destination: DesktopPage,
  continueNavigation: () => void
) => boolean;

export type RegisterPageLeaveGuard = (guard: PageLeaveGuard) => () => void;

export type RequestPageChange = (page: DesktopPage) => void;

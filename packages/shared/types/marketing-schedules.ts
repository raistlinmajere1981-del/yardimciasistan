import type { MarketingChannel, MarketingResult } from "./marketing";
/** D-040: explicit wall-clock rules, never arbitrary cron. ISO weekdays: Monday=1. */
export type MarketingRecurrenceRule =
  | { frequency: "daily"; interval: number; localTime: string }
  | { frequency: "weekly"; interval: number; localTime: string; weekdays: number[] }
  | { frequency: "monthly"; interval: number; localTime: string; dayOfMonth: number };
export type MarketingMissedRunPolicy = "run_once_when_resumed" | "skip";
export interface MarketingSchedule {
  id: string; businessId: string; name: string; targetType: "audience_campaign" | "public_publication";
  targetId: string; channel: MarketingChannel; targetRevision?: number; contentRevision?: number;
  scheduleType: "once" | "recurring"; timezone: string; startsAt: string; startsLocal: string;
  recurrenceRule?: MarketingRecurrenceRule; status: "active" | "paused" | "completed" | "cancelled";
  missedRunPolicy: MarketingMissedRunPolicy; nextRunAt: string; lastRunAt: string;
  revision: number; createdAt: string; updatedAt: string;
}
export interface MarketingScheduleExecution {
  id: string; scheduleId: string; occurrenceKey: string; plannedAt: string; claimedAt: string; completedAt: string;
  status: "pending" | "claimed" | "succeeded" | "skipped" | "failed";
  resultReference?: string; actionRevision?: number; lastError: string; createdAt: string;
}
export interface MarketingScheduleInput {
  id?: string; expectedRevision?: number; name: string;
  targetType: MarketingSchedule["targetType"]; targetId: string; channel: MarketingChannel;
  /** Only an explicit updateTarget=true refreshes the frozen canonical revision. */
  updateTarget?: boolean; expectedTargetRevision?: number;
  scheduleType: MarketingSchedule["scheduleType"]; timezone: string;
  /** YYYY-MM-DDTHH:mm in timezone. The main process resolves DST. */
  startsLocal: string; recurrenceRule?: MarketingRecurrenceRule; missedRunPolicy: MarketingMissedRunPolicy;
}
export interface MarketingScheduleDetail { schedule: MarketingSchedule; executions: MarketingScheduleExecution[]; targetSummary: {name: string; revision?: number; mediaCount?: number} }
export interface MarketingScheduleSnapshot { schedules: MarketingScheduleDetail[]; defaultTimezone: string; occurrences: Array<{scheduleId: string; plannedAt: string}> }
export interface MarketingScheduleBridge {
  getMarketingSchedules(month?: string): Promise<MarketingResult<MarketingScheduleSnapshot>>;
  saveMarketingSchedule(input: MarketingScheduleInput): Promise<MarketingResult<MarketingScheduleDetail>>;
  transitionMarketingSchedule(id: string, revision: number, action: "pause" | "resume" | "cancel"): Promise<MarketingResult<MarketingScheduleDetail>>;
  onMarketingSchedulesChanged(listener: () => void): () => void;
}

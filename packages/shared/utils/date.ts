import type { ISODateString, ISODateTimeString, TimestampedRecord } from "../types/common";

export function nowIso(now: Date = new Date()): ISODateTimeString {
  return now.toISOString();
}

export function toIsoDate(date: Date): ISODateString {
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

export function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

export function createTimestamps(now: Date = new Date()): Pick<TimestampedRecord, "created_at" | "updated_at"> {
  const timestamp = nowIso(now);
  return {
    created_at: timestamp,
    updated_at: timestamp
  };
}

export function touchUpdatedAt<T extends { updated_at: ISODateTimeString }>(record: T, now: Date = new Date()): T {
  return {
    ...record,
    updated_at: nowIso(now)
  };
}

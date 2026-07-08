import type { ISODateTimeString, RecordSource, TimestampedRecord } from "./common";

export interface Customer extends TimestampedRecord {
  full_name: string;
  phone: string;
  email: string;
  source: RecordSource;
  notes: string;
  tags: string[];
  last_contact_at: ISODateTimeString | "";
}

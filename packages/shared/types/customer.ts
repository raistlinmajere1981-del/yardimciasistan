import type { ISODateTimeString, RecordSource, TimestampedRecord } from "./common";

export type CustomerIdentityType = "tc_identity_card" | "passport" | "other" | "";
export type CustomerGender = "female" | "male" | "unspecified" | "";

export interface Customer extends TimestampedRecord {
  full_name: string;
  phone: string;
  email: string;
  source: RecordSource;
  notes: string;
  tags: string[];
  last_contact_at: ISODateTimeString | "";
  identity_type: CustomerIdentityType;
  identity_number: string;
  nationality: string;
  birth_date: string;
  gender: CustomerGender;
  document_serial_number: string;
  document_expiry_date: string;
  birth_place: string;
  mother_name: string;
  father_name: string;
  issuing_authority: string;
  address: string;
}

export interface IdentityDocumentFields {
  full_name: string;
  identity_type: CustomerIdentityType;
  identity_number: string;
  nationality: string;
  birth_date: string;
  gender: CustomerGender;
  document_serial_number: string;
  document_expiry_date: string;
  birth_place: string;
  mother_name: string;
  father_name: string;
  issuing_authority: string;
  address: string;
}

export type IdentityImageConfidence = "high" | "medium" | "low";

export interface IdentityImageAnalysis {
  document_type: CustomerIdentityType;
  document_side: "front" | "back" | "unknown";
  confidence: IdentityImageConfidence;
  fields: IdentityDocumentFields;
  warnings: string[];
}

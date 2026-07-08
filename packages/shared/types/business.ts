import type { ISODateTimeString, TimestampedRecord } from "./common";

export type BusinessType = "pension" | "restaurant" | "pension_restaurant" | "cafe" | "other";

export interface BusinessModules {
  rooms: boolean;
  tables: boolean;
  qr_menu: boolean;
  ai: boolean;
  whatsapp: boolean;
  android: boolean;
  stock?: boolean;
  camera?: boolean;
}

export interface WorkingHour {
  day: string;
  opens_at: string;
  closes_at: string;
  is_closed?: boolean;
}

export interface Business extends TimestampedRecord {
  name: string;
  display_name: string;
  business_type: BusinessType;
  logo_url: string;
  primary_color: string;
  accent_color: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  address: string;
  map_url: string;
  description: string;
  working_hours: WorkingHour[];
  modules: BusinessModules;
}

export type UserRole = "owner" | "manager" | "staff" | "viewer";

export interface User extends TimestampedRecord {
  name: string;
  role: UserRole;
  phone: string;
  email: string;
  pin_enabled: boolean;
  is_active: boolean;
}

export type WhatsAppMode = "wa_link" | "manual_copy" | "webview" | "official_api";

export interface Settings extends TimestampedRecord {
  business_id: string;
  web_module_url: string;
  sync_secret: string;
  ai_enabled: boolean;
  ai_provider: string;
  ai_model: string;
  whatsapp_enabled: boolean;
  whatsapp_mode: WhatsAppMode;
  android_enabled: boolean;
  rooms_enabled: boolean;
  tables_enabled: boolean;
  qr_menu_enabled: boolean;
  last_synced_at?: ISODateTimeString | "";
}

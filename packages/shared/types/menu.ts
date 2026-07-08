import type { CurrencyCode, TimestampedRecord } from "./common";

export interface MenuCategory extends TimestampedRecord {
  name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
}

export interface MenuItem extends TimestampedRecord {
  category_id: string;
  name: string;
  description: string;
  price: number;
  currency: CurrencyCode;
  image_url: string;
  is_available: boolean;
  is_featured: boolean;
  allergens: string[];
  tags: string[];
  sort_order: number;
}

export interface QrMenu {
  categories: MenuCategory[];
  items: MenuItem[];
  updated_at: string;
}

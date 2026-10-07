import type { TimestampedRecord } from "./common";
import type { CommerceUnit } from "./commerce";

/** Read projection of the canonical product unit, never menu-owned storage. */
export type MenuStockUnit = CommerceUnit;

export interface MenuCategory extends TimestampedRecord {
  name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
}

export interface MenuProductEntry extends TimestampedRecord {
  product_id: string;
  category_id: string;
  price_override: number | null;
  is_available: boolean;
  is_featured: boolean;
  allergens: string[];
  tags: string[];
  stock_consumption_quantity: number;
  hide_when_out_of_stock: boolean;
  sort_order: number;
}

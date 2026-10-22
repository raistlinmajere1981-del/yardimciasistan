/** Dealer identity is an access projection of canonical Customer, never a second Customer. */
export type DealerAccessAction = "invite" | "revoke_sessions";
export interface DealerWebAccess {
  accessId: string;
  customerId: string;
  enabled: boolean;
  accessRevision: number;
  inviteRevision: number;
  inviteIssuedAt: string;
  inviteExpiresAt: string;
  revokedAt: string;
  updatedAt: string;
}
export interface DealerAccessResult {
  access: DealerWebAccess;
  /** One-time disclosure. Keep only in the current UI instance, never persist. */
  inviteUrl?: string;
}
/** Private sync contract: no contact, tax, notes, pricing configuration or raw canonical Customer ids. */
export interface DealerAccessProjection {
  version: 1 | 2;
  enabled: boolean;
  dealers: Array<{
    access_id: string;
    customer_ref: string;
    display_name: string;
    access_revision: number;
    invite_revision?: number;
    enabled: boolean;
    invite_hash: string;
    invite_expires_at: number;
  }>;
  /** Read-only canonical order snapshots, carried by the same private durable publication. */
  order_history?: DealerOrderHistoryProjection[];
  /** Private per-access catalogs. Never exposed through the public online catalog. */
  catalogs?: DealerCatalogProjection[];
}

export interface DealerCatalogProjection {
  access_id: string;
  access_revision: number;
  catalog_revision: string;
  delivery_methods: import("./commerce").CommerceOrderDeliveryMethod[];
  products: Array<{
    product_id: string; name: string; description: string; sku: string;
    category_id?: string; category_name?: string; brand?: string;
    unit: import("./commerce").CommerceUnit; price: number; currency: string;
    tax_rate: number; image_url: string; availability: "available";
  }>;
}

/** Transport states are separate from the canonical CommerceOrderStatus lifecycle. */
export interface DealerOrderHistoryProjection {
  access_id: string;
  orders: Array<{
    order_id: string;
    status: import("./commerce").CommerceOrderStatus | "rejected";
    created_at: string;
    updated_at: string;
    total: number | null;
    currency: string;
    items: Array<{ product_id: string; name: string; quantity: number }>;
  }>;
}

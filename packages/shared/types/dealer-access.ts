/** Dealer identity is an access projection of canonical Customer, never a second Customer. */
export type DealerAccessAction = "revoke_sessions" | { type: "link"; accountId: string };
export interface DealerWebAccess {
  accessId: string;
  customerId: string;
  accountId: string;
  enabled: boolean;
  accessRevision: number;
  sessionRevision: number;
  revokedAt: string;
  updatedAt: string;
  linkCandidates: Array<{ accountId: string; email: string; fullName: string }>;
}
export interface DealerAccessResult { access: DealerWebAccess; }
/** Private sync contract. Opaque customer binding and resolved commercial projections only. */
export interface DealerAccessProjection {
  web_order_statuses?: import("./commerce-checkout").CommerceWebOrderStatus[];
  version: 3;
  online_sales_enabled: boolean;
  enabled: boolean;
  dealers: Array<{
    access_id: string;
    customer_ref: string;
    display_name: string;
    access_revision: number;
    session_revision: number;
    account_id: string;
    enabled: boolean;
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
    tax_rate: number; image_url: string; image_urls?: string[]; availability: "available";
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

import { useCallback, useRef, useState } from "react";
import type { CatalogProduct } from "@yardimci-asistan/shared";
import { RecordPicker } from "../ui/RecordPicker";
import { MarketProductThumbnail } from "./MarketProductThumbnail";

function productOption(product: CatalogProduct) {
  return { id: product.id, label: product.name, description: [product.sku, product.barcode].filter(Boolean).join(" · "),
    keywords: product.sku, leading: <MarketProductThumbnail product={product} className="record-picker-product-image" /> };
}

/** Pages and searches share the canonical SQLite catalog query. */
export function MarketCatalogPicker({ products, value, onChange, onProductSelected, ariaLabel, disabled = false, inventoryOnly = true, clearable = true }: {
  products: CatalogProduct[];
  value: string;
  onChange: (id: string) => void;
  onProductSelected?: (product: CatalogProduct | null) => void;
  ariaLabel: string;
  disabled?: boolean;
  inventoryOnly?: boolean;
  clearable?: boolean;
}) {
  const bridge = window.yardimciDesktop?.commerce;
  const [searchedProducts, setSearchedProducts] = useState<CatalogProduct[]>([]);
  const [picked, setPicked] = useState<CatalogProduct | null>(null);
  const generation = useRef(0);
  const loadPage = useCallback(async (query: string, offset: number) => {
    if (!bridge) throw new Error("Ürün kataloğu kullanılamıyor.");
    const request = ++generation.current;
    const page = await bridge.listProducts({ search: query, activeOnly: true, inventoryOnly, offset, limit: 60 });
    if (request === generation.current) setSearchedProducts(page.items);
    return { ...page, options: page.items.map(productOption) };
  }, [bridge, inventoryOnly]);
  const eligible = products.filter(product => (!inventoryOnly || product.trackInventory) && product.isActive);
  const shown = picked?.id === value && !eligible.some(product => product.id === picked.id) ? [...eligible, picked] : eligible;
  return <RecordPicker pickerType="product" ariaLabel={ariaLabel} value={value} disabled={disabled} clearable={clearable} placeholder="Ürün seçin"
    searchPlaceholder="Ürün adı, SKU veya barkod" options={shown.map(productOption)} loadPage={loadPage}
    onChange={id => {
      const product = [...eligible, ...searchedProducts].find(record => record.id === id) ?? null;
      setPicked(product); onProductSelected?.(product); onChange(id);
    }} />;
}

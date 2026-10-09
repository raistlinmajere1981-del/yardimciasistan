import { useCallback, useRef, useState } from "react";
import type { CatalogProduct } from "@yardimci-asistan/shared";
import { RecordPicker } from "../ui/RecordPicker";
import { MarketProductThumbnail } from "./MarketProductThumbnail";

function productOption(product: CatalogProduct) {
  return { id: product.id, label: product.name, description: [product.sku, product.barcode].filter(Boolean).join(" · "),
    keywords: product.sku, leading: <MarketProductThumbnail product={product} className="record-picker-product-image" /> };
}

/** Search the canonical catalog beyond the page projection's 500-record boundary. */
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
  const searchGeneration = useRef(0);
  const loadOptions = useCallback(async (query: string) => {
    if (!bridge) return [];
    const generation = ++searchGeneration.current;
    const records = (await bridge.listProducts({ search: query, activeOnly: true, limit: 500 }))
      .filter(product => (!inventoryOnly || product.trackInventory) && product.isActive);
    if (generation === searchGeneration.current) setSearchedProducts(records);
    return records.map(productOption);
  }, [bridge, inventoryOnly]);
  const eligible = products.filter(product => (!inventoryOnly || product.trackInventory) && product.isActive);
  const shown = picked?.id === value && !eligible.some(product => product.id === picked.id) ? [...eligible, picked] : eligible;
  return <RecordPicker pickerType="product" ariaLabel={ariaLabel} value={value} disabled={disabled} clearable={clearable} placeholder="Ürün seçin"
    searchPlaceholder="Ürün adı, SKU veya barkod" options={shown.map(productOption)} loadOptions={loadOptions} resultLimit={500}
    onChange={id => {
      const product = [...eligible, ...searchedProducts].find(record => record.id === id) ?? null;
      setPicked(product); onProductSelected?.(product); onChange(id);
    }} />;
}

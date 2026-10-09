import { useEffect, useState } from "react";
import type { CatalogProduct } from "@yardimci-asistan/shared";

const imageCache = new Map<string, string>();
const pendingImages = new Map<string, Promise<string>>();

function cacheKey(product: CatalogProduct) {
  return `${product.id}:${product.imageAssetPath || ""}:${product.updatedAt || ""}`;
}

function loadProductImage(product: CatalogProduct): Promise<string> {
  if (!product.imageAssetPath) return Promise.resolve("");
  const key = cacheKey(product);
  const cached = imageCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = pendingImages.get(key);
  if (pending) return pending;

  const bridge = window.yardimciDesktop?.commerce;
  if (!bridge?.getProductImageDataUrl) return Promise.resolve("");

  const request = bridge.getProductImageDataUrl(product.id)
    .then((dataUrl) => {
      const value = String(dataUrl ?? "");
      imageCache.set(key, value);
      return value;
    })
    .catch(() => {
      imageCache.set(key, "");
      return "";
    })
    .finally(() => {
      pendingImages.delete(key);
    });
  pendingImages.set(key, request);
  return request;
}

interface MarketProductThumbnailProps {
  product: CatalogProduct;
  className: string;
}

export function MarketProductThumbnail({ product, className }: MarketProductThumbnailProps) {
  const [src, setSrc] = useState(() => imageCache.get(cacheKey(product)) ?? "");

  useEffect(() => {
    let disposed = false;
    setSrc(imageCache.get(cacheKey(product)) ?? "");
    void loadProductImage(product).then((dataUrl) => {
      if (!disposed) setSrc(dataUrl);
    });
    return () => {
      disposed = true;
    };
  }, [product]);

  if (!src) return null;
  return <img className={className} src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={() => setSrc("")} />;
}

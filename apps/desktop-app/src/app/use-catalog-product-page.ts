import { useEffect, useRef, useState } from "react";
import type { CatalogProductPage, ListCatalogProductsOptions } from "../../electron/commerce-store";
import { usePageViewState } from "./page-view-state";

/** A visible catalog page, never a second catalog cache or cart owner. */
export function useCatalogProductPage(key: string, options: ListCatalogProductsOptions, revision = 0, enabled = true) {
  const bridge = window.yardimciDesktop?.commerce;
  const queryKey = JSON.stringify(options);
  const [position, setPosition] = usePageViewState(`${key}.position`, { queryKey, offset: 0 });
  const offset = position.queryKey === queryKey ? position.offset : 0;
  const [page, setPage] = useState<CatalogProductPage | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    let disposed = false;
    if (!bridge || !enabled) { setLoading(false); return; }
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      const query = JSON.parse(queryKey) as ListCatalogProductsOptions;
      void Promise.resolve().then(() => bridge.listProducts({ ...query, offset, limit: 60 })).then(next => {
        if (disposed || request !== generation.current) return;
        if (!next.items.length && next.total > 0 && offset >= next.total) {
          setPosition({ queryKey, offset: Math.floor((next.total - 1) / 60) * 60 });
          return;
        }
        setPage(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      }).catch(reason => {
        if (!disposed && request === generation.current) setError(reason instanceof Error ? reason.message : "Ürünler yüklenemedi.");
      }).finally(() => { if (!disposed && request === generation.current) setLoading(false); });
    }, options.search?.trim() ? 180 : 0);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [bridge, enabled, queryKey, offset, revision, attempt, setPosition, options.search]);
  return { page, loading, error, offset,
    previous: () => setPosition({ queryKey, offset: Math.max(0, offset - 60) }),
    next: () => { if (page?.nextOffset !== null && page?.nextOffset !== undefined) setPosition({ queryKey, offset: page.nextOffset }); },
    retry: () => setAttempt(current => current + 1) };
}
export type CatalogProductPagination = ReturnType<typeof useCatalogProductPage>;

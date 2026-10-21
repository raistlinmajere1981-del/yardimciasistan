import type { CatalogProductPagination } from "../../app/use-catalog-product-page";
import { ActionButton } from "../ui/ActionButton";

export function CatalogPageControls({ catalog }: { catalog: CatalogProductPagination }) {
  const { page, loading, error } = catalog;
  return <div className="market-catalog-pagination" aria-label="Ürün sayfaları">
    {error ? <span role="alert">{error} <ActionButton variant="ghost" size="sm" onClick={catalog.retry}>Yeniden dene</ActionButton></span>
      : <span role="status">{loading ? "Ürünler yükleniyor…" : `${page?.total ? (page.offset + 1) : 0}–${(page?.offset ?? 0) + (page?.items.length ?? 0)} / ${page?.total ?? 0} ürün`}</span>}
    <ActionButton variant="secondary" size="sm" disabled={loading || catalog.offset === 0} onClick={catalog.previous}>Önceki</ActionButton>
    <ActionButton variant="secondary" size="sm" disabled={loading || Boolean(error) || page?.nextOffset == null} onClick={catalog.next}>Sonraki</ActionButton>
  </div>;
}

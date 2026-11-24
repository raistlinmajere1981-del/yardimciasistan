import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, Printer, RefreshCw } from "lucide-react";
import type { PrintStockReplenishmentInput } from "@yardimci-asistan/shared";
import type { StockReplenishmentRow } from "../../../electron/stock-replenishment";
import { ActionButton } from "../ui/ActionButton";
import { IconButton } from "../ui/IconButton";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { DetailWorkspaceLayout } from "../workspace/DetailWorkspaceLayout";

const collator = new Intl.Collator("tr-TR", { numeric: true, sensitivity: "base" });
type Sort = "deficit" | "name" | "category";

/** Read-only purchasing projection. Never creates an order or inventory movement. */
export function StockReplenishmentPanel({ refreshRevision = 0 }: { refreshRevision?: number }) {
  const [open, setOpen] = useState(false);
  return <>
    <ActionButton size="sm" onClick={() => setOpen(true)}>
      <ClipboardList size={16} aria-hidden="true" /> İhtiyaç listesini aç
    </ActionButton>
    {open && <StockReplenishmentWorkspace refreshRevision={refreshRevision} onClose={() => setOpen(false)} />}
  </>;
}

export function stockReplenishmentCsv(rows: StockReplenishmentRow[]): string {
  const csv = (value: string | number) => {
    const text = String(value);
    const safe = typeof value === "string" && /^[=+@\t\r-]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const data: Array<Array<string | number>> = [["Kategori", "Ürün", "SKU", "Birim", "Mevcut", "Minimum", "İdeal", "Sipariş"],
    ...rows.map(row => [row.categoryName, row.name, row.sku, row.unit, row.quantity, row.minimumQuantity, row.idealQuantity, row.suggestedQuantity])];
  return "\uFEFF" + data.map(row => row.map(csv).join(";")).join("\r\n");
}
function downloadCsv(rows: StockReplenishmentRow[], filename: string) {
  const url = URL.createObjectURL(new Blob([stockReplenishmentCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StockReplenishmentWorkspace({ refreshRevision, onClose }: { refreshRevision: number; onClose(): void }) {
  const [rows, setRows] = useState<StockReplenishmentRow[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("deficit");
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(50);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setMessage("");
    const read = window.yardimciDesktop?.commerce?.listStockReplenishment;
    if (!read) { setLoading(false); setError("Stok bağlantısı kullanılamıyor."); return; }
    void read().then(value => { if (active) { setRows(value); setSelectedIds(new Set()); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Stok ihtiyaç listesi okunamadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshRevision, reload]);
  const categories = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const row of rows) {
      const item = counts.get(row.categoryId);
      if (item) item.count += 1;
      else counts.set(row.categoryId, { id: row.categoryId, name: row.categoryName, count: 1 });
    }
    return [...counts.values()].sort((a, b) => collator.compare(a.name, b.name));
  }, [rows]);
  const activeCategoryId = categoryId && categories.some(item => item.id === categoryId) ? categoryId : "";
  const activeCategoryName = categories.find(item => item.id === activeCategoryId)?.name ?? "Tüm kategoriler";
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter(row => (!activeCategoryId || row.categoryId === activeCategoryId)
      && (!term || (row.name + " " + row.sku + " " + row.categoryName).toLocaleLowerCase("tr-TR").includes(term)))
      .sort((a, b) => sort === "deficit" ? b.suggestedQuantity - a.suggestedQuantity || collator.compare(a.name, b.name)
        : sort === "name" ? collator.compare(a.name, b.name)
          : collator.compare(a.categoryName, b.categoryName) || collator.compare(a.name, b.name));
  }, [rows, activeCategoryId, search, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = useMemo(() => rows.filter(row => selectedIds.has(row.productId)), [rows, selectedIds]);
  const allOnPage = pageRows.length > 0 && pageRows.every(row => selectedIds.has(row.productId));
  const allFiltered = filtered.length > 0 && filtered.every(row => selectedIds.has(row.productId));
  const select = (ids: string[], checked: boolean) => setSelectedIds(previous => {
    const next = new Set(previous);
    for (const id of ids) if (checked) next.add(id); else next.delete(id);
    return next;
  });
  const filter = (apply: () => void) => { apply(); setPage(1); setMessage(""); };
  const print = async (input: PrintStockReplenishmentInput) => {
    if (printing || loading) return;
    const bridge = window.yardimciDesktop?.printStockReplenishment;
    if (!bridge) { setMessage("Baskı Yönetimi bağlantısı bulunamadı."); return; }
    setPrinting(true); setMessage("");
    try {
      const result = await bridge(input);
      setMessage(!result.ok ? result.message
        : result.value === "accepted" ? "Belge yazıcı kuyruğuna gönderildi."
          : result.value === "failed" ? "Yazdırma başarısız. Yeniden göndermeden önce yazıcıyı kontrol edin."
            : result.value === "unknown" ? "Yazdırma sonucu belirsiz. Yeniden göndermeden önce yazıcı kuyruğunu kontrol edin."
              : "Yazdırma iptal edildi.");
    } catch { setMessage("Yazdırma başlatılamadı. Baskı Yönetimi ayarlarını kontrol edin."); }
    finally { setPrinting(false); }
  };
  const saveCsv = (list: StockReplenishmentRow[], name: string) => {
    if (!list.length) return;
    downloadCsv(list, name); setMessage(String(list.length) + " satırlık CSV hazırlandı.");
  };
  return <WorkspaceFrame presentation="centered" className="stock-replenishment-workspace detail-workspace-frame" bodyScroll="panes"
    title="İdeal Stok İhtiyaç Listesi" onClose={onClose} closeBlocked={printing}
    headerSummary={String(rows.length) + " eksik ürün"}
    footer={<>
      <span className="market-muted" role="status">{loading ? "İhtiyaç listesi hesaplanıyor…" : String(filtered.length) + " filtre sonucu · " + String(selectedIds.size) + " seçili · " + String(rows.length) + " toplam eksik"}</span>
      <div className="stock-replenishment__footer-actions">
        <ActionButton variant="secondary" onClick={() => saveCsv(selected, "secilen-stok-ihtiyaclari.csv")} disabled={!selected.length || loading || printing}><Download size={16}/> Seçilenleri CSV</ActionButton>
        <ActionButton variant="secondary" onClick={() => saveCsv(filtered, "filtreli-stok-ihtiyaclari.csv")} disabled={!filtered.length || loading || printing}>Filtreyi CSV</ActionButton>
        <ActionButton variant="secondary" onClick={() => saveCsv(rows, "tum-stok-ihtiyaclari.csv")} disabled={!rows.length || loading || printing}>Tümünü CSV</ActionButton>
        <ActionButton variant="secondary" busy={printing} onClick={() => void print({ scope: "selected", productIds: selected.map(row => row.productId) })} disabled={!selected.length || loading}><Printer size={16}/> Seçilenleri Yazdır</ActionButton>
        <ActionButton onClick={() => void print({ scope: "all" })} disabled={!rows.length || loading || printing}>Tümünü Yazdır</ActionButton>
      </div>
    </>}>
    <div className="stock-replenishment__content">
      <DetailWorkspaceLayout className="stock-replenishment__layout" railLabel="İhtiyaç kategorileri" contentLabel="İhtiyaç ürünleri"
        rail={<section className="panel stock-replenishment__category-panel">
          <header className="detail-section-card__heading"><h3>Kategoriler</h3><span className="market-muted">{categories.length}</span></header>
          <nav className="stock-replenishment__category-list" aria-label="İhtiyaç kategorileri">
            <button type="button" className="stock-replenishment__category-button" aria-pressed={!activeCategoryId}
              onClick={() => filter(() => setCategoryId(""))}>
              <span>Tüm kategoriler</span><span className="stock-replenishment__category-count">{rows.length}</span>
            </button>
            {categories.map(item => <button type="button" key={item.id} className="stock-replenishment__category-button"
              aria-pressed={activeCategoryId === item.id} onClick={() => filter(() => setCategoryId(item.id))}>
              <span>{item.name}</span><span className="stock-replenishment__category-count">{item.count}</span>
            </button>)}
          </nav>
        </section>}>
        <section className="panel stock-replenishment__results-panel">
          <header className="detail-section-card__heading stock-replenishment__results-heading">
            <h3>{activeCategoryName}</h3><span className="market-muted">{filtered.length} ürün</span>
          </header>
          <div className="stock-replenishment__toolbar">
            <label className="stock-replenishment__search">Ara<input aria-label="İhtiyaçlarda ara" value={search} onChange={e => filter(() => setSearch(e.target.value))} placeholder="Ürün, SKU veya kategori" /></label>
            <label>Sıralama<select aria-label="İhtiyaç sıralaması" value={sort} onChange={e => filter(() => setSort(e.target.value as Sort))}>
              <option value="deficit">En çok ihtiyaç</option><option value="name">Ürün adı</option><option value="category">Kategori</option>
            </select></label>
            <label>Sayfa boyutu<select aria-label="Sayfadaki ürün" value={pageSize} onChange={e => filter(() => setPageSize(Number(e.target.value) as 25 | 50 | 100))}>
              {[25, 50, 100].map(value => <option value={value} key={value}>{value} ürün</option>)}
            </select></label>
          </div>
          <div className="stock-replenishment__selection">
            <ActionButton size="sm" variant="secondary" disabled={!pageRows.length || printing} onClick={() => select(pageRows.map(row => row.productId), !allOnPage)}>
              {allOnPage ? "Bu sayfanın seçimini kaldır" : "Bu sayfayı seç"}
            </ActionButton>
            <ActionButton size="sm" variant="secondary" disabled={!filtered.length || printing} onClick={() => select(filtered.map(row => row.productId), !allFiltered)}>
              {allFiltered ? "Filtre seçimini kaldır" : "Filtre sonucunu seç (" + String(filtered.length) + ")"}
            </ActionButton>
            <ActionButton size="sm" variant="ghost" disabled={!selectedIds.size || printing} onClick={() => setSelectedIds(new Set())}>Seçimi temizle</ActionButton>
            <span className="market-muted">{selectedIds.size} ürün seçili</span>
            <IconButton variant="normal" aria-label="İhtiyaç listesini yenile" title="Yenile"
              disabled={loading || printing} onClick={() => setReload(n => n + 1)}>
              <RefreshCw size={17} aria-hidden="true" />
            </IconButton>
          </div>
          {error && <p role="alert" className="stock-replenishment__notice">{error}</p>}
          {message && <p role="status" className="stock-replenishment__notice">{message}</p>}
          <div className="stock-replenishment__table-scroll">
            <table className="stock-replenishment__table">
              <thead><tr><th scope="col">Seç</th><th scope="col">Kategori</th><th scope="col">Ürün / SKU</th><th scope="col">Mevcut</th><th scope="col">Minimum</th><th scope="col">İdeal</th><th scope="col">İhtiyaç</th></tr></thead>
              <tbody>{pageRows.map(row => <tr key={row.productId} data-selected={selectedIds.has(row.productId)}>
                <td><input type="checkbox" aria-label={row.name + " seç"} checked={selectedIds.has(row.productId)} disabled={printing} onChange={event => select([row.productId], event.target.checked)}/></td>
                <td>{row.categoryName}</td><td><strong>{row.name}</strong><small>{row.sku || "SKU yok"}</small></td>
                <td>{row.quantity} <small>{row.unit}</small></td><td>{row.minimumQuantity}</td><td>{row.idealQuantity}</td>
                <td className="stock-replenishment__need"><strong>{row.suggestedQuantity}</strong> <small>{row.unit}</small></td>
              </tr>)}</tbody>
            </table>
            {loading && <p role="status" className="stock-replenishment__empty">Stok önerileri hesaplanıyor…</p>}
            {!loading && !error && !filtered.length && <p className="stock-replenishment__empty">{rows.length ? "Arama ve kategoriye uygun ürün yok." : "İdeal stok altında ürün bulunmuyor. Ürün kartında ideal stok miktarı belirleyebilirsiniz."}</p>}
          </div>
          <div className="stock-replenishment__pagination">
            <span className="market-muted">{filtered.length ? String((currentPage - 1) * pageSize + 1) + "–" + String(Math.min(currentPage * pageSize, filtered.length)) + " / " + String(filtered.length) + " ürün" : "0 ürün"}</span>
            <div className="stock-replenishment__pages">
              <ActionButton size="sm" variant="secondary" disabled={currentPage === 1} onClick={() => setPage(1)}>İlk</ActionButton>
              <ActionButton size="sm" variant="secondary" disabled={currentPage === 1} onClick={() => setPage(n => Math.max(1, n - 1))}>Önceki</ActionButton>
              <span aria-label="Sayfa numarası">{currentPage} / {pages}</span>
              <ActionButton size="sm" variant="secondary" disabled={currentPage === pages} onClick={() => setPage(n => Math.min(pages, n + 1))}>Sonraki</ActionButton>
              <ActionButton size="sm" variant="secondary" disabled={currentPage === pages} onClick={() => setPage(pages)}>Son</ActionButton>
            </div>
          </div>
        </section>
      </DetailWorkspaceLayout>
    </div>
  </WorkspaceFrame>;
}

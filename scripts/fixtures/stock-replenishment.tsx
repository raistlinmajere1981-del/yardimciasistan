import { createRoot } from "react-dom/client";
import { StockReplenishmentPanel } from "../../apps/desktop-app/src/components/market/StockReplenishmentPanel";
import "../../apps/desktop-app/src/styles/index.css";
const rows = Array.from({ length: 540 }, (_, i) => ({
  productId: "product_" + String(i + 1),
  name: "Ürün " + String(i + 1),
  sku: "SKU-" + String(i + 1),
  categoryId: i % 2 ? "b" : "a",
  categoryName: i % 2 ? "İçecekler" : "Gıda",
  unit: "piece",
  quantity: i % 10,
  minimumQuantity: 5,
  idealQuantity: 20,
  suggestedQuantity: 20 - i % 10
}));
const printCalls: unknown[] = [];
let reads = 0;
let categoryCount = 2;
let rowCount = rows.length;
Object.assign(window, {
  yardimciDesktop: {
    commerce: {listStockReplenishment: async () => {
      reads++;
      return Array.from({ length: rowCount }, (_, index) => {
        const row = rows[index % rows.length];
        const id = index + 1;
        return {
          ...row,
          productId: "product_" + String(id),
          name: "Ürün " + String(id),
          sku: "SKU-" + String(id),
          ...(categoryCount === 2 ? {} : {
            categoryId: "category_" + String(index % categoryCount),
            categoryName: "Kategori " + String(index % categoryCount + 1).padStart(2, "0")
          })
        };
      });
    }},
    printStockReplenishment: async (input: unknown) => { printCalls.push(structuredClone(input)); return {ok:true,value:"accepted"}; }
  },
  stockUiTest: { reads: () => reads, printCalls: () => structuredClone(printCalls),
    setCategoryCount: (count: number) => { categoryCount = count; },
    setRowCount: (count: number) => { rowCount = Math.max(0, Math.min(count, 20000)); } }
});
createRoot(document.getElementById("root")!).render(
  <div className="desktop-shell"><aside id="desktop-sidebar"></aside><main className="content">
    <header className="page-header">Satış</header>
    <div className="market-two-column"><section className="market-panel">
      <header className="market-panel-heading">
        <span>Stok</span>
        <div className="market-inventory-heading-row">
          <h2>Fiziksel Sayım</h2>
          <StockReplenishmentPanel />
        </div>
        <p>Mevcut fiziksel miktarı yazın; fark sistem tarafından hesaplanır.</p>
      </header>
    </section></div>
  </main></div>
);

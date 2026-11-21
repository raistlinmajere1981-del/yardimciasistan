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
Object.assign(window, {
  yardimciDesktop: {
    commerce: {listStockReplenishment: async () => { reads++; return structuredClone(rows); }},
    printStockReplenishment: async (input: unknown) => { printCalls.push(structuredClone(input)); return {ok:true,value:"accepted"}; }
  },
  stockUiTest: { reads: () => reads, printCalls: () => structuredClone(printCalls) }
});
createRoot(document.getElementById("root")!).render(
  <div className="desktop-shell"><aside id="desktop-sidebar"></aside><main className="content">
    <header className="page-header">Satış</header>
    <div className="market-two-column"><StockReplenishmentPanel/></div>
  </main></div>
);

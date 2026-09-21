const assert = require("node:assert/strict");
const test = require("node:test");
const {
  selectRelevantBusinessAiCatalogItems
} = require("../dist");

const catalog = {
  version: 1,
  updatedAt: "2026-09-22T00:00:00Z",
  items: [
    {
      id: "p1", source: "catalog", name: "Coca-Cola Zero 330 ml", description: "",
      category: "İçecek", brand: "Coca-Cola", barcode: "5449000131805",
      price: 45, currency: "TRY", unit: "piece", available: true, featured: false, tags: []
    },
    {
      id: "p2", source: "catalog", name: "Pepsi 330 ml", description: "",
      category: "İçecek", brand: "Pepsi", barcode: "8690632033556",
      price: 42, currency: "TRY", unit: "piece", available: true, featured: false, tags: []
    },
    {
      id: "m1", source: "menu", name: "Klasik Hamburger", description: "Dana köfte",
      category: "Ana Yemekler", brand: "", barcode: "",
      price: 280, currency: "TRY", unit: "piece", available: true, featured: true, tags: ["burger"]
    },
    {
      id: "m2", source: "menu", name: "Tükendi", description: "",
      category: "Tatlı", brand: "", barcode: "",
      price: 100, currency: "TRY", unit: "piece", available: false, featured: false, tags: []
    }
  ]
};

test("AI catalog matcher finds product names without being distracted by generic price words", () => {
  const matches = selectRelevantBusinessAiCatalogItems(catalog, "Coca Cola zero fiyatı ne kadar?");
  assert.equal(matches[0]?.id, "p1");
  assert.equal(matches.some((item) => item.id === "p2"), false);
});

test("AI catalog matcher supports exact barcodes", () => {
  const matches = selectRelevantBusinessAiCatalogItems(catalog, "5449000131805");
  assert.deepEqual(matches.map((item) => item.id), ["p1"]);
});

test("AI catalog matcher finds menu items and never returns unavailable items", () => {
  const matches = selectRelevantBusinessAiCatalogItems(catalog, "hamburger var mı?");
  assert.equal(matches[0]?.id, "m1");
  assert.equal(matches.some((item) => item.id === "m2"), false);
});

test("AI catalog matcher does not dump arbitrary products for a generic question", () => {
  assert.deepEqual(selectRelevantBusinessAiCatalogItems(catalog, "ürünler neler?"), []);
});

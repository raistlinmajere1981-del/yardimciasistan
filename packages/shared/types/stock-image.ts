import type { MenuStockUnit } from "./menu";

export type StockImageImportSource = "desktop" | "android";
export type StockImageConfidence = "high" | "medium" | "low";

export interface StockImageProductCandidate {
  id: string;
  name: string;
  category: string;
  current_stock: number;
  stock_unit: MenuStockUnit;
}

export interface StockImageDocumentAnalysis {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  document_confidence: StockImageConfidence;
}

export interface StockImageAnalysisLine {
  raw_text: string;
  matched_product_id: string | null;
  matched_product_name: string | null;
  suggested_quantity: number | null;
  source_quantity_text: string | null;
  confidence: StockImageConfidence;
  needs_review_reason: string | null;
}

export interface StockImageAnalysis {
  document: StockImageDocumentAnalysis;
  lines: StockImageAnalysisLine[];
}

export interface StockImageApplyLine {
  product_id: string;
  quantity: number;
  raw_text: string;
  confidence: StockImageConfidence;
}

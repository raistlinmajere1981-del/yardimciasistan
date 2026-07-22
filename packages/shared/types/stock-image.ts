export type StockImageImportSource = "desktop" | "android";
export type StockImageConfidence = "high" | "medium" | "low";

export interface StockImageMenuCandidate {
  id: string;
  name: string;
  category: string;
  current_stock: number;
}

export interface StockImageDocumentAnalysis {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  document_confidence: StockImageConfidence;
}

export interface StockImageAnalysisLine {
  raw_text: string;
  matched_menu_item_id: string | null;
  matched_menu_item_name: string | null;
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
  menu_item_id: string;
  quantity: number;
  raw_text: string;
  confidence: StockImageConfidence;
}

export interface MenuStockImageImportApplyPayload {
  import_id: string;
  image_hash: string;
  duplicate_warning_acknowledged?: boolean;
  lines: StockImageApplyLine[];
}

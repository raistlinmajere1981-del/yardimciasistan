import type { DatabaseSync } from "node:sqlite";
import { MarketingError } from "./validation";
export function marketingBusiness(db: DatabaseSync): string {
  const id = String(db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get()?.id ?? "");
  if (!id) throw new MarketingError("unconfigured", "İşletme kurulumu gerekli."); return id;
}
export function marketingTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec("SAVEPOINT marketing_write");
  try { const value = action(); db.exec("RELEASE marketing_write"); return value; }
  catch (error) { db.exec("ROLLBACK TO marketing_write; RELEASE marketing_write"); throw error; }
}

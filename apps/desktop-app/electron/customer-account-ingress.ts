import type { DatabaseSync } from "node:sqlite";
import type { CustomerAccountEnvelope } from "@yardimci-asistan/sync-core";
import { saveCustomer } from "./database/customer-store";

/** Transactional importer. Email collisions require explicit linking in Customer Workspace. */
export function importCustomerAccount(db: DatabaseSync, input: CustomerAccountEnvelope): void {
  const cursor = getCustomerAccountCursor(db);
  if (!input || !Number.isSafeInteger(input.syncSeq) || input.syncSeq <= cursor || input.emailVerified !== true
    || !/^[a-f0-9-]{36}$/.test(input.accountId) || typeof input.email !== "string" || input.email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || typeof input.fullName !== "string" || input.fullName.length > 320) throw new Error("Müşteri hesabı taşıma kaydı geçersiz.");
  db.exec("BEGIN IMMEDIATE");
  try {
    const previous = db.prepare("SELECT * FROM web_customer_accounts WHERE account_id = ?").get(input.accountId);
    if (previous && String(previous.email).toLowerCase() !== input.email.toLowerCase()) throw new Error("Müşteri hesabı kimliği çakışıyor.");
    if (!previous) {
      const existing = db.prepare("SELECT 1 FROM customers WHERE lower(trim(email)) = ? LIMIT 1").get(input.email.toLowerCase());
      let customerId = "";
      if (!existing) {
        const created = saveCustomer(db, { fullName: input.fullName, email: input.email, phone: "", notes: "", identityType: "", identityNumber: "", nationality: "", birthDate: "", gender: "", documentSerialNumber: "", documentExpiryDate: "", birthPlace: "", motherName: "", fatherName: "", issuingAuthority: "", address: "" });
        if (!created.ok) throw new Error(created.message);
        customerId = created.savedId;
        db.prepare("UPDATE customers SET source = 'web-account' WHERE id = ?").run(customerId);
        db.prepare("UPDATE customer_web_access SET account_id = ? WHERE customer_id = ?").run(input.accountId, customerId);
      }
      db.prepare("INSERT INTO web_customer_accounts VALUES (?, ?, ?, ?, ?)").run(input.accountId, input.email, input.fullName, customerId, customerId ? "linked" : "conflict");
    }
    db.prepare("UPDATE web_customer_account_sync SET cursor = ? WHERE id = 1").run(input.syncSeq);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function getCustomerAccountCursor(db: DatabaseSync): number {
  return Number(db.prepare("SELECT cursor FROM web_customer_account_sync WHERE id = 1").get()?.cursor ?? 0);
}

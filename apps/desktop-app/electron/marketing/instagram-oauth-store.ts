import type { DatabaseSync } from "node:sqlite";
import { MarketingError } from "./validation";

/** OAuth is the only writer of Instagram access credentials. */
export function saveInstagramOAuth(db: DatabaseSync, account: {
  accountId: string; username: string; encryptedToken: string; expiresAt: string;
}) {
  if (!/^\d{1,40}$/.test(account.accountId) || !/^[A-Za-z0-9_.]{1,64}$/.test(account.username) ||
      !account.encryptedToken.startsWith("safe-storage:v1:") || !Number.isFinite(Date.parse(account.expiresAt)))
    throw new MarketingError("invalid_configuration", "Instagram bağlantısı geçersiz.");
  const business = db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get() as {id:string}|undefined;
  if (!business) throw new MarketingError("business_missing", "İşletme kaydı bulunamadı.");
  db.prepare(`INSERT INTO marketing_provider_config VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(business_id,provider_id) DO UPDATE SET
    enabled=excluded.enabled,account_id=excluded.account_id,sender_id=excluded.sender_id,
    secret_one_encrypted=excluded.secret_one_encrypted,secret_two_encrypted=excluded.secret_two_encrypted,updated_at=excluded.updated_at`)
    .run(business.id,"instagram_api",1,account.accountId,account.username,"BIREYSEL",account.encryptedToken,account.expiresAt,new Date().toISOString());
}
export function disconnectInstagramOAuth(db: DatabaseSync) {
  const business = db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get() as {id:string}|undefined;
  if (!business) return;
  db.prepare(`INSERT INTO marketing_provider_config VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(business_id,provider_id) DO UPDATE SET
    enabled=0,account_id='',sender_id='',secret_one_encrypted='',secret_two_encrypted='',updated_at=excluded.updated_at`)
    .run(business.id,"instagram_api",0,"","","BIREYSEL","","",new Date().toISOString());
}

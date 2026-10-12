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
    account_id=excluded.account_id,sender_id=excluded.sender_id,
    secret_one_encrypted=excluded.secret_one_encrypted,secret_two_encrypted=excluded.secret_two_encrypted,updated_at=excluded.updated_at`)
    .run(business.id,"instagram_api",0,account.accountId,account.username,"BIREYSEL",account.encryptedToken,account.expiresAt,new Date().toISOString());
}
/** Pause/resume publishing without touching the OAuth identity or encrypted token. */
export function setInstagramOAuthEnabled(db: DatabaseSync, enabled: boolean) {
  if (typeof enabled !== "boolean") throw new MarketingError("invalid_configuration", "Instagram servis durumu geçersiz.");
  const business = db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get() as {id:string}|undefined;
  if (!business) throw new MarketingError("business_missing", "İşletme kaydı bulunamadı.");
  const stored = db.prepare("SELECT account_id, sender_id, secret_one_encrypted, secret_two_encrypted FROM marketing_provider_config WHERE business_id=? AND provider_id='instagram_api'")
    .get(business.id) as {account_id:string;sender_id:string;secret_one_encrypted:string;secret_two_encrypted:string}|undefined;
  if (enabled && (!stored?.account_id || !stored.sender_id || !stored.secret_one_encrypted.startsWith("safe-storage:v1:") ||
      !Number.isFinite(Date.parse(stored.secret_two_encrypted)) || Date.parse(stored.secret_two_encrypted) <= Date.now())) {
    throw new MarketingError("unconfigured", "Instagram erişimi geçerli değil. Hesabı yeniden bağlayın.");
  }
  if (!stored) return;
  db.prepare("UPDATE marketing_provider_config SET enabled=?, updated_at=? WHERE business_id=? AND provider_id='instagram_api'")
    .run(enabled ? 1 : 0, new Date().toISOString(), business.id);
}
export function disconnectInstagramOAuth(db: DatabaseSync) {
  const business = db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get() as {id:string}|undefined;
  if (!business) return;
  db.prepare(`INSERT INTO marketing_provider_config VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(business_id,provider_id) DO UPDATE SET
    enabled=0,account_id='',sender_id='',secret_one_encrypted='',secret_two_encrypted='',updated_at=excluded.updated_at`)
    .run(business.id,"instagram_api",0,"","","BIREYSEL","","",new Date().toISOString());
}

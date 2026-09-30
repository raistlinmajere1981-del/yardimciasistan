import { DatabaseSync } from "node:sqlite";
import { safeStorage } from "electron";

export type KbsProvider = "egm" | "jandarma";

export interface KbsSettings {
  enabled: boolean;
  provider: KbsProvider;
  facilityCode: string;
  username: string;
  authorizedIdentityNumber: string;
  passwordConfigured: boolean;
}

export interface SaveKbsSettingsInput {
  enabled: boolean;
  provider: KbsProvider;
  facilityCode: string;
  username: string;
  authorizedIdentityNumber: string;
  password: string;
  clearPassword: boolean;
}

export type KbsSettingsSaveResult =
  | { ok: true; message: string; settings: KbsSettings }
  | { ok: false; message: string };

export type KbsConnectionTestResult =
  | {
      ok: true;
      message: string;
      provider: KbsProvider;
      credentialsVerified: boolean;
      requiresWebLogin: boolean;
      portalUrl?: string;
    }
  | { ok: false; message: string };

export interface KbsRuntimeCredentials {
  provider: KbsProvider;
  facilityCode: string;
  username: string;
  authorizedIdentityNumber: string;
  password: string;
}

interface StoredKbsSettings {
  enabled: boolean;
  provider: KbsProvider;
  facilityCode: string;
  username: string;
  authorizedIdentityNumber: string;
  encryptedPassword: string;
}

const SAFE_STORAGE_PREFIX = "safe-storage:v1:";
export const EGM_KBS_PORTAL_URL = "https://kbs.egm.gov.tr";
export const JANDARMA_KBS_SERVICE_URL = "https://vatandas.jandarma.gov.tr/KBS_Tesis_Servis/SrvShsYtkTml.svc";

export function getKbsSettings(databasePath: string): KbsSettings {
  const stored = readStoredSettings(databasePath);
  return {
    enabled: stored.enabled,
    provider: stored.provider,
    facilityCode: stored.facilityCode,
    username: stored.username,
    authorizedIdentityNumber: stored.authorizedIdentityNumber,
    passwordConfigured: Boolean(stored.encryptedPassword)
  };
}

export function saveKbsSettings(databasePath: string, input: SaveKbsSettingsInput): KbsSettingsSaveResult {
  const current = readStoredSettings(databasePath);
  const normalized = normalizeInput(input);
  const validation = validateInput(normalized, {
    passwordAvailable: Boolean(normalized.password) || (!normalized.clearPassword && Boolean(current.encryptedPassword))
  });
  if (validation) return { ok: false, message: validation };

  const passwordUpdate = resolveSecretUpdate(normalized.password, normalized.clearPassword, current.encryptedPassword, "KBS parolası");
  if (!passwordUpdate.ok) return passwordUpdate;
  const db = new DatabaseSync(databasePath);
  try {
    ensureKbsSettingsTable(db);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO kbs_service_settings (
        id, enabled, provider, facility_code, username, authorized_identity_number,
        password_encrypted, second_factor_secret_encrypted, created_at, updated_at
      ) VALUES ('primary', ?, ?, ?, ?, ?, ?, '', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        enabled = excluded.enabled,
        provider = excluded.provider,
        facility_code = excluded.facility_code,
        username = excluded.username,
        authorized_identity_number = excluded.authorized_identity_number,
        password_encrypted = excluded.password_encrypted,
        second_factor_secret_encrypted = excluded.second_factor_secret_encrypted,
        updated_at = excluded.updated_at
    `).run(
      normalized.enabled ? 1 : 0,
      normalized.provider,
      normalized.facilityCode,
      normalized.username,
      normalized.authorizedIdentityNumber,
      passwordUpdate.encryptedValue,
      now,
      now
    );

    if (!current.enabled && normalized.enabled) {
      backfillActiveArrivalNotifications(db, now);
    }
  } finally {
    db.close();
  }

  return {
    ok: true,
    message: normalized.enabled
      ? "Kimlik Bildirim Sistemi ayarları kaydedildi."
      : "Kimlik Bildirim Sistemi kapatıldı.",
    settings: getKbsSettings(databasePath)
  };
}

export function resolveKbsRuntimeCredentials(
  databasePath: string,
  input?: SaveKbsSettingsInput
): { ok: true; credentials: KbsRuntimeCredentials } | { ok: false; message: string } {
  const current = readStoredSettings(databasePath);
  const normalized = input ? normalizeInput(input) : {
    enabled: current.enabled,
    provider: current.provider,
    facilityCode: current.facilityCode,
    username: current.username,
    authorizedIdentityNumber: current.authorizedIdentityNumber,
    password: "",
    clearPassword: false
  };
  const password = normalized.password
    || (normalized.clearPassword ? "" : decryptSecret(current.encryptedPassword));
  const validation = validateInput(normalized, {
    passwordAvailable: Boolean(password)
  });
  if (validation) return { ok: false, message: validation };
  return {
    ok: true,
    credentials: {
      provider: normalized.provider,
      facilityCode: normalized.facilityCode,
      username: normalized.username,
      authorizedIdentityNumber: normalized.authorizedIdentityNumber,
      password
    }
  };
}

export async function testKbsConnection(
  databasePath: string,
  input: SaveKbsSettingsInput
): Promise<KbsConnectionTestResult> {
  const resolved = resolveKbsRuntimeCredentials(databasePath, input);
  if (!resolved.ok) return resolved;
  const normalized = normalizeInput(input);

  if (normalized.provider === "egm") {
    return {
      ok: true,
      provider: "egm",
      credentialsVerified: false,
      requiresWebLogin: true,
      portalUrl: EGM_KBS_PORTAL_URL,
      message: "EGM KBS bilgileri hazır. Giriş doğrulaması resmi KBS sayfasında tamamlanacak."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${JANDARMA_KBS_SERVICE_URL}?wsdl`, {
      method: "GET",
      headers: { Accept: "text/xml, application/xml, text/plain" },
      signal: controller.signal
    });
    const body = await response.text();
    if (!response.ok || !/definitions|SrvShsYtkTml/i.test(body)) {
      return {
        ok: false,
        message: `Jandarma KBS web servisine ulaşılamadı (HTTP ${response.status}).`
      };
    }
    return {
      ok: true,
      provider: "jandarma",
      credentialsVerified: false,
      requiresWebLogin: false,
      message: "Jandarma KBS web servis adresine ulaşıldı. Hesap yetkisi gerçek servis çağrısı etkinleştirildiğinde ayrıca doğrulanacak."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.name === "AbortError"
        ? "Jandarma KBS bağlantı testi zaman aşımına uğradı."
        : "Jandarma KBS web servisine ulaşılamadı."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readStoredSettings(databasePath: string): StoredKbsSettings {
  const db = new DatabaseSync(databasePath);
  try {
    ensureKbsSettingsTable(db);
    const row = db.prepare("SELECT * FROM kbs_service_settings WHERE id = 'primary' LIMIT 1").get() as Record<string, unknown> | undefined;
    return {
      enabled: Number(row?.enabled ?? 0) === 1,
      provider: row?.provider === "jandarma" ? "jandarma" : "egm",
      facilityCode: String(row?.facility_code ?? "").trim(),
      username: String(row?.username ?? "").trim(),
      authorizedIdentityNumber: String(row?.authorized_identity_number ?? "").trim(),
      encryptedPassword: String(row?.password_encrypted ?? "").trim()
    };
  } finally {
    db.close();
  }
}

function ensureKbsSettingsTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kbs_service_settings (
      id TEXT PRIMARY KEY CHECK (id = 'primary'),
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      provider TEXT NOT NULL DEFAULT 'egm' CHECK (provider IN ('egm', 'jandarma')),
      facility_code TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      authorized_identity_number TEXT NOT NULL DEFAULT '',
      password_encrypted TEXT NOT NULL DEFAULT '',
      second_factor_secret_encrypted TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function normalizeInput(input: SaveKbsSettingsInput): SaveKbsSettingsInput {
  return {
    enabled: input?.enabled === true,
    provider: input?.provider === "jandarma" ? "jandarma" : "egm",
    facilityCode: String(input?.facilityCode ?? "").trim(),
    username: String(input?.username ?? "").trim(),
    authorizedIdentityNumber: String(input?.authorizedIdentityNumber ?? "").replace(/\D/g, ""),
    password: String(input?.password ?? "").trim(),
    clearPassword: input?.clearPassword === true
  };
}

function validateInput(
  input: SaveKbsSettingsInput,
  availability: { passwordAvailable: boolean }
): string | null {
  if (!input.enabled) return null;
  if (!/^\d{11}$/.test(input.authorizedIdentityNumber)) {
    return "KBS yetkilisi için 11 haneli T.C. kimlik numarası gerekli.";
  }
  if (!availability.passwordAvailable) {
    return input.provider === "jandarma"
      ? "Jandarma KBS web servis şifresi gerekli."
      : "EGM KBS parolası gerekli.";
  }
  if (input.provider === "jandarma") {
    if (!/^\d{6}$/.test(input.facilityCode)) {
      return "Jandarma KBS için 6 haneli tesis kodu gerekli.";
    }
    return null;
  }
  if (!input.username || input.username.length > 120 || /[\x00-\x1F\x7F]/.test(input.username)) {
    return "EGM KBS kullanıcı adı gerekli.";
  }
  return null;
}

function resolveSecretUpdate(
  rawValue: string,
  clearRequested: boolean,
  existingEncryptedValue: string,
  label: string
): { ok: true; encryptedValue: string } | { ok: false; message: string } {
  if (clearRequested) return { ok: true, encryptedValue: "" };
  if (!rawValue) return { ok: true, encryptedValue: existingEncryptedValue };
  if (rawValue.length > 8192 || /[\x00-\x1F\x7F]/.test(rawValue)) {
    return { ok: false, message: `${label} geçersiz karakter içeriyor.` };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, message: `${label} bu cihazda güvenli biçimde saklanamıyor.` };
  }
  try {
    return {
      ok: true,
      encryptedValue: SAFE_STORAGE_PREFIX + safeStorage.encryptString(rawValue).toString("base64")
    };
  } catch {
    return { ok: false, message: `${label} güvenli biçimde kaydedilemedi.` };
  }
}

function decryptSecret(encryptedValue: string): string {
  if (!encryptedValue.startsWith(SAFE_STORAGE_PREFIX) || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(encryptedValue.slice(SAFE_STORAGE_PREFIX.length), "base64")).trim();
  } catch {
    return "";
  }
}


function backfillActiveArrivalNotifications(db: DatabaseSync, now: string) {
  db.prepare(`
    INSERT INTO hospitality_notifications (
      id, guest_id, stay_id, room_id, kind, occurred_at, identity_snapshot, created_at
    )
    SELECT
      lower(hex(randomblob(16))),
      g.id,
      g.stay_id,
      s.room_id,
      'arrival',
      COALESCE(NULLIF(g.checked_in_at, ''), NULLIF(s.checked_in_at, ''), ?),
      json_object(
        'customerId', c.id,
        'fullName', c.full_name,
        'identityType', c.identity_type,
        'identityNumber', c.identity_number,
        'nationality', c.nationality,
        'birthDate', c.birth_date,
        'documentSerialNumber', c.document_serial_number,
        'documentExpiryDate', c.document_expiry_date,
        'gender', c.gender,
        'birthPlace', c.birth_place,
        'motherName', c.mother_name,
        'fatherName', c.father_name,
        'issuingAuthority', c.issuing_authority,
        'address', c.address,
        'phone', c.phone,
        'roomNumber', r.number
      ),
      ?
    FROM stay_guests g
    JOIN customer_room_stays s ON s.id = g.stay_id
    JOIN customers c ON c.id = g.customer_id
    JOIN rooms r ON r.id = s.room_id
    WHERE g.status = 'checked_in'
      AND s.status = 'checked_in'
      AND s.deleted_at = ''
      AND NOT EXISTS (
        SELECT 1
        FROM hospitality_notifications n
        WHERE n.guest_id = g.id
          AND n.kind = 'arrival'
      )
  `).run(now, now);
}

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const APP_PASSWORD_MIN_LENGTH = 6;
const APP_PASSWORD_MAX_LENGTH = 128;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const VERIFIER_PREFIX = "ya-lock:v1";

export interface AppLockStatus {
  locked: boolean;
  passwordConfigured: boolean;
  notificationCount: number;
}

export interface AppLockActionResult {
  ok: boolean;
  message: string;
  status: AppLockStatus;
  retryAfterSeconds?: number;
}

export interface UpdateAppPasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function validateAppPassword(password: string): string | null {
  if (password.length < APP_PASSWORD_MIN_LENGTH) {
    return `Uygulama şifresi en az ${APP_PASSWORD_MIN_LENGTH} karakter olmalı.`;
  }
  if (password.length > APP_PASSWORD_MAX_LENGTH) {
    return `Uygulama şifresi en fazla ${APP_PASSWORD_MAX_LENGTH} karakter olabilir.`;
  }
  if (password.includes("\0")) {
    return "Uygulama şifresi geçersiz bir karakter içeriyor.";
  }
  return null;
}

export async function createAppPasswordVerifier(password: string): Promise<string> {
  const validationMessage = validateAppPassword(password);
  if (validationMessage) {
    throw new Error(validationMessage);
  }

  const salt = randomBytes(16);
  const derivedKey = await deriveAppPassword(password, salt, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION
  });

  return [
    VERIFIER_PREFIX,
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64url"),
    derivedKey.toString("base64url")
  ].join(":");
}

export async function verifyAppPassword(password: string, verifier: string): Promise<boolean> {
  const parsed = parseAppPasswordVerifier(verifier);
  if (!parsed || password.length > APP_PASSWORD_MAX_LENGTH || password.includes("\0")) {
    return false;
  }

  try {
    const candidate = await deriveAppPassword(password, parsed.salt, parsed);
    return candidate.length === parsed.derivedKey.length && timingSafeEqual(candidate, parsed.derivedKey);
  } catch {
    return false;
  }
}

export function secureTextEqual(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function parseAppPasswordVerifier(verifier: string): {
  cost: number;
  blockSize: number;
  parallelization: number;
  salt: Buffer;
  derivedKey: Buffer;
} | null {
  const parts = verifier.split(":");
  if (parts.length !== 7 || `${parts[0]}:${parts[1]}` !== VERIFIER_PREFIX) {
    return null;
  }

  const cost = Number(parts[2]);
  const blockSize = Number(parts[3]);
  const parallelization = Number(parts[4]);
  if (
    cost !== SCRYPT_COST
    || blockSize !== SCRYPT_BLOCK_SIZE
    || parallelization !== SCRYPT_PARALLELIZATION
  ) {
    return null;
  }

  try {
    const saltPart = parts[5];
    const derivedKeyPart = parts[6];
    if (saltPart === undefined || derivedKeyPart === undefined) {
      return null;
    }
    const salt = Buffer.from(saltPart, "base64url");
    const derivedKey = Buffer.from(derivedKeyPart, "base64url");
    if (salt.length !== 16 || derivedKey.length !== SCRYPT_KEY_LENGTH) {
      return null;
    }
    return { cost, blockSize, parallelization, salt, derivedKey };
  } catch {
    return null;
  }
}

function deriveAppPassword(
  password: string,
  salt: Buffer,
  parameters: { cost: number; blockSize: number; parallelization: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFC"),
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem: SCRYPT_MAX_MEMORY
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

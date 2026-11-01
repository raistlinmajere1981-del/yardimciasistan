import { createHash, createPrivateKey, createPublicKey, randomBytes, webcrypto, X509Certificate } from "node:crypto";
import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import type { SafeStorage } from "electron";
import { BitString, fromBER, Integer, OctetString, Sequence, Utf8String } from "asn1js";
import { AltName, AttributeTypeAndValue, BasicConstraints, Certificate, CryptoEngine, Extension, ExtKeyUsage, GeneralName } from "pkijs";

const DAY = 86_400_000;
const SERVER_AUTH = "1.3.6.1.5.5.7.3.1";
const IDENTITY_DIRECTORY = "local-companion-tls";
const IDENTITY_FILE = "identity.enc";
// Explicit engine argument avoids changing PKI.js's process-wide crypto provider.
const cryptoEngine = new CryptoEngine({ name: "companion-node-webcrypto", crypto: webcrypto as unknown as Crypto });

type IdentityErrorCode = "tls_storage_unavailable" | "tls_identity_invalid" | "tls_identity_io" | "tls_addresses_invalid" | "tls_clock_invalid";

export class LocalCompanionTlsIdentityError extends Error {
  constructor(readonly code: IdentityErrorCode) {
    // Never attach crypto/JSON/safeStorage errors: their messages can contain secrets.
    super(code);
    this.name = "LocalCompanionTlsIdentityError";
  }
}

export interface LocalCompanionTlsIdentityOptions {
  /** Electron app.getPath("userData"), after app readiness; never the business DB/backup path. */
  userDataPath: string;
  safeStorage: Pick<SafeStorage, "isEncryptionAvailable" | "getSelectedStorageBackend" | "encryptString" | "decryptString">;
  platform?: NodeJS.Platform;
  addresses?: () => string[];
  now?: () => number;
}

export interface LocalCompanionTlsPublicIdentity {
  /** Unpadded base64url SHA-256 of DER SubjectPublicKeyInfo (32 bytes). */
  spkiSha256: string;
  certificatePem: string;
  ipAddresses: readonly string[];
}

export interface LocalCompanionTlsMaterial extends LocalCompanionTlsPublicIdentity {
  /** Main-process TLS boundary only; never expose through IPC, QR, diagnostics or JSON. */
  privateKeyPem: string;
}

interface StoredIdentity {
  version: 1;
  privateKeyPem: string;
  certificatePem: string;
  ipAddresses: string[];
}

function normalizeAddresses(addresses: string[]): string[] {
  const result = addresses.map(value => {
    const ip = value.split("%")[0] ?? "";
    const family = isIP(ip);
    if (!family || ip === "0.0.0.0" || ip === "::") throw new LocalCompanionTlsIdentityError("tls_addresses_invalid");
    return family === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip;
  });
  if (!result.length) throw new LocalCompanionTlsIdentityError("tls_addresses_invalid");
  return [...new Set(result)].sort();
}

function interfaceAddresses(): string[] {
  return Object.values(networkInterfaces()).flatMap(entries => entries?.map(entry => entry.address) ?? []);
}

function ipBytes(address: string): Uint8Array {
  if (isIP(address) === 4) return Uint8Array.from(address.split(".").map(Number));
  const [left = "", right = ""] = address.split("::");
  const start = left ? left.split(":") : [];
  const end = right ? right.split(":") : [];
  const groups = address.includes("::") ? [...start, ...Array<string>(8 - start.length - end.length).fill("0"), ...end] : start;
  return Uint8Array.from(groups.flatMap(group => {
    const value = Number.parseInt(group, 16);
    return [value >> 8, value & 255];
  }));
}

function pem(label: string, bytes: ArrayBuffer): string {
  return `-----BEGIN ${label}-----\n${Buffer.from(bytes).toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END ${label}-----\n`;
}

/** DER INTEGER encoding for an unsigned magnitude, not a two's-complement input. */
function unsignedInteger(bytes: Uint8Array): Integer {
  if (!bytes.length) throw new LocalCompanionTlsIdentityError("tls_identity_invalid");
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  const magnitude = bytes.subarray(start);
  const padding = ((magnitude[0] ?? 0) & 0x80) !== 0 ? 1 : 0;
  const value = new Uint8Array(magnitude.length + padding);
  value.set(magnitude, padding);
  return new Integer({ valueHex: value });
}

async function issueCertificate(privateKeyPem: string, addresses: string[], now: number): Promise<string> {
  const key = createPrivateKey(privateKeyPem);
  const privateKey = await webcrypto.subtle.importKey("pkcs8", key.export({ format: "der", type: "pkcs8" }), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const publicKey = await webcrypto.subtle.importKey("spki", createPublicKey(key).export({ format: "der", type: "spki" }), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  const certificate = new Certificate();
  certificate.version = 2;
  // Positive, unpredictable 159-bit serial; no embedded install/customer identity.
  const serial = randomBytes(20);
  serial[0] = (serial[0] ?? 0) & 0x7f;
  // Masking the sign bit can leave 00 followed by a byte below 80. Passing that
  // directly to Integer emits redundant padding, rejected by OpenSSL's X509 parser.
  if (serial.every(byte => byte === 0)) throw new LocalCompanionTlsIdentityError("tls_identity_invalid");
  certificate.serialNumber = unsignedInteger(serial);
  const name = new AttributeTypeAndValue({ type: "2.5.4.3", value: new Utf8String({ value: "Yardimci Local Companion" }) });
  certificate.subject.typesAndValues.push(name);
  certificate.issuer.typesAndValues.push(name);
  certificate.notBefore.value = new Date(now - DAY);
  certificate.notAfter.value = new Date(now + 365 * DAY);
  certificate.extensions = [
    new Extension({ extnID: "2.5.29.19", critical: true, extnValue: new BasicConstraints({ cA: false }).toSchema().toBER(false) }),
    new Extension({ extnID: "2.5.29.15", critical: true, extnValue: new BitString({ unusedBits: 7, valueHex: new Uint8Array([0x80]) }).toBER(false) }),
    new Extension({ extnID: "2.5.29.37", extnValue: new ExtKeyUsage({ keyPurposes: [SERVER_AUTH] }).toSchema().toBER(false) }),
    new Extension({ extnID: "2.5.29.17", extnValue: new AltName({ altNames: addresses.map(address => new GeneralName({ type: 7, value: new OctetString({ valueHex: ipBytes(address) }) })) }).toSchema().toBER(false) })
  ];
  await certificate.subjectPublicKeyInfo.importKey(publicKey as unknown as CryptoKey, cryptoEngine);
  await certificate.sign(privateKey as unknown as CryptoKey, "SHA-256", cryptoEngine);
  // PKI.js createCMSECDSASignature / ASN1.js toDER strips at most one leading
  // zero. Canonicalize r/s fully, including rare multi-zero P-256 magnitudes.
  // Only signature encoding changes; the signed TBS bytes remain untouched.
  const signature = fromBER(certificate.signatureValue.valueBlock.valueHexView);
  if (signature.offset !== certificate.signatureValue.valueBlock.valueHexView.length
    || !(signature.result instanceof Sequence) || signature.result.valueBlock.value.length !== 2
    || !signature.result.valueBlock.value.every(value => value instanceof Integer)) {
    throw new LocalCompanionTlsIdentityError("tls_identity_invalid");
  }
  certificate.signatureValue = new BitString({ unusedBits: 0, valueHex: new Sequence({
    value: signature.result.valueBlock.value.map(value => unsignedInteger(value.valueBlock.valueHexView))
  }).toBER(false) });
  return pem("CERTIFICATE", certificate.toSchema().toBER(false));
}

/** Owns per-user install identity and same-key certificate renewal. No listener or IPC. */
export class LocalCompanionTlsIdentity {
  private operation: Promise<unknown> = Promise.resolve();
  private establishedPin: string | null = null;

  constructor(private readonly options: LocalCompanionTlsIdentityOptions) {}

  /** Call on startup and on interface reconciliation; serialized within this owner. */
  load(): Promise<LocalCompanionTlsMaterial> {
    const operation = this.operation.then(() => this.loadIdentity());
    this.operation = operation.catch(() => undefined);
    return operation;
  }

  /** Safe future QR interface; never returns private material. */
  async publicIdentity(): Promise<LocalCompanionTlsPublicIdentity> {
    const { spkiSha256, certificatePem, ipAddresses } = await this.load();
    return { spkiSha256, certificatePem, ipAddresses };
  }

  private requireSecureStorage(): void {
    try {
      const storage = this.options.safeStorage;
      const backend = (this.options.platform ?? process.platform) === "linux" ? storage.getSelectedStorageBackend() : "os";
      if (!storage.isEncryptionAvailable() || !backend || backend === "basic_text" || backend === "unknown") throw new Error();
    } catch {
      throw new LocalCompanionTlsIdentityError("tls_storage_unavailable");
    }
  }

  private validate(stored: unknown): StoredIdentity {
    try {
      if (!stored || typeof stored !== "object") throw new Error();
      const value = stored as Partial<StoredIdentity>;
      if (value.version !== 1 || typeof value.privateKeyPem !== "string" || typeof value.certificatePem !== "string"
        || !Array.isArray(value.ipAddresses) || !value.ipAddresses.every(ip => typeof ip === "string")) throw new Error();
      const key = createPrivateKey(value.privateKeyPem);
      const cert = new X509Certificate(value.certificatePem);
      if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
        || !cert.checkPrivateKey(key) || !cert.verify(cert.publicKey) || cert.subject !== cert.issuer || cert.ca
        || !cert.keyUsage?.includes(SERVER_AUTH)) throw new Error();
      const addresses = normalizeAddresses(value.ipAddresses);
      if (addresses.some(ip => !cert.checkIP(ip))) throw new Error();
      return { version: 1, privateKeyPem: value.privateKeyPem, certificatePem: value.certificatePem, ipAddresses: addresses };
    } catch {
      throw new LocalCompanionTlsIdentityError("tls_identity_invalid");
    }
  }

  private persist(directory: string, file: string, identity: StoredIdentity): void {
    const temporary = join(directory, `.identity-${randomBytes(12).toString("hex")}.tmp`);
    let fd: number | undefined;
    try {
      this.requireSecureStorage();
      const encrypted = this.options.safeStorage.encryptString(JSON.stringify(identity));
      if (!encrypted.length) throw new Error();
      fd = openSync(temporary, "wx", 0o600);
      writeFileSync(fd, encrypted);
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(temporary, file);
      if ((this.options.platform ?? process.platform) !== "win32") {
        const directoryFd = openSync(directory, "r");
        try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
      }
    } catch (error) {
      if (error instanceof LocalCompanionTlsIdentityError) throw error;
      throw new LocalCompanionTlsIdentityError("tls_identity_io");
    } finally {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(temporary); } catch { /* Renamed or never created. */ }
    }
  }

  private async loadIdentity(): Promise<LocalCompanionTlsMaterial> {
    this.requireSecureStorage();
    const addresses = normalizeAddresses((this.options.addresses ?? interfaceAddresses)());
    const now = (this.options.now ?? Date.now)();
    if (!Number.isFinite(now) || now < Date.UTC(2024, 0, 1) || now > Date.UTC(9998, 0, 1)) throw new LocalCompanionTlsIdentityError("tls_clock_invalid");
    const directory = join(this.options.userDataPath, IDENTITY_DIRECTORY);
    const file = join(directory, IDENTITY_FILE);
    let firstInstall = false;
    let identity: StoredIdentity;
    try {
      try {
        mkdirSync(directory, { mode: 0o700 });
        firstInstall = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const dirStat = lstatSync(directory);
      if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error();
      if ((this.options.platform ?? process.platform) !== "win32") chmodSync(directory, 0o700);
      if (firstInstall) {
        if (this.establishedPin) throw new LocalCompanionTlsIdentityError("tls_identity_invalid");
        const keys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        const privateKeyPem = pem("PRIVATE KEY", await webcrypto.subtle.exportKey("pkcs8", keys.privateKey));
        identity = this.validate({ version: 1, privateKeyPem, certificatePem: await issueCertificate(privateKeyPem, addresses, now), ipAddresses: addresses });
        this.persist(directory, file, identity);
      } else {
        // An existing directory with a missing/empty/corrupt key is NOT a first install.
        const stat = lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 64 * 1024) throw new Error();
        if ((this.options.platform ?? process.platform) !== "win32") chmodSync(file, 0o600);
        try {
          identity = this.validate(JSON.parse(this.options.safeStorage.decryptString(readFileSync(file))) as unknown);
        } catch {
          throw new LocalCompanionTlsIdentityError("tls_identity_invalid");
        }
      }
    } catch (error) {
      if (error instanceof LocalCompanionTlsIdentityError) throw error;
      throw new LocalCompanionTlsIdentityError(firstInstall ? "tls_identity_io" : "tls_identity_invalid");
    }
    const certificate = new X509Certificate(identity.certificatePem);
    const spkiSha256 = createHash("sha256").update(certificate.publicKey.export({ format: "der", type: "spki" })).digest("base64url");
    if (this.establishedPin && this.establishedPin !== spkiSha256) throw new LocalCompanionTlsIdentityError("tls_identity_invalid");
    if (Date.parse(certificate.validFrom) > now) throw new LocalCompanionTlsIdentityError("tls_clock_invalid");
    if (Date.parse(certificate.validTo) <= now + 30 * DAY || JSON.stringify(identity.ipAddresses) !== JSON.stringify(addresses)) {
      identity = this.validate({ ...identity, certificatePem: await issueCertificate(identity.privateKeyPem, addresses, now), ipAddresses: addresses });
      this.persist(directory, file, identity);
    }
    this.establishedPin = spkiSha256;
    return {
      privateKeyPem: identity.privateKeyPem,
      certificatePem: identity.certificatePem,
      ipAddresses: [...identity.ipAddresses],
      spkiSha256
    };
  }
}

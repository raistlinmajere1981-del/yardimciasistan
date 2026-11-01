import { randomBytes } from "node:crypto";
import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SafeStorage } from "electron";
import { CommerceBenefitsError } from "./commerce-benefits-engine.js";
import type { BenefitsSecretKey } from "./commerce-benefits-rules.js";

type Storage = Pick<SafeStorage, "isEncryptionAvailable" | "getSelectedStorageBackend" | "encryptString" | "decryptString">;
/** Separate purpose/key lifecycle from TLS. Lazy, per OS user; never in SQLite or backups. */
export class CommerceBenefitsKey {
  constructor(private readonly root: string, private readonly storage: Storage, private readonly platform = process.platform) {}
  available(): boolean {
    try {
      const backend = this.platform === "linux" ? this.storage.getSelectedStorageBackend() : "os";
      return this.storage.isEncryptionAvailable() && Boolean(backend) && backend !== "basic_text" && backend !== "unknown";
    } catch { return false; }
  }
  load(allowCreate = true): BenefitsSecretKey {
    if (!this.available()) throw new CommerceBenefitsError("BENEFITS_SECURE_STORAGE_UNAVAILABLE");
    const directory = join(this.root, "commerce-benefits-key-v1"), file = join(directory, "key.enc");
    let first = false;
    try {
      try { if (allowCreate) { mkdirSync(directory, { mode: 0o700 }); first = true; } }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      const dir = lstatSync(directory);
      if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error();
      if (this.platform !== "win32") chmodSync(directory, 0o700);
      if (first) {
        const temporary = join(directory, "key.tmp");
        let fd: number | undefined;
        try {
          const encrypted = this.storage.encryptString(JSON.stringify({ version: 1, key: randomBytes(32).toString("hex") }));
          if (!encrypted.length) throw new Error();
          fd = openSync(temporary, "wx", 0o600);
          writeFileSync(fd, encrypted); fsyncSync(fd); closeSync(fd); fd = undefined;
          renameSync(temporary, file);
          if (this.platform !== "win32") {
            const directoryFd = openSync(directory, "r");
            try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
          }
        } finally {
          if (fd !== undefined) closeSync(fd);
          try { unlinkSync(temporary); } catch { /* renamed or never created */ }
        }
      }
      // Missing/corrupt existing keys fail closed; never silently rotate receipt/coupon HMACs.
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 8192) throw new Error();
      if (this.platform !== "win32") chmodSync(file, 0o600);
      const value = JSON.parse(this.storage.decryptString(readFileSync(file))) as { version?: unknown; key?: unknown };
      if (value.version !== 1 || typeof value.key !== "string" || !/^[a-f0-9]{64}$/.test(value.key)) throw new Error();
      return { id: "desktop-benefits-v1", key: Buffer.from(value.key, "hex") };
    } catch { throw new CommerceBenefitsError("BENEFITS_SECURE_STORAGE_UNAVAILABLE"); }
  }
}

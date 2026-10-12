import type { ReleaseOperationRequest } from "../../shared/contracts";

export type ProductReleaseSnapshot = {
  version: string;
  androidVersionCode: number;
  webModuleVersion: string;
};

export type VersionPreparationStep = {
  label: string;
  command: string;
  args: string[];
};

function versionParts(value: unknown): number[] {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/.test(value)) {
    throw new Error("Sürüm üç sayılı biçimde olmalı (ör. 2.0.6).");
  }
  return value.split(".").map(Number);
}

function compareVersions(left: string, right: string) {
  const a = versionParts(left), b = versionParts(right);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

/** Uses the canonical product-version scripts; never modifies files directly. */
export function planReleaseVersion(
  request: ReleaseOperationRequest,
  current: ProductReleaseSnapshot,
  npm: string
): { nextVersion: string; nextAndroidCode: number; nextWebVersion: string; steps: VersionPreparationStep[] } {
  if (request.action !== "version" || typeof request.version !== "string" || typeof request.updateWebModule !== "boolean") {
    throw new Error("Geçersiz sürüm hazırlama isteği.");
  }
  const next = request.version.trim();
  if (compareVersions(next, current.version) <= 0) {
    throw new Error(`Yeni ürün sürümü ${current.version} sürümünden büyük olmalı.`);
  }
  if (request.updateWebModule && compareVersions(next, current.webModuleVersion) < 0) {
    throw new Error(`Web modülü sürümü ${current.webModuleVersion} sürümünden geriye alınamaz.`);
  }
  if (!Number.isSafeInteger(current.androidVersionCode) || current.androidVersionCode < 1 || current.androidVersionCode >= 2_100_000_000) {
    throw new Error("Android versionCode artırılamıyor.");
  }
  return {
    nextVersion: next,
    nextAndroidCode: current.androidVersionCode + 1,
    nextWebVersion: request.updateWebModule ? next : current.webModuleVersion,
    steps: [
      { label: `Ürün sürümü ${next} hazırlanıyor`, command: npm, args: ["run", "version:set", "--", next] },
      ...(request.updateWebModule
        ? [{ label: `Web modülü sürümü ${next} hazırlanıyor`, command: npm, args: ["run", "version:web:set", "--", next] }]
        : []),
      { label: "Sürüm metadata doğrulaması", command: npm, args: ["run", "version:check"] }
    ]
  };
}

import { cloudflareAiAccountId, isCloudflareAiBaseUrl } from "@yardimci-asistan/shared";
import { classifyCloudflareFailure } from "./cloudflare";
import type { AICompletionFailureReason } from "../types";

export interface CloudflareModelOption {
  id: string;
  label: string;
  task: "text" | "vision" | "image" | "stt";
}
export type CloudflareModelListResult =
  | { ok: true; models: CloudflareModelOption[] }
  | { ok: false; reason: AICompletionFailureReason; message: string };

const MODEL_ID = /^@cf\/[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_.-]*$/i;

export function isCloudflareTextModelId(value: string): boolean {
  return MODEL_ID.test(value) && value.length <= 160;
}
function normalizeTask(input: unknown): CloudflareModelOption["task"] | undefined {
  const raw = (typeof input === "string" ? input
    : input && typeof input === "object" && "name" in input ? String(input.name) : "").toLowerCase();
  if (raw === "text-generation" || raw === "text-to-text") return "text";
  if (raw === "image-text-to-text" || raw === "image-to-text") return "vision";
  if (raw === "text-to-image") return "image";
  if (raw === "automatic-speech-recognition") return "stt";
  return undefined;
}
function parseRows(input: unknown): CloudflareModelOption[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((candidate): CloudflareModelOption[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const row = candidate as Record<string, unknown>;
    const id = String(row.name ?? row.model ?? "").trim();
    const task = normalizeTask(row.task);
    if (!isCloudflareTextModelId(id) || !task) return [];
    const displayName = typeof row.description === "string" && row.description.length <= 100
      ? row.description.trim() : "";
    return [{ id, label: displayName ? id : id, task }];
  });
}

/** Official searchable catalog. The listing is discovery, NOT entitlement, balance or quota verification. */
export async function listCloudflareAiModels(
  options: { baseUrl: string; apiKey: string; timeoutMs?: number },
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<CloudflareModelListResult> {
  if (!isCloudflareAiBaseUrl(options.baseUrl) || !options.apiKey || options.apiKey.length > 8192
    || /[\x00-\x20\x7f]/.test(options.apiKey)) {
    return { ok: false, reason: "configuration", message: "Cloudflare hesap adresi veya API Token geçersiz." };
  }
  const account = cloudflareAiAccountId(options.baseUrl.replace(/\/+$/, ""));
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/models/search?hide_experimental=true&per_page=100`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(options.timeoutMs ?? 15000, 1000), 120000));
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${options.apiKey}` },
      redirect: "error",
      signal: controller.signal
    });
    const raw = await response.text();
    if (raw.length > 512 * 1024) throw new Error("oversized");
    const payload = JSON.parse(raw) as { success?: boolean; result?: unknown; errors?: Array<{ code?: number }> };
    if (!response.ok || !payload.success) {
      return { ok: false, reason: classifyCloudflareFailure(response.status, String(payload.errors?.[0]?.code ?? "")),
        message: "Cloudflare model listesi alınamadı; token yetkilerini kontrol edin." };
    }
    const rows = parseRows(payload.result);
    const unique = new Map(rows.map(row => [row.id, row]));
    return { ok: true, models: [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 100) };
  } catch (error) {
    return { ok: false, reason: controller.signal.aborted ? "timeout" : "network",
      message: "Cloudflare model kataloğuna ulaşılamadı." };
  } finally { clearTimeout(timeout); }
}

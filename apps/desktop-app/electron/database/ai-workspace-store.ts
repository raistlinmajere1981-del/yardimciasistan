import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type {
  AiWorkspaceHistoryEntry,
  AiWorkspaceMode
} from "../database-types.js";
import { parseAiWorkspacePayload } from "./request-utils.js";

export function saveAiWorkspaceHistory(db: DatabaseSync, input: Omit<AiWorkspaceHistoryEntry, "id" | "createdAt">): AiWorkspaceHistoryEntry {
  const id = createId("ai_conv_");
  const createdAt = new Date().toISOString();
  const entry: AiWorkspaceHistoryEntry = {
    ...input,
    id,
    createdAt,
    instructions: input.instructions.trim().slice(0, 800),
    content: input.content.trim().slice(0, 6000),
    summary: input.summary.trim().slice(0, 1600),
    missingFields: input.missingFields.map((field) => field.trim()).filter(Boolean).slice(0, 8)
  };

  db
    .prepare(`
        INSERT INTO ai_conversations (
          id, source, request_id, status, messages_json, summary,
          created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, 'local_only')
      `)
    .run(
      entry.id,
      `desktop_workspace:${entry.mode}`,
      entry.requestId,
      JSON.stringify({
        instructions: entry.instructions,
        content: entry.content,
        missing_fields: entry.missingFields,
        provider: entry.provider,
        model: entry.model,
        fallback: entry.fallback,
        request_label: entry.requestLabel
      }),
      entry.summary,
      entry.createdAt,
      entry.createdAt
    );

  return entry;
}

export function getAiWorkspaceHistory(db: DatabaseSync, limit = 12): AiWorkspaceHistoryEntry[] {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 12));
  const rows = db
    .prepare(`
        SELECT id, source, request_id, messages_json, summary, created_at
        FROM ai_conversations
        WHERE source LIKE 'desktop_workspace:%' AND deleted_at = ''
        ORDER BY created_at DESC
        LIMIT ?
      `)
    .all(safeLimit) as Record<string, unknown>[];

  return rows.map((row) => mapAiWorkspaceHistoryRow(row));
}

export function mapAiWorkspaceHistoryRow(row: Record<string, unknown>): AiWorkspaceHistoryEntry {
  const payload = parseAiWorkspacePayload(row.messages_json);
  const modeCandidate = String(row.source ?? "").replace("desktop_workspace:", "");
  const mode: AiWorkspaceMode = modeCandidate === "summary" || modeCandidate === "daily" ? modeCandidate : "reply";
  return {
    id: String(row.id ?? ""),
    mode,
    requestId: String(row.request_id ?? ""),
    requestLabel: String(payload.request_label ?? ""),
    instructions: String(payload.instructions ?? ""),
    content: String(payload.content ?? ""),
    summary: String(row.summary ?? ""),
    missingFields: Array.isArray(payload.missing_fields) ? payload.missing_fields.map(String).filter(Boolean) : [],
    provider: String(payload.provider ?? "disabled"),
    model: String(payload.model ?? ""),
    fallback: Boolean(payload.fallback),
    createdAt: String(row.created_at ?? "")
  };
}

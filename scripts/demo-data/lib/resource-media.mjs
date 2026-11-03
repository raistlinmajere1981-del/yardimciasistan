import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { FIXED_NOW, writeJson } from "./util.mjs";
import { addPanoramaMedia } from "./panorama-media.mjs";
import { renderDemoPng } from "./png.mjs";

const COVER_WIDTH = 960;
const COVER_HEIGHT = 640;

function safeSegment(value, label) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(text)) throw new Error(`Unsafe ${label}: ${text}`);
  return text;
}

function manifestPath(folderPath, scope) {
  return path.join(folderPath, "assets", scope === "room" ? "room-media" : "table-media", "manifest.json");
}

function writeManifest(folderPath, scope, records) {
  const idField = scope === "room" ? "roomId" : "tableId";
  const media = records
    .slice()
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.id.localeCompare(b.id))
    .map((record) => ({
      id: record.id,
      [idField]: record.resourceId,
      kind: record.kind,
      originalName: record.originalName,
      mimeType: record.mimeType,
      title: record.title,
      sortOrder: record.sortOrder,
      sizeBytes: record.sizeBytes,
      updatedAt: FIXED_NOW,
      remoteUrl: "",
      storedPath: record.storedPath,
      contentHash: record.contentHash
    }));
  writeJson(manifestPath(folderPath, scope), { version: 1, media });
  return path.posix.join("assets", scope === "room" ? "room-media" : "table-media", "manifest.json");
}

function coverRecord(folderPath, entry, seenIds) {
  const scope = entry.scope === "room" || entry.scope === "table" ? entry.scope : null;
  if (!scope) throw new Error(`Invalid cover scope: ${entry.scope}`);
  const resourceId = safeSegment(entry.resourceId, `${scope} id`);
  const id = safeSegment(entry.id, "media id");
  if (seenIds.has(id)) throw new Error(`Duplicate media id: ${id}`);
  seenIds.add(id);
  if (!Array.isArray(entry.palette) || entry.palette.length < 2) {
    throw new Error(`Cover palette required for ${id}`);
  }
  const bytes = renderDemoPng({
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    palette: entry.palette,
    variant: Number.isInteger(entry.variant) ? entry.variant : 0
  });
  const rootDirectory = scope === "room" ? "room-media" : "table-media";
  const storedPath = `files/${resourceId}/${id}.png`;
  const absolutePath = path.join(folderPath, "assets", rootDirectory, "files", resourceId, `${id}.png`);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, bytes);
  const label = String(entry.title ?? "").trim() || resourceId;
  const title = `${label} — Sentetik demo kapak görseli; gerçek işletme fotoğrafı değildir.`;
  return {
    scope,
    resourceId,
    id,
    kind: "cover",
    originalName: `${id}.png`,
    mimeType: "image/png",
    title: title.slice(0, 240),
    sortOrder: Number.isInteger(entry.sortOrder) ? entry.sortOrder : 0,
    sizeBytes: bytes.length,
    updatedAt: FIXED_NOW,
    remoteUrl: "",
    storedPath,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    author: "Yardımcı Asistan demo üreteci",
    license: "Sentetik demo görseli",
    licenseUrl: "",
    sourceUrl: "",
    modification: "Yok (özgün, soyut üretilmiş görsel)."
  };
}

/**
 * Writes synthetic covers and optional CC BY panorama media into the backup's
 * assets/<room-media|table-media> manifest contract. Every demo room/table can
 * therefore expose at least one published image after restore.
 */
export function addResourceMedia({ folderPath, panoramas = [], covers = [] }) {
  const panorama = addPanoramaMedia({ folderPath, entries: panoramas });
  const seenIds = new Set((panorama.files ?? []).map((item) => item.id));
  const coverFiles = covers.map((entry) => coverRecord(folderPath, entry, seenIds));
  const files = [...(panorama.files ?? []), ...coverFiles];

  const byScope = { room: [], table: [] };
  for (const record of files) byScope[record.scope].push(record);
  const manifests = ["room", "table"]
    .filter((scope) => byScope[scope].length > 0)
    .map((scope) => writeManifest(folderPath, scope, byScope[scope]));

  const targets = [];
  for (const scope of ["room", "table"]) {
    const grouped = new Map();
    for (const record of byScope[scope]) {
      const mediaIds = grouped.get(record.resourceId) ?? [];
      mediaIds.push(record.id);
      grouped.set(record.resourceId, mediaIds);
    }
    for (const [resourceId, mediaIds] of grouped) {
      targets.push({ scope, resourceId, mediaIds: mediaIds.sort() });
    }
  }

  const countKind = (scope, kind) => files.filter((item) => item.scope === scope && item.kind === kind).length;
  return {
    counts: {
      roomCovers: countKind("room", "cover"),
      tableCovers: countKind("table", "cover"),
      roomMedia360: countKind("room", "panorama_360"),
      roomMedia180: countKind("room", "panorama_180"),
      tableMedia360: countKind("table", "panorama_360"),
      tableMedia180: countKind("table", "panorama_180"),
      total: files.length
    },
    targets,
    files,
    manifests,
    attributionPath: panorama.attributionPath,
    attributionSha256: panorama.attributionSha256
  };
}

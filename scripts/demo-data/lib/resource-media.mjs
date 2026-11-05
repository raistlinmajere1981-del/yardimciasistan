import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { FIXED_NOW, writeJson } from "./util.mjs";
import { addPanoramaMedia } from "./panorama-media.mjs";
import { addPhotoMedia } from "./photo-media.mjs";

const ATTRIBUTION_FILE = "MEDIA_ATTRIBUTION.txt";

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

function renderAttribution(files) {
  const groups = new Map();
  for (const record of files) {
    const group = groups.get(record.originalName) ?? { record, storedPaths: [] };
    group.storedPaths.push(record.storedPath);
    groups.set(record.originalName, group);
  }

  const licenses = [...new Set(files.map((record) => record.license))].sort();
  const lines = [
    "DEMO MEDYA GÖRSELLERİ — ATIF VE LİSANS",
    "",
    "Bu klasördeki kapak, fotoğraf ve panorama görselleri üçüncü taraflara",
    "aittir ve demo işletmesinin kendi çekimi değildir. Sentetik demo",
    "işletmesini temsilen kullanılmıştır; gerçek işletme, müşteri veya",
    "rezervasyon kanıtı sayılmaz. Aynı kaynak görsel birden fazla odada veya",
    "masada kullanılabilir.",
    "",
    `Kullanılan lisanslar: ${licenses.join(", ")}.`,
    "CC BY lisansları atıf verilmesi ve değişikliklerin belirtilmesi koşuluyla",
    "paylaşıma açıktır. CC0 ve Public domain görsellerde atıf zorunlu değildir;",
    "yine de kaynak ve yazar bilgisi korunmuştur. Yazarlar veya kurumlar",
    "tarafından onaylandığı ima edilmez.",
    "",
    "Kaynaklar:"
  ];

  for (const { record, storedPaths } of groups.values()) {
    lines.push(
      "",
      `- ${record.originalName} (${record.width} x ${record.height}, ${record.kind})`,
      `  Eser: ${record.title.replace(/ — Temsili demo görseli.*$/, "")}`,
      `  Yazar: ${record.author}`,
      `  Kaynak: ${record.sourceUrl}`,
      `  Lisans: ${record.license}${record.licenseUrl ? ` — ${record.licenseUrl}` : ""}`,
      `  Değişiklik: ${record.modification}`,
      `  Yerel dosyalar: ${[...new Set(storedPaths)].sort().join(", ")}`
    );
    if (record.kind === "panorama_180") {
      lines.push("  Not: 180° dosya, aynı 360° kaynağın merkez yarısından üretilmiş kırpmadır.");
    }
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Writes open-licensed cover, photo and panorama media into the backup's
 * assets/<room-media|table-media> manifest contract, then writes one combined
 * attribution file covering every third-party source.
 */
export function addResourceMedia({ folderPath, panoramas = [], photos = [] }) {
  const files = [
    ...addPanoramaMedia({ folderPath, entries: panoramas }),
    ...addPhotoMedia({ folderPath, entries: photos })
  ];

  const seenIds = new Set();
  for (const record of files) {
    if (seenIds.has(record.id)) throw new Error(`Duplicate media id: ${record.id}`);
    seenIds.add(record.id);
  }

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

  const attributionPath = path.posix.join("assets", ATTRIBUTION_FILE);
  fs.writeFileSync(path.join(folderPath, "assets", ATTRIBUTION_FILE), renderAttribution(files), "utf8");
  const attributionSha256 = createHash("sha256")
    .update(fs.readFileSync(path.join(folderPath, "assets", ATTRIBUTION_FILE)))
    .digest("hex");

  const countKind = (scope, kind) => files.filter((item) => item.scope === scope && item.kind === kind).length;
  return {
    counts: {
      roomCovers: countKind("room", "cover"),
      tableCovers: countKind("table", "cover"),
      roomPhotos: countKind("room", "photo"),
      tablePhotos: countKind("table", "photo"),
      roomMedia360: countKind("room", "panorama_360"),
      roomMedia180: countKind("room", "panorama_180"),
      tableMedia360: countKind("table", "panorama_360"),
      tableMedia180: countKind("table", "panorama_180"),
      total: files.length
    },
    targets,
    files,
    manifests,
    attributionPath,
    attributionSha256
  };
}

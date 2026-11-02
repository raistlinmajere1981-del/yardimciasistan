import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { FIXED_NOW, sha256File, writeJson } from "./util.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "panoramas");

const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
const LICENSE_NAME = "CC BY 4.0";
const ATTRIBUTION_FILE = "PANORAMA_ATTRIBUTION.txt";

/**
 * Original CC BY 4.0 equirectangular sources. The 180° files are centre crops of
 * the matching 360° file, not separate publications.
 */
export const PANORAMA_SOURCES = {
  "room-360": {
    fileName: "room-360.jpg",
    kind: "panorama_360",
    width: 1280,
    height: 640,
    fieldOfView: "360°",
    title: "Cerro Tololo Otel İçi 360° Panorama",
    author: "NOIRLab / NSF/AURA / P. Horálek",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Tololo_Hotel_Interior_360_Panorama_(2022_04_08_Pano360_Tololo_Hotel_Room-CC).jpg",
    modification: "Yok (yayımlandığı biçimde kopyalandı)."
  },
  "room-180": {
    fileName: "room-180.jpg",
    kind: "panorama_180",
    width: 640,
    height: 640,
    fieldOfView: "180°",
    title: "Cerro Tololo Otel İçi 180° Panorama (merkez kırpma)",
    author: "NOIRLab / NSF/AURA / P. Horálek",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Tololo_Hotel_Interior_360_Panorama_(2022_04_08_Pano360_Tololo_Hotel_Room-CC).jpg",
    modification: "360° kaynağın merkez yarısı 180° kapsama göre kırpıldı (değiştirilmiş eser)."
  },
  "restaurant-360": {
    fileName: "restaurant-360.jpg",
    kind: "panorama_360",
    width: 1280,
    height: 640,
    fieldOfView: "360°",
    title: "Cerro Pachón Otel ve Restoran Girişi 360° Panorama",
    author: "CTIO / NOIRLab / NSF/AURA",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Pachón_Hotel_and_Restaurant_Entrance_360_Panorama_(2022_04_08_Pano360_Pachon_Hotel_Hall-CC).jpg",
    modification: "Yok (yayımlandığı biçimde kopyalandı)."
  },
  "restaurant-180": {
    fileName: "restaurant-180.jpg",
    kind: "panorama_180",
    width: 640,
    height: 640,
    fieldOfView: "180°",
    title: "Cerro Pachón Otel ve Restoran Girişi 180° Panorama (merkez kırpma)",
    author: "CTIO / NOIRLab / NSF/AURA",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Pachón_Hotel_and_Restaurant_Entrance_360_Panorama_(2022_04_08_Pano360_Pachon_Hotel_Hall-CC).jpg",
    modification: "360° kaynağın merkez yarısı 180° kapsama göre kırpıldı (değiştirilmiş eser)."
  }
};

export function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("Not a JPEG file (missing SOI marker).");
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) throw new Error(`Invalid JPEG segment length at byte ${offset}.`);
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG dimensions not found.");
}

function safeSegment(value, label) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(text)) throw new Error(`Unsafe ${label}: ${text}`);
  return text;
}

/** Media title is capped at 240 characters by the desktop service. */
function mediaTitle(source) {
  const title = `${source.title} — Temsili demo görseli, işletmenin kendi fotoğrafı değildir. `
    + `Fotoğraf: ${source.author}, ${LICENSE_NAME} (${LICENSE_URL}).`;
  return title.length <= 240 ? title : title.slice(0, 240);
}

function readSource(sourceKey) {
  const source = PANORAMA_SOURCES[sourceKey];
  if (!source) throw new Error(`Unknown panorama source: ${sourceKey}`);
  const absolutePath = path.join(sourceRoot, source.fileName);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Panorama source missing: ${absolutePath}`);
  }
  const bytes = fs.readFileSync(absolutePath);
  const dimensions = jpegSize(bytes);
  if (dimensions.width !== source.width || dimensions.height !== source.height) {
    throw new Error(`${source.fileName} is ${dimensions.width}x${dimensions.height}, expected ${source.width}x${source.height}.`);
  }
  const ratio = dimensions.width / dimensions.height;
  const expectedRatio = source.kind === "panorama_360" ? 2 : 1;
  if (Math.abs(ratio - expectedRatio) > 0.001) {
    throw new Error(`${source.fileName} has ratio ${ratio}, ${source.kind} requires ${expectedRatio}.`);
  }
  return { source, bytes, dimensions, contentHash: sha256File(absolutePath), sizeBytes: bytes.length };
}

function renderAttribution(usedSourceKeys) {
  const lines = [
    "DEMO PANORAMA GÖRSELLERİ — ATIF VE LİSANS",
    "",
    "Bu klasördeki panorama fotoğrafları üçüncü taraflara aittir ve demo",
    "işletmesinin kendi çekimi değildir. Sentetik demo işletmesini temsilen",
    "kullanılmıştır; gerçek işletme, müşteri veya rezervasyon kanıtı sayılmaz.",
    "",
    `Lisans: ${LICENSE_NAME} — ${LICENSE_URL}`,
    "Atıf verilmesi ve değişikliklerin belirtilmesi koşuluyla paylaşıma açıktır.",
    "Yazarlar veya NOIRLab tarafından onaylandığı ima edilmez.",
    "",
    "Kaynaklar:"
  ];
  for (const sourceKey of usedSourceKeys) {
    const source = PANORAMA_SOURCES[sourceKey];
    lines.push(
      "",
      `- ${source.fileName} (${source.width} x ${source.height}, ${source.fieldOfView})`,
      `  Eser: ${source.title}`,
      `  Yazar: ${source.author}`,
      `  Kaynak: ${source.sourceUrl}`,
      `  Lisans: ${LICENSE_NAME} — ${LICENSE_URL}`,
      `  Değişiklik: ${source.modification}`
    );
    if (source.kind === "panorama_180") {
      lines.push("  Not: 180° dosya, aynı 360° kaynağın merkez yarısından üretilmiş kırpmadır.");
    }
  }
  lines.push("");
  return lines.join("\n");
}

function writeMediaManifest(folderPath, scope, entries) {
  if (entries.length === 0) return null;
  const rootDirectory = scope === "room" ? "room-media" : "table-media";
  const idField = scope === "room" ? "roomId" : "tableId";
  const media = entries.map((entry) => ({
    id: entry.id,
    [idField]: entry.resourceId,
    kind: entry.kind,
    originalName: entry.originalName,
    mimeType: "image/jpeg",
    title: entry.title,
    sortOrder: entry.sortOrder,
    sizeBytes: entry.sizeBytes,
    updatedAt: FIXED_NOW,
    remoteUrl: "",
    storedPath: entry.storedPath,
    contentHash: entry.contentHash
  }));
  const relativePath = path.posix.join("assets", rootDirectory, "manifest.json");
  writeJson(path.join(folderPath, "assets", rootDirectory, "manifest.json"), { version: 1, media });
  return relativePath;
}

/**
 * Writes room/table panorama media into a backup folder using the same
 * assets/<root>/manifest.json contract as public-resource-media-service.
 */
export function addPanoramaMedia({ folderPath, entries }) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { counts: {}, targets: [], files: [], manifests: [], attributionPath: "" };
  }

  const seenIds = new Set();
  const files = [];
  const byScope = { room: [], table: [] };
  const usedSourceKeys = new Set();

  for (const entry of entries) {
    const scope = entry.scope === "room" || entry.scope === "table" ? entry.scope : null;
    if (!scope) throw new Error(`Invalid panorama scope: ${entry.scope}`);
    const resourceId = safeSegment(entry.resourceId, `${scope} id`);
    const id = safeSegment(entry.id, "media id");
    if (seenIds.has(id)) throw new Error(`Duplicate media id: ${id}`);
    seenIds.add(id);

    const { source, bytes, dimensions, contentHash, sizeBytes } = readSource(entry.sourceKey);
    usedSourceKeys.add(entry.sourceKey);
    const rootDirectory = scope === "room" ? "room-media" : "table-media";
    const storedPath = `files/${resourceId}/${id}.jpg`;
    const absolutePath = path.join(folderPath, "assets", rootDirectory, "files", resourceId, `${id}.jpg`);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, bytes);

    const record = {
      scope,
      resourceId,
      id,
      kind: source.kind,
      originalName: source.fileName,
      mimeType: "image/jpeg",
      title: mediaTitle(source),
      sortOrder: Number.isInteger(entry.sortOrder) ? entry.sortOrder : 1,
      sizeBytes,
      updatedAt: FIXED_NOW,
      remoteUrl: "",
      storedPath,
      contentHash,
      width: dimensions.width,
      height: dimensions.height,
      sourceKey: entry.sourceKey,
      author: source.author,
      license: LICENSE_NAME,
      licenseUrl: LICENSE_URL,
      sourceUrl: source.sourceUrl,
      modification: source.modification
    };
    files.push(record);
    byScope[scope].push(record);
  }

  const manifests = [
    writeMediaManifest(folderPath, "room", byScope.room),
    writeMediaManifest(folderPath, "table", byScope.table)
  ].filter(Boolean);

  const attributionPath = path.posix.join("assets", ATTRIBUTION_FILE);
  const orderedSources = Object.keys(PANORAMA_SOURCES).filter((key) => usedSourceKeys.has(key));
  fs.writeFileSync(path.join(folderPath, "assets", ATTRIBUTION_FILE), renderAttribution(orderedSources), "utf8");

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
    attributionSha256: createHash("sha256")
      .update(fs.readFileSync(path.join(folderPath, "assets", ATTRIBUTION_FILE)))
      .digest("hex")
  };
}

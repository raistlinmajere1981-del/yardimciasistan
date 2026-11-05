import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FIXED_NOW, sha256File } from "./util.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "panoramas");

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

function source({ fileName, kind, width, height, title, author, sourceUrl }) {
  return {
    fileName,
    kind,
    width,
    height,
    fieldOfView: kind === "panorama_360" ? "360°" : "180°",
    title,
    author,
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl,
    modification: kind === "panorama_360"
      ? "Ölçeklendi (2048 x 1024) ve meta veriler temizlendi."
      : "360° kaynağın merkez yarısı 180° kapsama göre 1024 x 1024 kırpıldı (değiştirilmiş eser)."
  };
}

/**
 * Original CC BY 4.0 equirectangular sources. Every 180° file is a centre crop
 * of the matching 360° file, not a separate publication.
 */
export const PANORAMA_SOURCES = {
  "room-360": source({
    fileName: "room-360.jpg",
    kind: "panorama_360",
    width: 2048,
    height: 1024,
    title: "Cerro Tololo Otel İçi 360° Panorama",
    author: "NOIRLab / NSF/AURA / P. Horálek",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Tololo_Hotel_Interior_360_Panorama_(2022_04_08_Pano360_Tololo_Hotel_Room-CC).jpg"
  }),
  "room-180": source({
    fileName: "room-180.jpg",
    kind: "panorama_180",
    width: 1024,
    height: 1024,
    title: "Cerro Tololo Otel İçi 180° Panorama (merkez kırpma)",
    author: "NOIRLab / NSF/AURA / P. Horálek",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Tololo_Hotel_Interior_360_Panorama_(2022_04_08_Pano360_Tololo_Hotel_Room-CC).jpg"
  }),
  "room-alt-360": source({
    fileName: "room-alt-360.jpg",
    kind: "panorama_360",
    width: 2048,
    height: 1024,
    title: "Cerro Pachón Otel Odası 360° Panorama",
    author: "NOIRLab / AURA / NSF / P. Horálek",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Pach%C3%B3n_Hotel_Inside_Panorama_(2022_04_06_Pano360_Room_Pachon_Hotel2-CC).jpg"
  }),
  "room-alt-180": source({
    fileName: "room-alt-180.jpg",
    kind: "panorama_180",
    width: 1024,
    height: 1024,
    title: "Cerro Pachón Otel Odası 180° Panorama (merkez kırpma)",
    author: "NOIRLab / AURA / NSF / P. Horálek",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Pach%C3%B3n_Hotel_Inside_Panorama_(2022_04_06_Pano360_Room_Pachon_Hotel2-CC).jpg"
  }),
  "room-relax-360": source({
    fileName: "room-relax-360.jpg",
    kind: "panorama_360",
    width: 2048,
    height: 1024,
    title: "Cerro Pachón Otel Dinlenme Odası 360° Panorama",
    author: "NOIRLab / AURA / NSF / P. Horálek",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Pach%C3%B3n_Hotel_Inside_Panorama_(2022_04_07_Pano360_Pachon_Hotel_Relax_Room-CC).jpg"
  }),
  "room-relax-180": source({
    fileName: "room-relax-180.jpg",
    kind: "panorama_180",
    width: 1024,
    height: 1024,
    title: "Cerro Pachón Otel Dinlenme Odası 180° Panorama (merkez kırpma)",
    author: "NOIRLab / AURA / NSF / P. Horálek",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Pach%C3%B3n_Hotel_Inside_Panorama_(2022_04_07_Pano360_Pachon_Hotel_Relax_Room-CC).jpg"
  }),
  "restaurant-360": source({
    fileName: "restaurant-360.jpg",
    kind: "panorama_360",
    width: 2048,
    height: 1024,
    title: "Cerro Pachón Otel ve Restoran Girişi 360° Panorama",
    author: "CTIO / NOIRLab / NSF / AURA",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Pach%C3%B3n_Hotel_and_Restaurant_Entrance_360_Panorama_(2022_04_08_Pano360_Pachon_Hotel_Hall-CC).jpg"
  }),
  "restaurant-180": source({
    fileName: "restaurant-180.jpg",
    kind: "panorama_180",
    width: 1024,
    height: 1024,
    title: "Cerro Pachón Otel ve Restoran Girişi 180° Panorama (merkez kırpma)",
    author: "CTIO / NOIRLab / NSF / AURA",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Pach%C3%B3n_Hotel_and_Restaurant_Entrance_360_Panorama_(2022_04_08_Pano360_Pachon_Hotel_Hall-CC).jpg"
  }),
  "restaurant-hall-360": source({
    fileName: "restaurant-hall-360.jpg",
    kind: "panorama_360",
    width: 2048,
    height: 1024,
    title: "Cerro Pachón Otel Salonu 360° Panorama",
    author: "CTIO / NOIRLab / NSF / AURA / P. Horálek",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Pach%C3%B3n_Hotel_360_Panorama_(2022_04_08_Pano360_Pachon_Hotel_Entrance-CC).jpg"
  }),
  "restaurant-hall-180": source({
    fileName: "restaurant-hall-180.jpg",
    kind: "panorama_180",
    width: 1024,
    height: 1024,
    title: "Cerro Pachón Otel Salonu 180° Panorama (merkez kırpma)",
    author: "CTIO / NOIRLab / NSF / AURA / P. Horálek",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cerro_Pach%C3%B3n_Hotel_360_Panorama_(2022_04_08_Pano360_Pachon_Hotel_Entrance-CC).jpg"
  })
};

function safeSegment(value, label) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(text)) throw new Error(`Unsafe ${label}: ${text}`);
  return text;
}

/** Media title is capped at 240 characters by the desktop service. */
function mediaTitle(sourceRecord) {
  const suffix = ` — Temsili demo görseli, işletmenin kendi fotoğrafı değildir. `
    + `Fotoğraf: ${sourceRecord.author}, ${sourceRecord.license} (${sourceRecord.licenseUrl}).`;
  const budget = Math.max(24, 240 - suffix.length);
  const title = sourceRecord.title.length <= budget
    ? sourceRecord.title
    : `${sourceRecord.title.slice(0, budget - 1).trimEnd()}…`;
  const full = `${title}${suffix}`;
  return full.length <= 240 ? full : full.slice(0, 240);
}

function readSource(sourceKey) {
  const record = PANORAMA_SOURCES[sourceKey];
  if (!record) throw new Error(`Unknown panorama source: ${sourceKey}`);
  const absolutePath = path.join(sourceRoot, record.fileName);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Panorama source missing: ${absolutePath}`);
  }
  const bytes = fs.readFileSync(absolutePath);
  const dimensions = jpegSize(bytes);
  if (dimensions.width !== record.width || dimensions.height !== record.height) {
    throw new Error(`${record.fileName} is ${dimensions.width}x${dimensions.height}, expected ${record.width}x${record.height}.`);
  }
  const ratio = dimensions.width / dimensions.height;
  const expectedRatio = record.kind === "panorama_360" ? 2 : 1;
  if (Math.abs(ratio - expectedRatio) > 0.001) {
    throw new Error(`${record.fileName} has ratio ${ratio}, ${record.kind} requires ${expectedRatio}.`);
  }
  return { record, bytes, dimensions, contentHash: sha256File(absolutePath), sizeBytes: bytes.length };
}

/**
 * Copies panorama media into the backup's media tree. Covers, photos and
 * panoramas share one manifest per scope, written by resource-media.mjs.
 */
export function addPanoramaMedia({ folderPath, entries }) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const files = [];
  for (const entry of entries) {
    const scope = entry.scope === "room" || entry.scope === "table" ? entry.scope : null;
    if (!scope) throw new Error(`Invalid panorama scope: ${entry.scope}`);
    const resourceId = safeSegment(entry.resourceId, `${scope} id`);
    const id = safeSegment(entry.id, "media id");
    const { record, bytes, dimensions, contentHash, sizeBytes } = readSource(entry.sourceKey);
    const rootDirectory = scope === "room" ? "room-media" : "table-media";
    const storedPath = `files/${resourceId}/${id}.jpg`;
    const absolutePath = path.join(folderPath, "assets", rootDirectory, "files", resourceId, `${id}.jpg`);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, bytes);

    files.push({
      scope,
      resourceId,
      id,
      kind: record.kind,
      originalName: record.fileName,
      mimeType: "image/jpeg",
      title: mediaTitle(record),
      sortOrder: Number.isInteger(entry.sortOrder) ? entry.sortOrder : record.kind === "panorama_180" ? 2 : 3,
      sizeBytes,
      updatedAt: FIXED_NOW,
      remoteUrl: "",
      storedPath,
      contentHash,
      width: dimensions.width,
      height: dimensions.height,
      sourceKey: entry.sourceKey,
      author: record.author,
      license: record.license,
      licenseUrl: record.licenseUrl,
      sourceUrl: record.sourceUrl,
      modification: record.modification
    });
  }
  return files;
}

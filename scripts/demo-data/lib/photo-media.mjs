import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { FIXED_NOW, sha256File } from "./util.mjs";
import { jpegSize } from "./panorama-media.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "photos");

const COVER_WIDTH = 960;
const COVER_HEIGHT = 640;
const PHOTO_WIDTH = 1280;
const PHOTO_HEIGHT = 960;

const COVER_MODIFICATION = "Ölçeklendi, 960 x 640 (3:2) olarak kırpıldı ve meta veriler temizlendi.";
const PHOTO_MODIFICATION = "Ölçeklendi, 1280 x 960 (4:3) olarak kırpıldı ve meta veriler temizlendi.";

function licensedSource({ fileName, kind, title, author, license, licenseUrl, sourceUrl }) {
  return {
    fileName,
    kind,
    width: kind === "cover" ? COVER_WIDTH : PHOTO_WIDTH,
    height: kind === "cover" ? COVER_HEIGHT : PHOTO_HEIGHT,
    title,
    author,
    license,
    licenseUrl,
    sourceUrl,
    modification: kind === "cover" ? COVER_MODIFICATION : PHOTO_MODIFICATION
  };
}

/**
 * Open-licensed room/table cover and detail photographs from Wikimedia
 * Commons. Files under assets/photos/ are normalised copies of these sources.
 */
export const PHOTO_SOURCES = {
  "room-101-cover": licensedSource({
    fileName: "room-101-cover.jpg",
    kind: "cover",
    title: "Tropical Noir Chic Boutique Hotel Room in Lisbon",
    author: "Dale Cruse - 10M views from San Francisco, CA, USA",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Tropical_Noir_Chic_Boutique_Hotel_Room_in_Lisbon_(54940806211).jpg"
  }),
  "room-101-photo": licensedSource({
    fileName: "room-101-photo.jpg",
    kind: "photo",
    title: "ANDAZ Liverpool Street Large King Room",
    author: "|| UggBoy♥UggGirl || PHOTO || WORLD || TRAVEL ||",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:(_A_Sense_of_Grand_Boutique_and_Life_in_the_Capital_%3D_Large_King_Room_)_ANDAZ_Liverpool_Street,_London,_England,_UK_(5363713961).jpg"
  }),
  "room-102-cover": licensedSource({
    fileName: "room-102-cover.jpg",
    kind: "cover",
    title: "Antigua Guatemala Fine Hotel Bedroom",
    author: "jjmusgrove",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Antigua_Guatemala_-_Fine_Hotel_Bedroom.jpg"
  }),
  "room-102-photo": licensedSource({
    fileName: "room-102-photo.jpg",
    kind: "photo",
    title: "Modern hotel bedroom with geometric patterns and soft linens",
    author: "Shixart1985",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Modern_bedroom_design_in_a_stylish_hotel_room_featuring_geometric_patterns_and_soft_linens.jpg"
  }),
  "room-201-cover": licensedSource({
    fileName: "room-201-cover.jpg",
    kind: "cover",
    title: "Queen size bed in Wolf Creek Inn",
    author: "Rick Obst",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Queen_size_bed_in_Wolf_Creek_Inn.jpg"
  }),
  "room-201-photo": licensedSource({
    fileName: "room-201-photo.jpg",
    kind: "photo",
    title: "Siena hotel room with open window",
    author: "Thomas Duesing",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Siena_-_hotel_room_-_2012-5.jpg"
  }),
  "room-202-cover": licensedSource({
    fileName: "room-202-cover.jpg",
    kind: "cover",
    title: "Bunk beds in the Wolf Creek Inn",
    author: "Rick Obst",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Bunk_beds_in_the_Wolf_Creek_Inn.jpg"
  }),
  "room-202-photo": licensedSource({
    fileName: "room-202-photo.jpg",
    kind: "photo",
    title: "Guoman Tower Hotel bedroom",
    author: "Schezar",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Hotel_bedroom_Guoman_Tower_Hotel_2014-03-05.jpg"
  }),
  "table-m1-cover": licensedSource({
    fileName: "table-m1-cover.jpg",
    kind: "cover",
    title: "Arnaud's restaurant table setting, New Orleans",
    author: "rulenumberone2",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Arnaud%27s_restaurant,_New_Orleans,_interior_November_2013_-_Table_setting.jpg"
  }),
  "table-m1-photo": licensedSource({
    fileName: "table-m1-photo.jpg",
    kind: "photo",
    title: "Table set in a modern restaurant with wooden walls",
    author: "Shixart1985",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Table_set_for_dining_in_a_modern_restaurant_interior_with_wooden_walls_and_elegant_decor.jpg"
  }),
  "table-m2-cover": licensedSource({
    fileName: "table-m2-cover.jpg",
    kind: "cover",
    title: "Table setting in a restaurant",
    author: "User:Mattes",
    license: "Public domain",
    licenseUrl: "",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Table_setting_in_a_restaurant.JPG"
  }),
  "table-m2-photo": licensedSource({
    fileName: "table-m2-photo.jpg",
    kind: "photo",
    title: "Evening dining room of Cholada Thai Restaurant",
    author: "Jackg98",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Evening_interior_dining_room_of_Cholada_Thai_Restaurant_in_Malibu,_California.jpg"
  }),
  "table-m3-cover": licensedSource({
    fileName: "table-m3-cover.jpg",
    kind: "cover",
    title: "Boathouse Ohori Park cafe interior",
    author: "Hirho",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Boathouse_%C5%8Chori_Park_The_interior_of_the_caf%C3%A9_%C5%8Chorik%C5%8Den_Ch%C5%AB%C5%8D-ku_Fukuoka_20260609_173446.jpg"
  }),
  "table-m3-photo": licensedSource({
    fileName: "table-m3-photo.jpg",
    kind: "photo",
    title: "Boathouse Ohori Park window bar seating",
    author: "Hirho",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Boathouse_%C5%8Chori_Park_The_Window_bar_seating_%C5%8Chorik%C5%8Den_Ch%C5%AB%C5%8D-ku_Fukuoka_20260609_173401.jpg"
  }),
  "table-b1-cover": licensedSource({
    fileName: "table-b1-cover.jpg",
    kind: "cover",
    title: "Table set on a terrace over water, Venice",
    author: "Gerda Arendt",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Table_set_on_terrace_over_water,_Venice.jpg"
  }),
  "table-b1-photo": licensedSource({
    fileName: "table-b1-photo.jpg",
    kind: "photo",
    title: "Restaurant Can Tomeu garden terrace, Mallorca",
    author: "Graeme Churchard",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Restaurant_Ca%27n_Tomeu_in_Orient,_Mallorca,_2020.jpg"
  }),
  "table-b2-cover": licensedSource({
    fileName: "table-b2-cover.jpg",
    kind: "cover",
    title: "Mountain-view seats beside a window",
    author: "玄史生",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Mountains_Priceless_Seats_beside_Window_20121104.JPG"
  }),
  "table-b2-photo": licensedSource({
    fileName: "table-b2-photo.jpg",
    kind: "photo",
    title: "Two chairs and a table with drinks in a bright room",
    author: "Shixart1985",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Two_chairs_and_a_table_with_drinks_and_snacks_in_a_bright_room_with_large_windows.jpg"
  }),
  "table-b3-cover": licensedSource({
    fileName: "table-b3-cover.jpg",
    kind: "cover",
    title: "Cafe with a view on a cathedral",
    author: "Christian Battaglia cdbattags",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cafe_with_view_on_a_cathedral_(Unsplash).jpg"
  }),
  "table-b3-photo": licensedSource({
    fileName: "table-b3-photo.jpg",
    kind: "photo",
    title: "Brix Restaurant round table and booth",
    author: "Missvain",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Brix_Restaurant_-_April_2019_-_Sarah_Stierch_06.jpg"
  })
};

function safeSegment(value, label) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(text)) throw new Error(`Unsafe ${label}: ${text}`);
  return text;
}

/** Media title is capped at 240 characters by the desktop service. */
export function mediaTitle(source) {
  const suffix = ` — Temsili demo görseli, işletmenin kendi fotoğrafı değildir. `
    + `Fotoğraf: ${source.author}, ${source.license}${source.licenseUrl ? ` (${source.licenseUrl})` : ""}.`;
  const budget = Math.max(24, 240 - suffix.length);
  const title = source.title.length <= budget ? source.title : `${source.title.slice(0, budget - 1).trimEnd()}…`;
  const full = `${title}${suffix}`;
  return full.length <= 240 ? full : full.slice(0, 240);
}

function readSource(sourceKey) {
  const source = PHOTO_SOURCES[sourceKey];
  if (!source) throw new Error(`Unknown photo source: ${sourceKey}`);
  const absolutePath = path.join(sourceRoot, source.fileName);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Photo source missing: ${absolutePath}`);
  }
  const bytes = fs.readFileSync(absolutePath);
  const dimensions = jpegSize(bytes);
  if (dimensions.width !== source.width || dimensions.height !== source.height) {
    throw new Error(`${source.fileName} is ${dimensions.width}x${dimensions.height}, expected ${source.width}x${source.height}.`);
  }
  return { source, bytes, dimensions, contentHash: sha256File(absolutePath), sizeBytes: bytes.length };
}

/**
 * Copies normalised open-licensed photographs into the backup's media tree.
 * Manifest and attribution writing stay in resource-media.mjs so covers,
 * photos and panoramas share one manifest per scope.
 */
export function addPhotoMedia({ folderPath, entries }) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const files = [];
  for (const entry of entries) {
    const scope = entry.scope === "room" || entry.scope === "table" ? entry.scope : null;
    if (!scope) throw new Error(`Invalid photo scope: ${entry.scope}`);
    const resourceId = safeSegment(entry.resourceId, `${scope} id`);
    const id = safeSegment(entry.id, "media id");
    const { source, bytes, dimensions, sizeBytes } = readSource(entry.sourceKey);
    const rootDirectory = scope === "room" ? "room-media" : "table-media";
    const storedPath = `files/${resourceId}/${id}.jpg`;
    const absolutePath = path.join(folderPath, "assets", rootDirectory, "files", resourceId, `${id}.jpg`);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, bytes);

    files.push({
      scope,
      resourceId,
      id,
      kind: source.kind,
      originalName: source.fileName,
      mimeType: "image/jpeg",
      title: mediaTitle(source),
      sortOrder: Number.isInteger(entry.sortOrder) ? entry.sortOrder : source.kind === "cover" ? 0 : 1,
      sizeBytes,
      updatedAt: FIXED_NOW,
      remoteUrl: "",
      storedPath,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      width: dimensions.width,
      height: dimensions.height,
      sourceKey: entry.sourceKey,
      author: source.author,
      license: source.license,
      licenseUrl: source.licenseUrl,
      sourceUrl: source.sourceUrl,
      modification: source.modification
    });
  }
  return files;
}

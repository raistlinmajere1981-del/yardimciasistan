import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { dialog, type BrowserWindow } from "electron";
import type {
  AddRoomMediaInput,
  DeleteRoomMediaInput,
  RoomMediaAsset,
  RoomMediaMutationResult,
  RoomPublicMedia,
  RoomPublicMediaKind,
  UpdateRoomMediaInput
} from "@yardimci-asistan/shared";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const SINGLETON_KINDS = new Set<RoomPublicMediaKind>([
  "cover",
  "panorama_360",
  "panorama_180",
  "video"
]);
const IMAGE_LIMIT_BYTES = 30 * 1024 * 1024;
const VIDEO_LIMIT_BYTES = 200 * 1024 * 1024;

interface StoredRoomMediaAsset extends RoomMediaAsset {
  storedPath: string;
  contentHash: string;
}

interface RoomMediaManifest {
  version: 1;
  media: StoredRoomMediaAsset[];
}

export async function addRoomMediaFromDialog(
  userDataPath: string,
  owner: BrowserWindow | null,
  input: AddRoomMediaInput
): Promise<RoomMediaMutationResult> {
  const roomId = normalizeId(input?.roomId);
  const kind = normalizeKind(input?.kind);
  if (!roomId || !kind) return failure("Oda veya medya türü geçersiz.", []);

  const filters = kind === "video"
    ? [{ name: "Video", extensions: ["mp4", "webm"] }]
    : [{ name: "Görsel", extensions: ["jpg", "jpeg", "png", "webp"] }];
  const pickerOptions = {
    title: mediaPickerTitle(kind),
    properties: kind === "photo" ? ["openFile", "multiSelections"] as const : ["openFile"] as const,
    filters
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, pickerOptions)
    : await dialog.showOpenDialog(pickerOptions);
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: true, message: "Dosya seçimi iptal edildi.", media: listRoomMedia(userDataPath, roomId) };
  }

  const manifest = readManifest(userDataPath);
  const now = new Date().toISOString();
  let roomMedia = manifest.media.filter((item) => item.roomId === roomId);
  const retained = manifest.media.filter((item) => item.roomId !== roomId);

  if (SINGLETON_KINDS.has(kind)) {
    const removed = roomMedia.filter((item) => item.kind === kind);
    for (const item of removed) removeStoredFile(userDataPath, item);
    roomMedia = roomMedia.filter((item) => item.kind !== kind);
  }

  let nextOrder = roomMedia.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
  try {
    for (const sourcePath of result.filePaths) {
      const stored = copySelectedFile(userDataPath, roomId, kind, sourcePath, nextOrder++, now);
      roomMedia.push(stored);
      if (SINGLETON_KINDS.has(kind)) break;
    }
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Medya dosyası eklenemedi.", sortMedia(roomMedia));
  }

  writeManifest(userDataPath, {
    version: 1,
    media: [...retained, ...roomMedia]
  });
  return {
    ok: true,
    message: kind === "photo" && result.filePaths.length > 1
      ? "Oda fotoğrafları eklendi."
      : "Oda medyası eklendi.",
    media: sortMedia(roomMedia)
  };
}

export function updateRoomMedia(
  userDataPath: string,
  input: UpdateRoomMediaInput
): RoomMediaMutationResult {
  const roomId = normalizeId(input?.roomId);
  const mediaId = normalizeId(input?.mediaId);
  const kind = normalizeKind(input?.kind);
  if (!roomId || !mediaId || !kind) return failure("Medya kaydı geçersiz.", []);

  const manifest = readManifest(userDataPath);
  const target = manifest.media.find((item) => item.roomId === roomId && item.id === mediaId);
  if (!target) return failure("Medya kaydı bulunamadı.", listRoomMedia(userDataPath, roomId));

  if (kind === "video" && !target.mimeType.startsWith("video/")) {
    return failure("Görsel dosyası video olarak işaretlenemez.", listRoomMedia(userDataPath, roomId));
  }
  if (kind !== "video" && !target.mimeType.startsWith("image/")) {
    return failure("Video dosyası görsel türüne çevrilemez.", listRoomMedia(userDataPath, roomId));
  }

  if (SINGLETON_KINDS.has(kind)) {
    for (const item of manifest.media) {
      if (item.roomId !== roomId || item.id === mediaId || item.kind !== kind) continue;
      item.kind = "photo";
    }
  }

  target.kind = kind;
  target.title = cleanText(input.title, 240);
  target.updatedAt = new Date().toISOString();
  writeManifest(userDataPath, manifest);
  return { ok: true, message: "Medya bilgisi güncellendi.", media: listRoomMedia(userDataPath, roomId) };
}

export function deleteRoomMedia(
  userDataPath: string,
  input: DeleteRoomMediaInput
): RoomMediaMutationResult {
  const roomId = normalizeId(input?.roomId);
  const mediaId = normalizeId(input?.mediaId);
  if (!roomId || !mediaId) return failure("Medya kaydı geçersiz.", []);

  const manifest = readManifest(userDataPath);
  const target = manifest.media.find((item) => item.roomId === roomId && item.id === mediaId);
  if (!target) return failure("Medya kaydı bulunamadı.", listRoomMedia(userDataPath, roomId));

  removeStoredFile(userDataPath, target);
  manifest.media = manifest.media.filter((item) => item.id !== mediaId);
  writeManifest(userDataPath, manifest);
  return { ok: true, message: "Medya kaldırıldı.", media: listRoomMedia(userDataPath, roomId) };
}

export function listRoomMedia(userDataPath: string, roomId: string): RoomMediaAsset[] {
  const normalized = normalizeId(roomId);
  if (!normalized) return [];
  return sortMedia(
    readManifest(userDataPath).media
      .filter((item) => item.roomId === normalized)
      .map(toPublicLocalAsset)
  );
}

export function listPendingRoomMedia(userDataPath: string): StoredRoomMediaAsset[] {
  return readManifest(userDataPath).media
    .filter((item) => !item.remoteUrl && storedFileExists(userDataPath, item))
    .sort((a, b) => a.roomId.localeCompare(b.roomId) || a.sortOrder - b.sortOrder);
}

export function getRoomPublishedMedia(userDataPath: string, roomId: string): RoomPublicMedia[] {
  return readManifest(userDataPath).media
    .filter((item) => item.roomId === roomId && item.remoteUrl)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      url: item.remoteUrl,
      mimeType: item.mimeType,
      title: item.title,
      sortOrder: item.sortOrder
    }));
}

export function getRoomMediaUploadSource(userDataPath: string, mediaId: string): {
  asset: StoredRoomMediaAsset;
  absolutePath: string;
} | null {
  const asset = readManifest(userDataPath).media.find((item) => item.id === mediaId);
  if (!asset) return null;
  const absolutePath = path.resolve(mediaRoot(userDataPath), asset.storedPath);
  const root = path.resolve(mediaRoot(userDataPath));
  if (absolutePath !== root && !absolutePath.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(absolutePath)) return null;
  return { asset, absolutePath };
}

export function markRoomMediaPublished(
  userDataPath: string,
  mediaId: string,
  remoteUrl: string
): void {
  const manifest = readManifest(userDataPath);
  const asset = manifest.media.find((item) => item.id === mediaId);
  if (!asset) return;
  asset.remoteUrl = String(remoteUrl ?? "").trim();
  asset.updatedAt = new Date().toISOString();
  writeManifest(userDataPath, manifest);
}

function copySelectedFile(
  userDataPath: string,
  roomId: string,
  kind: RoomPublicMediaKind,
  sourcePath: string,
  sortOrder: number,
  now: string
): StoredRoomMediaAsset {
  const extension = path.extname(sourcePath).toLowerCase();
  const isVideo = VIDEO_EXTENSIONS.has(extension);
  const isImage = IMAGE_EXTENSIONS.has(extension);
  if (kind === "video" ? !isVideo : !isImage) {
    throw new Error(kind === "video"
      ? "Video için MP4 veya WebM dosyası seçin."
      : "Görsel için JPG, PNG veya WebP dosyası seçin.");
  }

  const stat = fs.statSync(sourcePath);
  const maxBytes = kind === "video" ? VIDEO_LIMIT_BYTES : IMAGE_LIMIT_BYTES;
  if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
    throw new Error(kind === "video"
      ? "Video dosyası boş olamaz ve en fazla 200 MB olabilir."
      : "Görsel dosyası boş olamaz ve en fazla 30 MB olabilir.");
  }

  const mediaId = "room_media_" + crypto.randomUUID().replaceAll("-", "");
  const safeRoom = normalizeId(roomId);
  const relativeDirectory = path.join("files", safeRoom);
  const directory = path.join(mediaRoot(userDataPath), relativeDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const storedPath = path.join(relativeDirectory, mediaId + extension);
  const destination = path.join(mediaRoot(userDataPath), storedPath);
  fs.copyFileSync(sourcePath, destination);

  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(destination, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes = 0;
    do {
      bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes > 0) hash.update(buffer.subarray(0, bytes));
    } while (bytes > 0);
  } finally {
    fs.closeSync(fd);
  }

  return {
    id: mediaId,
    roomId: safeRoom,
    kind,
    originalName: path.basename(sourcePath),
    mimeType: mimeForExtension(extension),
    title: "",
    sortOrder,
    sizeBytes: stat.size,
    updatedAt: now,
    remoteUrl: "",
    storedPath,
    contentHash: hash.digest("hex")
  };
}

function readManifest(userDataPath: string): RoomMediaManifest {
  const file = manifestPath(userDataPath);
  if (!fs.existsSync(file)) return { version: 1, media: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<RoomMediaManifest>;
    return {
      version: 1,
      media: Array.isArray(parsed.media)
        ? parsed.media.map(normalizeStoredAsset).filter((item): item is StoredRoomMediaAsset => Boolean(item))
        : []
    };
  } catch {
    return { version: 1, media: [] };
  }
}

function writeManifest(userDataPath: string, manifest: RoomMediaManifest): void {
  const root = mediaRoot(userDataPath);
  fs.mkdirSync(root, { recursive: true });
  const file = manifestPath(userDataPath);
  const temporary = file + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify({ version: 1, media: manifest.media }, null, 2), "utf8");
  fs.renameSync(temporary, file);
}

function normalizeStoredAsset(value: unknown): StoredRoomMediaAsset | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = normalizeId(candidate.id);
  const roomId = normalizeId(candidate.roomId);
  const kind = normalizeKind(candidate.kind);
  const storedPath = String(candidate.storedPath ?? "").trim();
  if (!id || !roomId || !kind || !storedPath) return null;
  return {
    id,
    roomId,
    kind,
    originalName: path.basename(String(candidate.originalName ?? "")),
    mimeType: String(candidate.mimeType ?? "").trim(),
    title: cleanText(candidate.title, 240),
    sortOrder: Math.max(0, Math.trunc(Number(candidate.sortOrder ?? 0) || 0)),
    sizeBytes: Math.max(0, Math.trunc(Number(candidate.sizeBytes ?? 0) || 0)),
    updatedAt: String(candidate.updatedAt ?? "").trim(),
    remoteUrl: String(candidate.remoteUrl ?? "").trim(),
    storedPath,
    contentHash: String(candidate.contentHash ?? "").trim()
  };
}

function toPublicLocalAsset(item: StoredRoomMediaAsset): RoomMediaAsset {
  const { storedPath: _storedPath, contentHash: _contentHash, ...asset } = item;
  return asset;
}

function removeStoredFile(userDataPath: string, item: StoredRoomMediaAsset): void {
  const source = getRoomMediaUploadSource(userDataPath, item.id);
  if (!source) return;
  try {
    fs.unlinkSync(source.absolutePath);
  } catch {
    // The manifest remains authoritative even if an already-missing file cannot be removed.
  }
}

function storedFileExists(userDataPath: string, item: StoredRoomMediaAsset): boolean {
  return Boolean(getRoomMediaUploadSource(userDataPath, item.id));
}

function mediaRoot(userDataPath: string): string {
  return path.join(userDataPath, "assets", "room-media");
}

function manifestPath(userDataPath: string): string {
  return path.join(mediaRoot(userDataPath), "manifest.json");
}

function normalizeId(value: unknown): string {
  const id = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{1,180}$/.test(id) ? id : "";
}

function normalizeKind(value: unknown): RoomPublicMediaKind | null {
  const kind = String(value ?? "").trim() as RoomPublicMediaKind;
  return ["cover", "photo", "panorama_360", "panorama_180", "video"].includes(kind) ? kind : null;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function mediaPickerTitle(kind: RoomPublicMediaKind): string {
  if (kind === "cover") return "Oda kapak görseli seç";
  if (kind === "photo") return "Oda fotoğrafı seç";
  if (kind === "panorama_360") return "360° panorama seç";
  if (kind === "panorama_180") return "180° panorama seç";
  return "Oda videosu seç";
}

function mimeForExtension(extension: string): string {
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".webm") return "video/webm";
  return "video/mp4";
}

function sortMedia<T extends { sortOrder: number; id: string }>(media: T[]): T[] {
  return [...media].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function failure(message: string, media: RoomMediaAsset[]): RoomMediaMutationResult {
  return { ok: false, message, media };
}

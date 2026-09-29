import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { dialog, nativeImage, type BrowserWindow, type OpenDialogOptions } from "electron";
import type {
  AddRoomMediaInput,
  DeleteRoomMediaInput,
  RoomMediaAsset,
  RoomMediaDraftResult,
  RoomMediaDraftState,
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

const activeDrafts = new Map<string, RoomMediaManifest>();
const cleanedStagingRoots = new Set<string>();

export async function addRoomMediaFromDialog(
  userDataPath: string,
  owner: BrowserWindow | null,
  input: AddRoomMediaInput
): Promise<RoomMediaMutationResult> {
  const roomId = normalizeId(input?.roomId);
  if (!roomId) return failure("Oda kimliği geçersiz.", []);

  const preferredKind = normalizeKind(input?.kind);
  const pickerOptions: OpenDialogOptions = {
    title: "Oda medyası seç",
    properties: ["openFile", "multiSelections"],
    filters: [{
      name: "Görsel ve video",
      extensions: ["jpg", "jpeg", "png", "webp", "mp4", "webm"]
    }]
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, pickerOptions)
    : await dialog.showOpenDialog(pickerOptions);
  if (result.canceled || result.filePaths.length === 0) {
    return {
      ok: true,
      message: "Dosya seçimi iptal edildi.",
      media: listRoomMedia(userDataPath, roomId),
      dirty: getRoomMediaDraftState(userDataPath).dirty
    };
  }

  const manifest = getDraftManifest(userDataPath);
  const now = new Date().toISOString();
  let roomMedia = manifest.media.filter((item) => item.roomId === roomId);
  const retained = manifest.media.filter((item) => item.roomId !== roomId);
  let nextOrder = roomMedia.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;

  try {
    for (const sourcePath of result.filePaths) {
      const detectedKind = defaultKindForPath(sourcePath, preferredKind);
      if (!detectedKind) {
        throw new Error("Yalnız JPG, PNG, WebP, MP4 veya WebM dosyaları eklenebilir.");
      }

      if (SINGLETON_KINDS.has(detectedKind)) {
        const replaced = roomMedia.filter((item) => item.kind === detectedKind);
        for (const item of replaced) {
          if (isStagedAsset(item)) removeStoredFile(userDataPath, item);
        }
        roomMedia = roomMedia.filter((item) => item.kind !== detectedKind);
      }

      roomMedia.push(copySelectedFile(
        userDataPath,
        roomId,
        detectedKind,
        sourcePath,
        nextOrder++,
        now,
        "staging"
      ));
    }
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "Medya dosyası eklenemedi.",
      toPublicLocalAssets(userDataPath, roomMedia),
      getRoomMediaDraftState(userDataPath).dirty
    );
  }

  manifest.media = [...retained, ...roomMedia];
  return {
    ok: true,
    message: result.filePaths.length > 1
      ? `${result.filePaths.length} medya dosyası taslağa eklendi.`
      : "Oda medyası taslağa eklendi.",
    media: listRoomMedia(userDataPath, roomId),
    dirty: getRoomMediaDraftState(userDataPath).dirty
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

  const manifest = getDraftManifest(userDataPath);
  const target = manifest.media.find((item) => item.roomId === roomId && item.id === mediaId);
  if (!target) return failure("Medya kaydı bulunamadı.", listRoomMedia(userDataPath, roomId), getRoomMediaDraftState(userDataPath).dirty);

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
  return {
    ok: true,
    message: "Medya bilgisi taslakta güncellendi.",
    media: listRoomMedia(userDataPath, roomId),
    dirty: getRoomMediaDraftState(userDataPath).dirty
  };
}

export function deleteRoomMedia(
  userDataPath: string,
  input: DeleteRoomMediaInput
): RoomMediaMutationResult {
  const roomId = normalizeId(input?.roomId);
  const mediaId = normalizeId(input?.mediaId);
  if (!roomId || !mediaId) return failure("Medya kaydı geçersiz.", []);

  const manifest = getDraftManifest(userDataPath);
  const target = manifest.media.find((item) => item.roomId === roomId && item.id === mediaId);
  if (!target) return failure("Medya kaydı bulunamadı.", listRoomMedia(userDataPath, roomId), getRoomMediaDraftState(userDataPath).dirty);

  if (isStagedAsset(target)) removeStoredFile(userDataPath, target);
  manifest.media = manifest.media.filter((item) => item.id !== mediaId);
  return {
    ok: true,
    message: "Medya taslaktan kaldırıldı.",
    media: listRoomMedia(userDataPath, roomId),
    dirty: getRoomMediaDraftState(userDataPath).dirty
  };
}

export function listRoomMedia(userDataPath: string, roomId: string): RoomMediaAsset[] {
  ensureStagingRootClean(userDataPath);
  const normalized = normalizeId(roomId);
  if (!normalized) return [];
  const manifest = activeDrafts.get(draftKey(userDataPath)) ?? readManifest(userDataPath);
  return sortMedia(
    toPublicLocalAssets(
      userDataPath,
      manifest.media.filter((item) => item.roomId === normalized)
    )
  );
}

export function getRoomMediaDraftState(userDataPath: string): RoomMediaDraftState {
  ensureStagingRootClean(userDataPath);
  const draft = activeDrafts.get(draftKey(userDataPath));
  return { dirty: Boolean(draft && isDraftDirty(userDataPath, draft)) };
}

export function commitRoomMediaDraft(userDataPath: string): RoomMediaDraftResult {
  ensureStagingRootClean(userDataPath);
  const key = draftKey(userDataPath);
  const draft = activeDrafts.get(key);
  if (!draft || !isDraftDirty(userDataPath, draft)) {
    activeDrafts.delete(key);
    clearStagingRoot(userDataPath);
    return { ok: true, message: "Oda medyalarında değişiklik yok.", dirty: false, changed: false };
  }

  const canonical = readManifest(userDataPath);
  const canonicalById = new Map(canonical.media.map((item) => [item.id, item] as const));
  const copiedFiles: string[] = [];

  try {
    const committedMedia = draft.media.map((item) => {
      if (!isStagedAsset(item)) {
        const latest = canonicalById.get(item.id);
        return {
          ...item,
          remoteUrl: latest?.remoteUrl ?? item.remoteUrl
        };
      }

      const source = storedAssetAbsolutePath(userDataPath, item);
      if (!source || !fs.existsSync(source)) {
        throw new Error(`${item.originalName || "Oda medyası"} staging alanında bulunamadı.`);
      }
      const extension = path.extname(item.storedPath).toLowerCase();
      const relativeDirectory = path.join("files", normalizeId(item.roomId));
      const directory = path.join(mediaRoot(userDataPath), relativeDirectory);
      fs.mkdirSync(directory, { recursive: true });
      const storedPath = path.join(relativeDirectory, item.id + extension);
      const destination = path.join(mediaRoot(userDataPath), storedPath);
      fs.copyFileSync(source, destination);
      copiedFiles.push(destination);
      return { ...item, storedPath, remoteUrl: "" };
    });

    const nextManifest: RoomMediaManifest = { version: 1, media: committedMedia };
    writeManifest(userDataPath, nextManifest);

    const retainedIds = new Set(committedMedia.map((item) => item.id));
    for (const item of canonical.media) {
      if (!retainedIds.has(item.id)) removeStoredFile(userDataPath, item);
    }

    activeDrafts.delete(key);
    clearStagingRoot(userDataPath);
    return { ok: true, message: "Oda medyaları kaydedildi.", dirty: false, changed: true };
  } catch (error) {
    for (const file of copiedFiles) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Best-effort cleanup; canonical manifest remains authoritative.
      }
    }
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : "Oda medyaları kaydedilemedi.",
      dirty: true,
      changed: false
    };
  }
}

export function discardRoomMediaDraft(userDataPath: string): RoomMediaDraftResult {
  ensureStagingRootClean(userDataPath);
  const key = draftKey(userDataPath);
  const draft = activeDrafts.get(key);
  const changed = Boolean(draft && isDraftDirty(userDataPath, draft));
  activeDrafts.delete(key);
  clearStagingRoot(userDataPath);
  return {
    ok: true,
    message: changed ? "Oda medyası değişiklikleri geri alındı." : "Oda medyalarında bekleyen değişiklik yok.",
    dirty: false,
    changed
  };
}

export function listPendingRoomMedia(userDataPath: string): StoredRoomMediaAsset[] {
  ensureStagingRootClean(userDataPath);
  return readManifest(userDataPath).media
    .filter((item) => !item.remoteUrl && storedFileExists(userDataPath, item))
    .sort((a, b) => a.roomId.localeCompare(b.roomId) || a.sortOrder - b.sortOrder);
}

export function getRoomPublishedMedia(userDataPath: string, roomId: string): RoomPublicMedia[] {
  ensureStagingRootClean(userDataPath);
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
  ensureStagingRootClean(userDataPath);
  const asset = readManifest(userDataPath).media.find((item) => item.id === mediaId);
  if (!asset) return null;
  const absolutePath = storedAssetAbsolutePath(userDataPath, asset);
  if (!absolutePath || !fs.existsSync(absolutePath)) return null;
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
  const draft = activeDrafts.get(draftKey(userDataPath));
  const draftAsset = draft?.media.find((item) => item.id === mediaId);
  if (draftAsset) {
    draftAsset.remoteUrl = asset.remoteUrl;
    draftAsset.updatedAt = asset.updatedAt;
  }
}

function copySelectedFile(
  userDataPath: string,
  roomId: string,
  kind: RoomPublicMediaKind,
  sourcePath: string,
  sortOrder: number,
  now: string,
  storageArea: "files" | "staging" = "files"
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
  const relativeDirectory = path.join(storageArea, safeRoom);
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

function toPublicLocalAssets(
  userDataPath: string,
  items: StoredRoomMediaAsset[]
): RoomMediaAsset[] {
  return items.map((item) => toPublicLocalAsset(userDataPath, item));
}

function toPublicLocalAsset(userDataPath: string, item: StoredRoomMediaAsset): RoomMediaAsset {
  const { storedPath: _storedPath, contentHash: _contentHash, ...asset } = item;
  return {
    ...asset,
    previewDataUrl: createPreviewDataUrl(userDataPath, item)
  };
}

function createPreviewDataUrl(userDataPath: string, item: StoredRoomMediaAsset): string {
  if (!item.mimeType.startsWith("image/")) return "";
  const absolutePath = storedAssetAbsolutePath(userDataPath, item);
  if (!absolutePath || !fs.existsSync(absolutePath)) return "";

  try {
    const image = nativeImage.createFromPath(absolutePath);
    if (image.isEmpty()) return "";
    return image.resize({
      width: 160,
      height: 110,
      quality: "good"
    }).toDataURL();
  } catch {
    return "";
  }
}

function removeStoredFile(userDataPath: string, item: StoredRoomMediaAsset): void {
  const absolutePath = storedAssetAbsolutePath(userDataPath, item);
  if (!absolutePath || !fs.existsSync(absolutePath)) return;
  try {
    fs.unlinkSync(absolutePath);
  } catch {
    // The manifest remains authoritative even if an already-missing file cannot be removed.
  }
}

function storedFileExists(userDataPath: string, item: StoredRoomMediaAsset): boolean {
  const absolutePath = storedAssetAbsolutePath(userDataPath, item);
  return Boolean(absolutePath && fs.existsSync(absolutePath));
}

function storedAssetAbsolutePath(userDataPath: string, item: StoredRoomMediaAsset): string | null {
  const absolutePath = path.resolve(mediaRoot(userDataPath), item.storedPath);
  const root = path.resolve(mediaRoot(userDataPath));
  if (absolutePath !== root && !absolutePath.startsWith(root + path.sep)) return null;
  return absolutePath;
}

function getDraftManifest(userDataPath: string): RoomMediaManifest {
  ensureStagingRootClean(userDataPath);
  const key = draftKey(userDataPath);
  const existing = activeDrafts.get(key);
  if (existing) return existing;
  const draft = cloneManifest(readManifest(userDataPath));
  activeDrafts.set(key, draft);
  return draft;
}

function cloneManifest(manifest: RoomMediaManifest): RoomMediaManifest {
  return {
    version: 1,
    media: manifest.media.map((item) => ({ ...item }))
  };
}

function isDraftDirty(userDataPath: string, draft: RoomMediaManifest): boolean {
  return comparableManifest(draft) !== comparableManifest(readManifest(userDataPath));
}

function comparableManifest(manifest: RoomMediaManifest): string {
  return JSON.stringify(manifest.media.map((item) => ({
    id: item.id,
    roomId: item.roomId,
    kind: item.kind,
    originalName: item.originalName,
    mimeType: item.mimeType,
    title: item.title,
    sortOrder: item.sortOrder,
    sizeBytes: item.sizeBytes,
    storedPath: item.storedPath,
    contentHash: item.contentHash
  })));
}

function isStagedAsset(item: StoredRoomMediaAsset): boolean {
  return item.storedPath.split(/[\\/]+/)[0] === "staging";
}

function draftKey(userDataPath: string): string {
  return path.resolve(userDataPath);
}

function stagingRoot(userDataPath: string): string {
  return path.join(mediaRoot(userDataPath), "staging");
}

function ensureStagingRootClean(userDataPath: string): void {
  const root = path.resolve(stagingRoot(userDataPath));
  if (cleanedStagingRoots.has(root)) return;
  fs.rmSync(root, { recursive: true, force: true });
  cleanedStagingRoots.add(root);
}

function clearStagingRoot(userDataPath: string): void {
  fs.rmSync(stagingRoot(userDataPath), { recursive: true, force: true });
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

function defaultKindForPath(
  sourcePath: string,
  preferredKind: RoomPublicMediaKind | null
): RoomPublicMediaKind | null {
  const extension = path.extname(sourcePath).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (!IMAGE_EXTENSIONS.has(extension)) return null;
  if (preferredKind && preferredKind !== "video") return preferredKind;
  return "photo";
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

function failure(message: string, media: RoomMediaAsset[], dirty = false): RoomMediaMutationResult {
  return { ok: false, message, media, dirty };
}

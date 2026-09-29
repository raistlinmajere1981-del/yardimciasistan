import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { dialog, nativeImage, type BrowserWindow, type OpenDialogOptions } from "electron";
import {
  isPublicResourceMediaKind,
  type PublicResourceMedia,
  type PublicResourceMediaAssetFields,
  type PublicResourceMediaDraftResult,
  type PublicResourceMediaDraftState,
  type PublicResourceMediaKind,
  type PublicResourceMediaMutationResult
} from "@yardimci-asistan/shared";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const SINGLETON_KINDS = new Set<PublicResourceMediaKind>([
  "cover",
  "panorama_360",
  "panorama_180",
  "video"
]);
const IMAGE_LIMIT_BYTES = 30 * 1024 * 1024;
const VIDEO_LIMIT_BYTES = 200 * 1024 * 1024;

export interface ResourceMediaAsset extends PublicResourceMediaAssetFields {
  resourceId: string;
}

export interface StoredResourceMediaAsset extends ResourceMediaAsset {
  storedPath: string;
  contentHash: string;
}

interface ResourceMediaManifest {
  version: 1;
  media: StoredResourceMediaAsset[];
}

export interface ResourceMediaServiceConfig {
  rootDirectory: string;
  idField: "roomId" | "tableId";
  mediaIdPrefix: string;
  pickerTitle: string;
  singularLabel: string;
  pluralLabel: string;
}

export interface ResourceMediaUpdateInput {
  resourceId: string;
  mediaId: string;
  kind: PublicResourceMediaKind;
  title: string;
}

export interface ResourceMediaDeleteInput {
  resourceId: string;
  mediaId: string;
}

export function createPublicResourceMediaService(config: ResourceMediaServiceConfig) {
  const activeDrafts = new Map<string, ResourceMediaManifest>();
  const cleanedStagingRoots = new Set<string>();

  async function addFromDialog(
    userDataPath: string,
    owner: BrowserWindow | null,
    resourceIdValue: string,
    preferredKindValue?: PublicResourceMediaKind
  ): Promise<PublicResourceMediaMutationResult<ResourceMediaAsset>> {
    const resourceId = normalizeId(resourceIdValue);
    if (!resourceId) return failure(`${config.singularLabel} kimliği geçersiz.`, []);

    const preferredKind = normalizeKind(preferredKindValue);
    const pickerOptions: OpenDialogOptions = {
      title: config.pickerTitle,
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
        media: list(userDataPath, resourceId),
        dirty: getDraftState(userDataPath).dirty
      };
    }

    const manifest = getDraftManifest(userDataPath);
    const now = new Date().toISOString();
    const baseMedia = manifest.media.filter((item) => item.resourceId === resourceId);
    const retained = manifest.media.filter((item) => item.resourceId !== resourceId);
    let nextOrder = baseMedia.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
    let resourceMedia = [...baseMedia];
    const addedIds = new Set<string>();

    try {
      for (const sourcePath of result.filePaths) {
        const detectedKind = defaultKindForPath(sourcePath, preferredKind);
        if (!detectedKind) {
          throw new Error("Yalnız JPG, PNG, WebP, MP4 veya WebM dosyaları eklenebilir.");
        }

        if (SINGLETON_KINDS.has(detectedKind)) {
          resourceMedia = resourceMedia.filter((item) => item.kind !== detectedKind);
        }

        const added = copySelectedFile(
          userDataPath,
          resourceId,
          detectedKind,
          sourcePath,
          nextOrder++,
          now,
          "staging"
        );
        addedIds.add(added.id);
        resourceMedia.push(added);
      }
    } catch (error) {
      for (const item of resourceMedia) {
        if (addedIds.has(item.id)) removeStoredFile(userDataPath, item);
      }
      return failure(
        error instanceof Error ? error.message : "Medya dosyası eklenemedi.",
        list(userDataPath, resourceId),
        getDraftState(userDataPath).dirty
      );
    }

    const finalIds = new Set(resourceMedia.map((item) => item.id));
    for (const item of baseMedia) {
      if (!finalIds.has(item.id) && isStagedAsset(item)) removeStoredFile(userDataPath, item);
    }
    manifest.media = [...retained, ...resourceMedia];
    return {
      ok: true,
      message: result.filePaths.length > 1
        ? `${result.filePaths.length} medya dosyası taslağa eklendi.`
        : `${config.singularLabel} medyası taslağa eklendi.`,
      media: list(userDataPath, resourceId),
      dirty: getDraftState(userDataPath).dirty
    };
  }

  function update(
    userDataPath: string,
    input: ResourceMediaUpdateInput
  ): PublicResourceMediaMutationResult<ResourceMediaAsset> {
    const resourceId = normalizeId(input?.resourceId);
    const mediaId = normalizeId(input?.mediaId);
    const kind = normalizeKind(input?.kind);
    if (!resourceId || !mediaId || !kind) return failure("Medya kaydı geçersiz.", []);

    const manifest = getDraftManifest(userDataPath);
    const target = manifest.media.find((item) => item.resourceId === resourceId && item.id === mediaId);
    if (!target) {
      return failure("Medya kaydı bulunamadı.", list(userDataPath, resourceId), getDraftState(userDataPath).dirty);
    }

    if (kind === "video" && !target.mimeType.startsWith("video/")) {
      return failure(
        "Görsel dosyası video olarak işaretlenemez.",
        list(userDataPath, resourceId),
        getDraftState(userDataPath).dirty
      );
    }
    if (kind !== "video" && !target.mimeType.startsWith("image/")) {
      return failure(
        "Video dosyası görsel türüne çevrilemez.",
        list(userDataPath, resourceId),
        getDraftState(userDataPath).dirty
      );
    }

    if (SINGLETON_KINDS.has(kind)) {
      for (const item of manifest.media) {
        if (item.resourceId !== resourceId || item.id === mediaId || item.kind !== kind) continue;
        item.kind = "photo";
      }
    }

    target.kind = kind;
    target.title = cleanText(input.title, 240);
    target.updatedAt = new Date().toISOString();
    return {
      ok: true,
      message: "Medya bilgisi taslakta güncellendi.",
      media: list(userDataPath, resourceId),
      dirty: getDraftState(userDataPath).dirty
    };
  }

  function remove(
    userDataPath: string,
    input: ResourceMediaDeleteInput
  ): PublicResourceMediaMutationResult<ResourceMediaAsset> {
    const resourceId = normalizeId(input?.resourceId);
    const mediaId = normalizeId(input?.mediaId);
    if (!resourceId || !mediaId) return failure("Medya kaydı geçersiz.", []);

    const manifest = getDraftManifest(userDataPath);
    const target = manifest.media.find((item) => item.resourceId === resourceId && item.id === mediaId);
    if (!target) {
      return failure("Medya kaydı bulunamadı.", list(userDataPath, resourceId), getDraftState(userDataPath).dirty);
    }

    if (isStagedAsset(target)) removeStoredFile(userDataPath, target);
    manifest.media = manifest.media.filter((item) => item.id !== mediaId);
    return {
      ok: true,
      message: "Medya taslaktan kaldırıldı.",
      media: list(userDataPath, resourceId),
      dirty: getDraftState(userDataPath).dirty
    };
  }

  function list(userDataPath: string, resourceIdValue: string): ResourceMediaAsset[] {
    ensureStagingRootClean(userDataPath);
    const resourceId = normalizeId(resourceIdValue);
    if (!resourceId) return [];
    const manifest = activeDrafts.get(draftKey(userDataPath)) ?? readManifest(userDataPath);
    return sortMedia(
      toPublicLocalAssets(
        userDataPath,
        manifest.media.filter((item) => item.resourceId === resourceId)
      )
    );
  }

  function getDraftState(userDataPath: string): PublicResourceMediaDraftState {
    ensureStagingRootClean(userDataPath);
    const draft = activeDrafts.get(draftKey(userDataPath));
    return { dirty: Boolean(draft && isDraftDirty(userDataPath, draft)) };
  }

  function commitDraft(userDataPath: string): PublicResourceMediaDraftResult {
    ensureStagingRootClean(userDataPath);
    const key = draftKey(userDataPath);
    const draft = activeDrafts.get(key);
    if (!draft || !isDraftDirty(userDataPath, draft)) {
      activeDrafts.delete(key);
      clearStagingRoot(userDataPath);
      return { ok: true, message: `${config.pluralLabel}nda değişiklik yok.`, dirty: false, changed: false };
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
          throw new Error(`${item.originalName || config.singularLabel + " medyası"} staging alanında bulunamadı.`);
        }
        const extension = path.extname(item.storedPath).toLowerCase();
        const relativeDirectory = path.join("files", normalizeId(item.resourceId));
        const directory = path.join(mediaRoot(userDataPath), relativeDirectory);
        fs.mkdirSync(directory, { recursive: true });
        const storedPath = path.join(relativeDirectory, item.id + extension);
        const destination = path.join(mediaRoot(userDataPath), storedPath);
        fs.copyFileSync(source, destination);
        copiedFiles.push(destination);
        return { ...item, storedPath, remoteUrl: "" };
      });

      const nextManifest: ResourceMediaManifest = { version: 1, media: committedMedia };
      writeManifest(userDataPath, nextManifest);

      const retainedIds = new Set(committedMedia.map((item) => item.id));
      for (const item of canonical.media) {
        if (!retainedIds.has(item.id)) removeStoredFile(userDataPath, item);
      }

      activeDrafts.delete(key);
      clearStagingRoot(userDataPath);
      return { ok: true, message: `${config.pluralLabel} kaydedildi.`, dirty: false, changed: true };
    } catch (error) {
      for (const file of copiedFiles) {
        try {
          fs.unlinkSync(file);
        } catch {
          // Canonical manifest remains authoritative.
        }
      }
      return {
        ok: false,
        message: error instanceof Error && error.message ? error.message : `${config.pluralLabel} kaydedilemedi.`,
        dirty: true,
        changed: false
      };
    }
  }

  function discardDraft(userDataPath: string): PublicResourceMediaDraftResult {
    ensureStagingRootClean(userDataPath);
    const key = draftKey(userDataPath);
    const draft = activeDrafts.get(key);
    const changed = Boolean(draft && isDraftDirty(userDataPath, draft));
    activeDrafts.delete(key);
    clearStagingRoot(userDataPath);
    return {
      ok: true,
      message: changed
        ? `${config.singularLabel} medyası değişiklikleri geri alındı.`
        : `${config.pluralLabel}nda bekleyen değişiklik yok.`,
      dirty: false,
      changed
    };
  }

  function listPending(userDataPath: string): StoredResourceMediaAsset[] {
    ensureStagingRootClean(userDataPath);
    return readManifest(userDataPath).media
      .filter((item) => !item.remoteUrl && storedFileExists(userDataPath, item))
      .sort((a, b) => a.resourceId.localeCompare(b.resourceId) || a.sortOrder - b.sortOrder);
  }

  function getPublished(userDataPath: string, resourceId: string): PublicResourceMedia[] {
    ensureStagingRootClean(userDataPath);
    return readManifest(userDataPath).media
      .filter((item) => item.resourceId === resourceId && item.remoteUrl)
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

  function getUploadSource(userDataPath: string, mediaId: string): {
    asset: StoredResourceMediaAsset;
    absolutePath: string;
  } | null {
    ensureStagingRootClean(userDataPath);
    const asset = readManifest(userDataPath).media.find((item) => item.id === mediaId);
    if (!asset) return null;
    const absolutePath = storedAssetAbsolutePath(userDataPath, asset);
    if (!absolutePath || !fs.existsSync(absolutePath)) return null;
    return { asset, absolutePath };
  }

  function markPublished(userDataPath: string, mediaId: string, remoteUrl: string): void {
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
    resourceId: string,
    kind: PublicResourceMediaKind,
    sourcePath: string,
    sortOrder: number,
    now: string,
    storageArea: "files" | "staging"
  ): StoredResourceMediaAsset {
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

    const mediaId = config.mediaIdPrefix + crypto.randomUUID().replaceAll("-", "");
    const safeResourceId = normalizeId(resourceId);
    const relativeDirectory = path.join(storageArea, safeResourceId);
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
      resourceId: safeResourceId,
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

  function readManifest(userDataPath: string): ResourceMediaManifest {
    const file = manifestPath(userDataPath);
    if (!fs.existsSync(file)) return { version: 1, media: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { media?: unknown[] };
      return {
        version: 1,
        media: Array.isArray(parsed.media)
          ? parsed.media.map(normalizeStoredAsset).filter((item): item is StoredResourceMediaAsset => Boolean(item))
          : []
      };
    } catch {
      return { version: 1, media: [] };
    }
  }

  function writeManifest(userDataPath: string, manifest: ResourceMediaManifest): void {
    const root = mediaRoot(userDataPath);
    fs.mkdirSync(root, { recursive: true });
    const file = manifestPath(userDataPath);
    const temporary = file + ".tmp";
    const media = manifest.media.map((item) => {
      const { resourceId, ...rest } = item;
      return { ...rest, [config.idField]: resourceId };
    });
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, media }, null, 2), "utf8");
    fs.renameSync(temporary, file);
  }

  function normalizeStoredAsset(value: unknown): StoredResourceMediaAsset | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    const id = normalizeId(candidate.id);
    const resourceId = normalizeId(candidate[config.idField] ?? candidate.resourceId);
    const kind = normalizeKind(candidate.kind);
    const storedPath = String(candidate.storedPath ?? "").trim();
    if (!id || !resourceId || !kind || !storedPath) return null;
    return {
      id,
      resourceId,
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

  function toPublicLocalAssets(userDataPath: string, items: StoredResourceMediaAsset[]): ResourceMediaAsset[] {
    return items.map((item) => {
      const { storedPath: _storedPath, contentHash: _contentHash, ...asset } = item;
      return {
        ...asset,
        previewDataUrl: createPreviewDataUrl(userDataPath, item)
      };
    });
  }

  function createPreviewDataUrl(userDataPath: string, item: StoredResourceMediaAsset): string {
    if (!item.mimeType.startsWith("image/")) return "";
    const absolutePath = storedAssetAbsolutePath(userDataPath, item);
    if (!absolutePath || !fs.existsSync(absolutePath)) return "";
    try {
      const image = nativeImage.createFromPath(absolutePath);
      if (image.isEmpty()) return "";
      return image.resize({ width: 160, height: 110, quality: "good" }).toDataURL();
    } catch {
      return "";
    }
  }

  function removeStoredFile(userDataPath: string, item: StoredResourceMediaAsset): void {
    const absolutePath = storedAssetAbsolutePath(userDataPath, item);
    if (!absolutePath || !fs.existsSync(absolutePath)) return;
    try {
      fs.unlinkSync(absolutePath);
    } catch {
      // Manifest remains authoritative.
    }
  }

  function storedFileExists(userDataPath: string, item: StoredResourceMediaAsset): boolean {
    const absolutePath = storedAssetAbsolutePath(userDataPath, item);
    return Boolean(absolutePath && fs.existsSync(absolutePath));
  }

  function storedAssetAbsolutePath(userDataPath: string, item: StoredResourceMediaAsset): string | null {
    const absolutePath = path.resolve(mediaRoot(userDataPath), item.storedPath);
    const root = path.resolve(mediaRoot(userDataPath));
    if (absolutePath !== root && !absolutePath.startsWith(root + path.sep)) return null;
    return absolutePath;
  }

  function getDraftManifest(userDataPath: string): ResourceMediaManifest {
    ensureStagingRootClean(userDataPath);
    const key = draftKey(userDataPath);
    const existing = activeDrafts.get(key);
    if (existing) return existing;
    const draft = cloneManifest(readManifest(userDataPath));
    activeDrafts.set(key, draft);
    return draft;
  }

  function cloneManifest(manifest: ResourceMediaManifest): ResourceMediaManifest {
    return { version: 1, media: manifest.media.map((item) => ({ ...item })) };
  }

  function isDraftDirty(userDataPath: string, draft: ResourceMediaManifest): boolean {
    return comparableManifest(draft) !== comparableManifest(readManifest(userDataPath));
  }

  function comparableManifest(manifest: ResourceMediaManifest): string {
    return JSON.stringify(manifest.media.map((item) => ({
      id: item.id,
      resourceId: item.resourceId,
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

  function isStagedAsset(item: StoredResourceMediaAsset): boolean {
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
    try {
      fs.rmSync(stagingRoot(userDataPath), { recursive: true, force: true });
    } catch {
      // Canonical manifest has already been committed when this runs after save.
    }
  }

  function mediaRoot(userDataPath: string): string {
    return path.join(userDataPath, "assets", config.rootDirectory);
  }

  function manifestPath(userDataPath: string): string {
    return path.join(mediaRoot(userDataPath), "manifest.json");
  }

  return {
    addFromDialog,
    update,
    remove,
    list,
    getDraftState,
    commitDraft,
    discardDraft,
    listPending,
    getPublished,
    getUploadSource,
    markPublished
  };
}

function normalizeId(value: unknown): string {
  const id = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{1,180}$/.test(id) ? id : "";
}

function normalizeKind(value: unknown): PublicResourceMediaKind | null {
  return isPublicResourceMediaKind(value) ? value : null;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function defaultKindForPath(
  sourcePath: string,
  preferredKind: PublicResourceMediaKind | null
): PublicResourceMediaKind | null {
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

function failure(
  message: string,
  media: ResourceMediaAsset[],
  dirty = false
): PublicResourceMediaMutationResult<ResourceMediaAsset> {
  return { ok: false, message, media, dirty };
}

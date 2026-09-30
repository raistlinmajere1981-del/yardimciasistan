import fs from "node:fs";
import path from "node:path";
import {
  DESKTOP_DATABASE_FILE_NAME,
  resolveAssetsPath,
  resolveDatabasePath,
  resolveMaintenancePath
} from "./data-paths.js";

const CLEAN_START_ARCHIVE_DIR = "legacy-data";
const CLEAN_START_ARCHIVE_FORMAT = "yardimci-asistan-clean-start-archive-v1";

export interface CleanStartArchiveResult {
  archived: boolean;
  archiveDirectory: string;
  movedEntries: string[];
}

function archiveTimestamp(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function chooseArchiveDirectory(dataRoot: string, now: Date) {
  const root = path.join(dataRoot, CLEAN_START_ARCHIVE_DIR);
  fs.mkdirSync(root, { recursive: true });

  const baseName = `before-clean-${archiveTimestamp(now)}`;
  let candidate = path.join(root, baseName);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(root, `${baseName}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}

function movePath(source: string, destination: string) {
  try {
    fs.renameSync(source, destination);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }

  try {
    fs.cpSync(source, destination, { recursive: true, force: false, errorOnExist: true });
    fs.rmSync(source, { recursive: true, force: true });
  } catch (error) {
    try {
      fs.rmSync(destination, { recursive: true, force: true });
    } catch {
      // Preserve the original move failure.
    }
    throw error;
  }
}

export function archiveLocalDataForCleanStart(
  dataRoot: string,
  now = new Date(),
  backupRoot = path.join(dataRoot, "backups")
): CleanStartArchiveResult {
  const databasePath = resolveDatabasePath(dataRoot);
  const assetsPath = resolveAssetsPath(dataRoot);
  const maintenancePath = resolveMaintenancePath(dataRoot);
  const entries = [
    { source: databasePath, name: DESKTOP_DATABASE_FILE_NAME },
    { source: `${databasePath}-wal`, name: `${DESKTOP_DATABASE_FILE_NAME}-wal` },
    { source: `${databasePath}-shm`, name: `${DESKTOP_DATABASE_FILE_NAME}-shm` },
    { source: `${databasePath}-journal`, name: `${DESKTOP_DATABASE_FILE_NAME}-journal` },
    { source: assetsPath, name: "assets" },
    { source: maintenancePath, name: "maintenance" },
    { source: backupRoot, name: "backups" }
  ].filter((entry, index, all) =>
    fs.existsSync(entry.source)
    && all.findIndex((candidate) => path.resolve(candidate.source) === path.resolve(entry.source)) === index
  );

  if (entries.length === 0) {
    return { archived: false, archiveDirectory: "", movedEntries: [] };
  }

  const archiveDirectory = chooseArchiveDirectory(dataRoot, now);
  fs.mkdirSync(archiveDirectory, { recursive: true });

  const moved: Array<{ source: string; destination: string; name: string }> = [];
  try {
    for (const entry of entries) {
      const destination = path.join(archiveDirectory, entry.name);
      movePath(entry.source, destination);
      moved.push({ ...entry, destination });
    }

    fs.writeFileSync(
      path.join(archiveDirectory, "archive.json"),
      JSON.stringify({
        format: CLEAN_START_ARCHIVE_FORMAT,
        createdAt: now.toISOString(),
        movedEntries: moved.map((entry) => entry.name)
      }, null, 2) + "\n",
      { encoding: "utf8", mode: 0o600 }
    );

    return {
      archived: true,
      archiveDirectory,
      movedEntries: moved.map((entry) => entry.name)
    };
  } catch (error) {
    for (const entry of [...moved].reverse()) {
      try {
        if (fs.existsSync(entry.destination) && !fs.existsSync(entry.source)) {
          movePath(entry.destination, entry.source);
        }
      } catch {
        // Preserve the original error; best-effort rollback keeps recoverable data in place.
      }
    }
    try {
      if (fs.existsSync(archiveDirectory) && fs.readdirSync(archiveDirectory).length === 0) {
        fs.rmdirSync(archiveDirectory);
      }
    } catch {
      // Best effort cleanup.
    }
    throw error;
  }
}

export interface CleanStartTransientCleanupResult {
  removedEntries: string[];
  preservedEntries: string[];
}

export function cleanupTransientStateForCleanStart(dataRoot: string): CleanStartTransientCleanupResult {
  const updatesRoot = path.join(dataRoot, "updates");
  const transientEntries = [
    { path: path.join(updatesRoot, "pending.json"), name: "updates/pending.json" },
    { path: path.join(updatesRoot, "installing.json"), name: "updates/installing.json" },
    { path: path.join(updatesRoot, "downloads"), name: "updates/downloads" }
  ];

  const removedEntries: string[] = [];
  for (const entry of transientEntries) {
    if (!fs.existsSync(entry.path)) continue;
    fs.rmSync(entry.path, { recursive: true, force: true });
    removedEntries.push(entry.name);
  }

  const preservedEntries = [
    "logs",
    "legacy-data",
    "updates/settings.json"
  ].filter((entry) => fs.existsSync(path.join(dataRoot, entry)));

  return { removedEntries, preservedEntries };
}

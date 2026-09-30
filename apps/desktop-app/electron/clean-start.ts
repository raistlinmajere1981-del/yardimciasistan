import fs from "node:fs";
import path from "node:path";
import {
  DESKTOP_DATABASE_FILE_NAME,
  resolveAssetsPath,
  resolveDatabasePath
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

export function archiveLocalDataForCleanStart(
  dataRoot: string,
  now = new Date()
): CleanStartArchiveResult {
  const databasePath = resolveDatabasePath(dataRoot);
  const assetsPath = resolveAssetsPath(dataRoot);
  const entries = [
    { source: databasePath, name: DESKTOP_DATABASE_FILE_NAME },
    { source: `${databasePath}-wal`, name: `${DESKTOP_DATABASE_FILE_NAME}-wal` },
    { source: `${databasePath}-shm`, name: `${DESKTOP_DATABASE_FILE_NAME}-shm` },
    { source: `${databasePath}-journal`, name: `${DESKTOP_DATABASE_FILE_NAME}-journal` },
    { source: assetsPath, name: "assets" }
  ].filter((entry) => fs.existsSync(entry.source));

  if (entries.length === 0) {
    return { archived: false, archiveDirectory: "", movedEntries: [] };
  }

  const archiveDirectory = chooseArchiveDirectory(dataRoot, now);
  fs.mkdirSync(archiveDirectory, { recursive: true });

  const moved: Array<{ source: string; destination: string; name: string }> = [];
  try {
    for (const entry of entries) {
      const destination = path.join(archiveDirectory, entry.name);
      fs.renameSync(entry.source, destination);
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
          fs.renameSync(entry.destination, entry.source);
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

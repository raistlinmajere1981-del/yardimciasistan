import fs from "node:fs";
import path from "node:path";
import { resolveProductAssetAbsoluteFromRelative } from "./data-paths.js";

/** Read the canonical immutable archive; consumers never store a channel image copy. */
export function readProductImageAsset(databasePath: string, relativePath: string): string {
  if (!relativePath) return "";
  const absolutePath = resolveProductAssetAbsoluteFromRelative(path.dirname(databasePath), relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return "";
  const bytes = fs.readFileSync(absolutePath);
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) return "";
  const extension = path.extname(absolutePath).toLowerCase();
  const mime = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/**
 * Admin-owned site inventory -> Efekt Atölyesi editable asset projections.
 *
 * Installations are canonical. The historical projects.json is only an optional
 * per-image binding overlay (and test fixture override), never a second site list.
 * No network calls, live write or recursive search of private business data.
 * Dynamic products, galleries, uploads and app screenshot showcases are excluded.
 * Only site-owned, hardcoded design images (and explicitly registered targets)
 * can be edited. Public API images must never become effect targets.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join, extname, basename, sep } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const IMG = /\.(?:png|jpe?g|webp|avif)$/i;
const SAFE = /^[a-z0-9_-]+$/;
const SCAN_DIRS = ["site/views", "canonical/site/views", "inc"];
const MAX_REFS = 80;
const MAX_BYTES = 3_000_000;
const siteCandidate = (name) =>
  !/(?:favicon|sprite|icon|logo|avatar|badge|flag|social|launcher|symbol|brand)/i.test(name);
// Static-image eligibility is intentionally narrow. When a site's hero is
// runtime product/gallery media, say so locally instead of offering a bulk
// product/gallery effect action.
const STATIC_IMAGE_NOTES = Object.freeze({
  teknikel: "Teknikel hero görseli API'den gelen ürün/galeri medyasıdır. Tasarımda sabit dekoratif fotoğraf yoktur; ürün/galeri görsellerine efekt bağlanmaz."
});

function bounded(root, child) {
  const path = resolve(root, child);
  if (path !== root && !path.startsWith(root + sep)) return null;
  return path;
}
function filesFor(folder, limit = 200) {
  if (!existsSync(folder)) return [];
  const found = [];
  const visit = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (found.length >= limit) return;
      const path = join(dir, e.name);
      if (e.isDirectory()) visit(path);
      else if (e.isFile() && /\.(php|css|html|mjs)$/i.test(e.name)) found.push(path);
    }
  };
  visit(folder);
  return found;
}
function referencedAssets(root) {
  const sources = [join(root, "index.php"), ...SCAN_DIRS.flatMap(dir => filesFor(join(root, dir)))];
  const references = new Set();
  for (const file of sources) {
    if (!existsSync(file) || statSync(file).size > MAX_BYTES) continue;
    const text = readFileSync(file, "utf8");
    // Fixed design imagery only: a literal asset path in an <img src>.
    // Do not collect srcset alternatives, runtime gallery/product URLs,
    // publication API records, uploaded media or showcase manifests.
    for (const image of text.matchAll(/<img\b[^<]*?\bsrc\s*=\s*"([^"]+)"/gi)) {
      if (references.size >= MAX_REFS) break;
      const match = image[1].match(/site\/(?:img|media)\/[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g|avif)/i);
      if (match && !match[0].includes("..") && siteCandidate(match[0])) references.add(match[0]);
    }
  }
  return [...references];
}
function dimensions(file) {
  try {
    const [w,h] = execFileSync("identify", ["-ping", "-format", "%w %h", file], {
      timeout: 4500, encoding: "utf8", stdio: ["ignore","pipe","ignore"]
    }).trim().split(/\s+/).map(Number);
    if (Number.isInteger(w) && Number.isInteger(h) && w >= 480 && h >= 280 && w*h <= 80_000_000) return [w,h];
  } catch { /* Missing ImageMagick or unreadable: do not advertise as editable. */ }
  return null;
}
function candidateFiles(root, ref) {
  if (ref.startsWith("site/")) return [
    join(root,"public/assets", ref),
    join(root,"assets", ref), // published site-owned mirror takes precedence
    join(root,"canonical/public/assets", ref) // template fallback
  ];
  if (ref.startsWith("assets/")) return [join(root, ref)];
  return [];
}
function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0,38) || "image";
}
function hash(text) { return createHash("sha256").update(text).digest("hex"); }
function getRoot(repoRoot, key, installation) {
  if (key === "landing") return join(repoRoot, "test-site/landing/deneme");
  const ext = installation.externalRepo;
  if (!ext?.defaultSibling) return "";
  const envPath = ext.env && process.env[ext.env];
  const root = envPath ? resolve(envPath) : resolve(repoRoot, "..", ext.defaultSibling);
  return existsSync(root) ? root : "";
}

/**
 * @param {{workspace:string, legacyFile:string, registryFile:string}} options
 */
export function discoverSiteProjects({workspace, legacyFile, registryFile}) {
  const repoRoot = resolve(workspace, "YardimciAsistan");
  const registry = JSON.parse(readFileSync(registryFile, "utf8"));
  const legacy = existsSync(legacyFile)
    ? JSON.parse(readFileSync(legacyFile,"utf8")).projects ?? []
    : [];
  const projects = [];
  for (const [id, installation] of Object.entries(registry.installations ?? {})) {
    if (!SAFE.test(id) || !["customer-site","landing"].includes(installation.kind)) continue;
    const root = getRoot(repoRoot, id, installation);
    const fallback = legacy.find(p=>p.id===id);
    const images = [];
    const seen = new Set();
    const seenHashes = new Set();
    const add = (rel, old) => {
      if (!root || !IMG.test(rel) || rel.includes("..")) return;
      const absolute = bounded(root,rel);
      if (!absolute || !existsSync(absolute) || !statSync(absolute).isFile()) return;
      const ext = extname(rel);
      const key = absolute.toLowerCase();
      if (seen.has(key)) return;
      const size = dimensions(absolute);
      if (!size) return;
      const sourceHash = hash(readFileSync(absolute));
      // The same fixed photo may exist in both active and canonical trees.
      // An explicitly linked target is encountered first and takes priority.
      if (seenHashes.has(sourceHash)) return;
      seen.add(key);
      seenHashes.add(sourceHash);
      const [width,height] = size;
      const itemId = old?.id ?? slug(basename(rel,ext)) + "_" + hash(rel).slice(0,8);
      const subdir = existsSync(join(root,"canonical/site/config.php")) ? "canonical/" : "";
      const scene = old?.scene ?? (rel.startsWith("assets/site/") ? "assets/site/scenes/" :
        subdir + "public/assets/site/scenes/") + itemId + ".scene.json";
      const enabled = Boolean(old?.upload && old.upload.type !== "disabled");
      const note = old?.upload?.note ??
        (enabled ? "Sahneye özel mevcut yayın hedefi." :
        rel.startsWith("canonical/") ? "Bu görsel şablon kaynak ağacında; aktif site deploy eşlemesi tamamlanmalı." :
        "Sabit fotoğraf için yerel sahne/manifest hazırlanabilir. Canlı yayın ayrıca doğrulanır.");
      images.push({
        id:id+":"+itemId, name:old?.name ?? basename(rel,ext).replace(/[-_]/g," "),
        available:true, hasDraft:false, hasScene:existsSync(join(root,scene)),
        canPublish:enabled, note, width,height, sourceHash,
        sourcePath:rel, scenePath:scene, bindingStatus:enabled ? "linked" : "needs-setup",
        __source:{id:itemId, name:old?.name ?? basename(rel,ext), photo:rel,
          photoRef:old?.photoRef ?? "assets/site-media/"+itemId+ext.toLowerCase(),
          width,height,scene,upload:old?.upload,publicSceneUrl:old?.publicSceneUrl}
      });
    };
    for (const old of fallback?.images ?? []) add(old.photo,old);
    for (const ref of referencedAssets(root)) {
      const real = candidateFiles(root,ref).find(p=>existsSync(p) && p.startsWith(root+sep));
      if (real) add(relative(root,real),null);
    }
    projects.push({
      id, name:installation.title || id, siteUrl:installation.siteUrl || "", images,
      directory:relative(workspace,root || resolve(workspace,id)),
      note:root ? (images.length ? "" : STATIC_IMAGE_NOTES[id] ??
          "Siteye ait ve sayfalarda kullanılan düzenlenebilir yerel görsel bulunamadı.")
        : "Site kaynak dizini bu bilgisayarda bulunamadı."
    });
  }
  return projects;
}

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  bumpProductVersion,
  checkProductVersion,
  readProductVersion,
  setProductVersion,
  syncProductVersion
} from "./product-version.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "yardimci-version-"));
  mkdirSync(join(root, "apps", "desktop-app"), { recursive: true });
  mkdirSync(join(root, "apps", "android-app"), { recursive: true });
  writeJson(join(root, "product-version.json"), { version: "0.1.7", androidVersionCode: 4 });
  writeJson(join(root, "apps", "desktop-app", "package.json"), { name: "desktop", version: "0.1.0" });
  writeJson(join(root, "apps", "android-app", "package.json"), { name: "android", version: "0.1.0" });
  writeJson(join(root, "package-lock.json"), {
    packages: {
      "apps/desktop-app": { version: "0.1.0" },
      "apps/android-app": { version: "0.1.0" }
    }
  });
  return root;
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

test("sync canonical sürümü desktop/android metadata'ya yazar", () => {
  const root = fixture();
  try {
    const product = syncProductVersion(root);
    assert.deepEqual(product, { version: "0.1.7", androidVersionCode: 4 });
    assert.equal(JSON.parse(readFileSync(join(root, "apps", "desktop-app", "package.json"))).version, "0.1.7");
    assert.equal(JSON.parse(readFileSync(join(root, "apps", "android-app", "package.json"))).version, "0.1.7");
    assert.deepEqual(checkProductVersion(root), product);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("set yeni ürün sürümünde Android versionCode'u bir artırır", () => {
  const root = fixture();
  try {
    const product = setProductVersion("0.1.8", root);
    assert.deepEqual(product, { version: "0.1.8", androidVersionCode: 5 });
    assert.deepEqual(readProductVersion(root), product);
    assert.deepEqual(checkProductVersion(root), product);
    assert.throws(() => setProductVersion("0.1.7", root), /Sürüm geriye alınamaz/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bump patch/minor/major canonical sürümü ilerletir", () => {
  const root = fixture();
  try {
    assert.equal(bumpProductVersion("patch", root).version, "0.1.8");
    assert.equal(bumpProductVersion("minor", root).version, "0.2.0");
    assert.equal(bumpProductVersion("major", root).version, "1.0.0");
    assert.equal(readProductVersion(root).androidVersionCode, 7);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

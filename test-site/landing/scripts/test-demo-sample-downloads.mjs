import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Sample ZIP cards only link to existing nonempty archives for the current release", () => {
  const root = mkdtempSync(join(tmpdir(), "ya-sample-download-test-"));
  const originalRoot = resolve("test-site/landing");
  const inc = join(root, "inc");
  const downloads = join(root, "downloads");
  mkdirSync(inc, { recursive: true });
  mkdirSync(downloads, { recursive: true });
  try {
    copyFileSync(join(originalRoot, "inc/demo-installation.php"), join(inc, "demo-installation.php"));
    const sourceRelease = JSON.parse(readFileSync(join(originalRoot, "release.json"), "utf8"));
    writeFileSync(join(root, "release.json"), JSON.stringify(sourceRelease));
    const php = [
      'require $argv[1];',
      'echo json_encode(demo_sample_downloads(), JSON_THROW_ON_ERROR);'
    ].join(" ");
    const inspect = () => {
      const run = spawnSync("php", ["-r", php, join(inc, "demo-installation.php")], { encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
      return JSON.parse(run.stdout);
    };
    let items = inspect();
    assert.equal(items.length, 3);
    assert.ok(items.every(item => item.ready === false && item.url === ""));
    const file = join(downloads, `YardimciAsistan-OrnekVeri-market-${sourceRelease.desktopVersion}.zip`);
    writeFileSync(file, "");
    assert.equal(inspect().filter(item => item.ready).length, 0);
    writeFileSync(file, "stand-in-archive");
    items = inspect();
    assert.equal(items.filter(item => item.ready).length, 1);
    assert.equal(items.find(item => item.key === "market").url, `/downloads/${encodeURIComponent(file.split("/").at(-1))}`);
    assert.ok(items.filter(item => item.key !== "market").every(item => item.url === ""));
    writeFileSync(join(root, "release.json"), JSON.stringify({ desktopVersion: "invalid/path" }));
    assert.deepEqual(inspect(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

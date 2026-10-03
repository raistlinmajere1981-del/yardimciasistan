import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-web-version-"));
const webRoot = join(tempRoot, "web-module");
cpSync(join(process.cwd(), "firm-template", "web-module"), webRoot, { recursive: true });

const expected = JSON.parse(readFileSync(join(webRoot, "config", "version.json"), "utf8"));
const port = await freePort();
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", webRoot], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  const url = `http://127.0.0.1:${port}/api/version.php`;
  await waitFor(url);

  const response = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    product_version: expected.product_version,
    web_module_version: expected.web_module_version
  });

  const invalidMethod = await fetch(url, { method: "POST" });
  assert.equal(invalidMethod.status, 405);

  console.log(`web-version-smoke-ok: product=${body.product_version} web=${body.web_module_version}`);
} catch (error) {
  if (output.trim()) console.error(output.trim());
  throw error;
} finally {
  server.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // PHP server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PHP server did not become ready: ${url}`);
}

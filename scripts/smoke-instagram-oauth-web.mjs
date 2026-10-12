import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "ya-ig-oauth-"));
const configPath = join(root, "secret.json"), grantsDir = join(root, "pending");
mkdirSync(grantsDir);
const fakeSecret = "local-test-secret-not-a-meta-credential";
writeFileSync(configPath, JSON.stringify({ app_secret: fakeSecret }), { mode: 0o600 });
const tcp = createTcpServer();
await new Promise(resolve => tcp.listen(0, "127.0.0.1", resolve));
const port = tcp.address().port;
await new Promise(resolve => tcp.close(resolve));
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", resolve("test-site/landing")], {
  env: { ...process.env, YA_INSTAGRAM_OAUTH_CONFIG: configPath, YA_INSTAGRAM_OAUTH_PENDING_DIR: grantsDir },
  stdio: ["ignore", "pipe", "pipe"]
});
let stderr = "";
server.stderr.on("data", chunk => stderr += String(chunk).slice(0, 300));
const base = `http://127.0.0.1:${port}/instagram/oauth.php`;
async function post(data) {
  const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  return { status: response.status, data: await response.json() };
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(base); ready = r.status === 400; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, `PHP server failed to start: ${stderr.slice(0, 120)}`);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("hex");
  const start = await post({ action: "start", challenge });
  assert.equal(start.status, 200);
  assert.equal(start.data.ok, true);
  assert.match(start.data.sessionId, /^[a-f0-9]{64}$/);
  const url = new URL(start.data.authorizationUrl);
  assert.equal(url.origin, "https://www.instagram.com");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "3022570838106676");
  assert.equal(url.searchParams.get("redirect_uri"), "https://yardimciasistan.alwaysdata.net/instagram/oauth.php");
  assert.equal(url.searchParams.get("scope"), "instagram_business_basic,instagram_business_content_publish");
  assert.equal(url.searchParams.get("state"), start.data.sessionId);
  assert.ok(!url.href.includes(fakeSecret));
  assert.equal((await post({ action: "claim", sessionId: start.data.sessionId, verifier: randomBytes(32).toString("base64url") })).status, 400);
  assert.equal((await post({ action: "claim", sessionId: start.data.sessionId, verifier })).data.status, "pending");
  const response = await fetch(base + "?state=" + start.data.sessionId + "&error=access_denied");
  assert.equal(response.status, 400);
  assert.ok(!(await response.text()).includes(fakeSecret));
  const failed = await post({ action: "claim", sessionId: start.data.sessionId, verifier });
  assert.equal(failed.data.status, "failed");
  assert.equal((await post({ action: "claim", sessionId: start.data.sessionId, verifier })).status, 400);

  // Simulate server-only successful exchange, verify encrypted-at-rest and one-time delivery.
  const nextVerifier = randomBytes(32).toString("base64url");
  const session = (await post({ action: "start", challenge: createHash("sha256").update(nextVerifier).digest("hex") })).data.sessionId;
  const proof = { accountId: "17800000000000000", username: "ornek_profesyonel", accountType: "BUSINESS", accessToken: "IGQ-TestGrant.abcdef", expiresAt: "2026-12-01T10:00:00Z" };
  const grantPath = join(grantsDir, session + ".json");
  const setup = `$p=$argv[1]; $secret=$argv[2]; $value=json_decode($argv[3],true); $row=json_decode(file_get_contents($p),true);
  $iv=random_bytes(12);$tag="";$data=openssl_encrypt(json_encode($value),"aes-256-gcm",hash("sha256","instagram-grant-v1:".$secret,true),OPENSSL_RAW_DATA,$iv,$tag);
  $row["grant"]=["data"=>base64_encode($data),"iv"=>base64_encode($iv),"tag"=>base64_encode($tag)];$row["phase"]="ready";
  file_put_contents($p,json_encode($row),LOCK_EX);`;
  const result = spawnSync("php", ["-r", setup, grantPath, fakeSecret, JSON.stringify(proof)], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!readFileSync(grantPath, "utf8").includes(proof.accessToken), "Grant must be encrypted on disk");
  const claimed = await post({ action: "claim", sessionId: session, verifier: nextVerifier });
  assert.equal(claimed.status, 200);
  assert.deepEqual(claimed.data.connection, proof);
  assert.equal((await post({ action: "claim", sessionId: session, verifier: nextVerifier })).status, 400);
  assert.equal((await post({ action: "start", challenge: "not-sha256" })).status, 400);
  console.log("instagram-oauth-web-smoke-ok: csrf, no-token-in-browser, wrong-verifier, encrypted grant, one-time claim");
} finally {
  server.kill("SIGTERM");
  rmSync(root, { recursive: true, force: true });
}

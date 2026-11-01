import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { localPairingPayload, localPairingQr } = await jiti.import("../apps/desktop-app/src/components/settings/local-pairing-qr.ts");
const { createQrSvg } = await jiti.import("../apps/desktop-app/src/components/menu/qr-code.ts");
const { createSecurePairingQrSvg } = await jiti.import("../apps/desktop-app/src/components/settings/secure-pairing-qr-code.ts");
// Public S1-generated test certificate only. No private material reaches the renderer.
const cert = new X509Certificate(readFileSync(new URL("../apps/android-app/src/test/resources/local-tls/leaf.pem", import.meta.url)));
const pin = createHash("sha256").update(cert.publicKey.export({ format: "der", type: "spki" })).digest("base64url");
const session = { desktopId: "desktop-12345678-1234-1234-1234-123456789abc", credential: `yald1.${"a".repeat(64)}`, deviceId: "", expiresAt: Date.now() + 120_000, endpoint: "https://192.168.1.2:47831", spkiSha256: pin };
const encoded = Buffer.from("aa".repeat(32), "hex").toString("base64url");
assert.equal(localPairingPayload(session), `yapair3|${session.desktopId}|${encoded}|192.168.1.2:47831|${pin}`);
assert.ok(Buffer.byteLength(localPairingPayload(session)) > 134);
for (const patch of [
  { credential: "weak" }, { spkiSha256: "" }, { spkiSha256: `${pin}=` },
  { spkiSha256: "B".repeat(43) }, { endpoint: "http://192.168.1.2:47831" },
  { endpoint: "https://8.8.8.8:47831" }, { endpoint: "https://192.168.1.256:47831" },
  { endpoint: "https://192.168.01.2:47831" }, { endpoint: "https://evil.invalid:47831" },
  { endpoint: "https://192.168.1.2:65536" }, { endpoint: "https://192.168.1.2:443/path" }
]) assert.throws(() => localPairingQr({ ...session, ...patch }));
assert.throws(() => createSecurePairingQrSvg("x".repeat(272)));
assert.doesNotThrow(() => createSecurePairingQrSvg("x".repeat(271)));
assert.throws(() => createQrSvg("x".repeat(135)));
assert.match(createQrSvg("menu"), /viewBox="0 0 49 49"/);
// Independently decode rasterized SVG modules with the installed ZBar decoder.
// The pixels are the exact displayed SVG, with four-module quiet zone at the settings display width and a larger capture.
const root = mkdtempSync(join(tmpdir(), "ya-qr-v3-"));
try {
  for (const desktopId of [session.desktopId, `desktop-${"x".repeat(120)}`]) {
    const current = { ...session, desktopId };
    const svg = localPairingQr(current);
    assert.match(svg, /viewBox="0 0 65 65"/);
    assert.doesNotMatch(svg, /yald1|yal_/);
    for (const size of [240, 520]) {
      const scale = size / 65;
      const pixels = Buffer.alloc(size * size, 255);
      for (const match of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1"\/>/g)) {
        const x = Math.round(Number(match[1]) * scale), y = Math.round(Number(match[2]) * scale);
        const right = Math.round((Number(match[1]) + 1) * scale), bottom = Math.round((Number(match[2]) + 1) * scale);
        for (let row = y; row < bottom; row++) pixels.fill(0, row * size + x, row * size + right);
      }
      const file = join(root, "pairing.pgm");
      writeFileSync(file, Buffer.concat([Buffer.from(`P5\n${size} ${size}\n255\n`), pixels]));
      const decoded = spawnSync("zbarimg", ["--quiet", "--raw", file], { encoding: "utf8" });
      assert.equal(decoded.status, 0, "ZBar must independently scan the pairing QR (install zbarimg on verification host)");
      assert.equal(decoded.stdout.trim(), localPairingPayload(current));
    }
  }
} finally { rmSync(root, { recursive: true, force: true }); }
console.log("Local pairing QR v3: public S1 pin, strict HTTPS/private IPv4, independent ZBar roundtrip incl. maximum Desktop ID; menu QR unchanged PASS.");

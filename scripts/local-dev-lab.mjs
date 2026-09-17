import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webModuleRoot = join(repoRoot, "firm-template", "web-module");
const syncSecret = "change-this-secret";
const runtimeFiles = [
  "yardimci-asistan.sqlite",
  "yardimci-asistan.sqlite-wal",
  "yardimci-asistan.sqlite-shm"
].map((file) => join(webModuleRoot, "data", file));

const options = parseArgs(process.argv.slice(2));
const managedFiles = [...runtimeFiles];
const backups = new Map(managedFiles.filter((path) => existsSync(path)).map((path) => [path, readFileSync(path)]));
const processes = [];
let cleaned = false;

process.once("SIGINT", () => stopAndExit(0));
process.once("SIGTERM", () => stopAndExit(0));

try {
  await main();
} catch (error) {
  cleanup();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  const phpPort = await getAvailablePort(options.phpPort, options.host);
  const webModuleUrl = `http://127.0.0.1:${phpPort}`;
  const lanUrls = getLanUrls(phpPort);

  if (!options.noSeed) {
    for (const path of runtimeFiles) {
      rmSync(path, { force: true });
    }
  }

  const phpServer = startProcess("php", ["-S", `${options.host}:${phpPort}`, "-t", webModuleRoot], {
    cwd: repoRoot,
    name: "php-module"
  });

  await waitForHttp(`${webModuleUrl}/api/menu.php`, phpServer);
  await verifyAndroidSummary(webModuleUrl);

  printReady({ webModuleUrl, lanUrls });

  if (options.once) {
    cleanup();
    return;
  }

  await waitUntilStopped();
}

function parseArgs(args) {
  const parsed = {
    host: "127.0.0.1",
    phpPort: 8080,
    noSeed: false,
    keepData: false,
    once: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--lan") {
      parsed.host = "0.0.0.0";
    } else if (arg.startsWith("--host=")) {
      parsed.host = arg.slice("--host=".length);
    } else if (arg === "--host") {
      parsed.host = args[index + 1] ?? parsed.host;
      index += 1;
    } else if (arg.startsWith("--php-port=")) {
      parsed.phpPort = Number(arg.slice("--php-port=".length));
    } else if (arg === "--php-port") {
      parsed.phpPort = Number(args[index + 1]);
      index += 1;
    } else if (arg === "--demo-port" || arg.startsWith("--demo-port=") || arg === "--no-demo-web") {
      throw new Error("Demo web kaldırıldı; --demo-port/--no-demo-web artık desteklenmiyor.");
    } else if (arg === "--no-seed") {
      parsed.noSeed = true;
    } else if (arg === "--keep-data") {
      parsed.keepData = true;
    } else if (arg === "--once") {
      parsed.once = true;
    } else {
      throw new Error(`Bilinmeyen seçenek: ${arg}`);
    }
  }

  if (!isValidPort(parsed.phpPort)) {
    throw new Error("Portlar 1-65535 arasında sayısal olmalı.");
  }

  return parsed;
}

function startProcess(command, args, config) {
  const child = spawn(command, args, {
    cwd: config.cwd,
    env: {
      ...process.env,
      ...(config.env ?? {})
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });

  child.output = "";
  child.name = config.name;
  child.stdout.on("data", (chunk) => collectOutput(child, chunk));
  child.stderr.on("data", (chunk) => collectOutput(child, chunk));
  child.once("exit", () => {
    if (!cleaned) {
      cleanup();
    }
  });

  processes.push(child);
  return child;
}

function collectOutput(child, chunk) {
  const text = chunk.toString();
  child.output += text;
  if (child.output.length > 20000) {
    child.output = child.output.slice(-10000);
  }

  if (!options.once) {
    process.stdout.write(prefixLines(child.name, text));
  }
}

async function waitForHttp(url, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`${child.name} erken kapandı.\n${child.output.trim()}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await delay(100);
  }

  throw new Error(`${child.name} hazır olmadı.\n${child.output.trim()}`);
}

async function verifyAndroidSummary(baseUrl) {
  const response = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify({
      action: "android_summary",
      limit: 10
    })
  });

  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.message ?? "Android özeti doğrulanamadı.");
  }
}

function printReady({ webModuleUrl, lanUrls }) {
  console.log("local-dev-lab-ready");
  console.log(`PHP web modülü: ${webModuleUrl}`);
  console.log(`Sync anahtarı: ${syncSecret}`);

  if (lanUrls.length > 0) {
    console.log("Telefon LAN adresleri:");
    for (const url of lanUrls) {
      console.log(`- ${url}`);
    }
  }

  console.log("Desktop için:");
  console.log(`YA_WEB_MODULE_URL=${webModuleUrl} YA_SYNC_SECRET=${syncSecret} npm run dev:desktop`);
  console.log("Android için:");
  console.log("npm run android:phone-test -- --once --hold-ms 12000");

  if (!options.once) {
    console.log("Sunucular açık. Bitirmek için Ctrl+C kullanın.");
  }
}

function waitUntilStopped() {
  return new Promise((resolve) => {
    const alive = processes.filter((child) => child.exitCode === null);
    if (alive.length === 0) {
      cleanup();
      resolve();
      return;
    }

    for (const child of alive) {
      child.once("exit", () => {
        cleanup();
        resolve();
      });
    }
  });
}

function getLanUrls(port) {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && address.family === "IPv4" && !address.internal)
    .map((address) => `http://${address.address}:${port}`);
}

function getAvailablePort(preferredPort, host) {
  return probePort(preferredPort, host).catch(() => probePort(0, host));
}

function probePort(port, host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      server.close(() => resolve(resolvedPort));
    });
  });
}

function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function prefixLines(name, text) {
  return text
    .split(/(\r?\n)/)
    .map((part) => (part === "\n" || part === "\r\n" || part === "" ? part : `[${name}] ${part}`))
    .join("");
}

function cleanup() {
  if (cleaned) {
    return;
  }

  cleaned = true;

  for (const child of processes) {
    if (child.exitCode === null) {
      child.kill();
    }
  }

  if (options.once && !options.keepData) {
    for (const path of managedFiles) {
      rmSync(path, { force: true });
    }
    for (const [path, contents] of backups) {
      writeFileSync(path, contents);
    }
  }
}

function stopAndExit(code) {
  cleanup();
  process.exit(code);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

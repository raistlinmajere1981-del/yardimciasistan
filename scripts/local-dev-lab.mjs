import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webModuleRoot = join(repoRoot, "firm-template", "web-module");
const demoWebRoot = join(repoRoot, "apps", "demo-web");
const syncSecret = "change-this-secret";
const dataFiles = [
  join(webModuleRoot, "data", "requests.json"),
  join(webModuleRoot, "data", "sync-state.json"),
  join(webModuleRoot, "data", "ai-conversations.json"),
  join(webModuleRoot, "data", "android-snapshot.json")
];

const options = parseArgs(process.argv.slice(2));
const backups = new Map(dataFiles.filter((path) => existsSync(path)).map((path) => [path, readFileSync(path, "utf8")]));
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
  const demoPort = await getAvailablePort(options.demoPort, options.host);
  const webModuleUrl = `http://127.0.0.1:${phpPort}`;
  const demoWebUrl = `http://127.0.0.1:${demoPort}`;
  const lanUrls = getLanUrls(phpPort);

  if (!options.noSeed) {
    await runNpm(["run", "demo:data:apply"]);
  }

  const phpServer = startProcess("php", ["-S", `${options.host}:${phpPort}`, "-t", webModuleRoot], {
    cwd: repoRoot,
    name: "php-module"
  });

  await waitForHttp(`${webModuleUrl}/api/menu.php`, phpServer);
  await verifyAndroidSummary(webModuleUrl);

  let demoServer = null;
  if (!options.noDemoWeb) {
    demoServer = startProcess("npx", ["vite", "--host", options.host, "--port", String(demoPort), "--strictPort"], {
      cwd: demoWebRoot,
      name: "demo-web",
      env: {
        VITE_YA_WEB_MODULE_URL: webModuleUrl
      }
    });

    await waitForHttp(demoWebUrl, demoServer);
  }

  printReady({ webModuleUrl, demoWebUrl, lanUrls, demoEnabled: !options.noDemoWeb });

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
    demoPort: 5173,
    noDemoWeb: false,
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
    } else if (arg.startsWith("--demo-port=")) {
      parsed.demoPort = Number(arg.slice("--demo-port=".length));
    } else if (arg === "--demo-port") {
      parsed.demoPort = Number(args[index + 1]);
      index += 1;
    } else if (arg === "--no-demo-web") {
      parsed.noDemoWeb = true;
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

  if (!isValidPort(parsed.phpPort) || !isValidPort(parsed.demoPort)) {
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
      sync_secret: syncSecret,
      limit: 10
    })
  });

  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.message ?? "Android özeti doğrulanamadı.");
  }
}

function printReady({ webModuleUrl, demoWebUrl, lanUrls, demoEnabled }) {
  console.log("local-dev-lab-ready");
  console.log(`PHP web modülü: ${webModuleUrl}`);
  if (demoEnabled) {
    console.log(`Demo web: ${demoWebUrl}`);
  }
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

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`npm ${args.join(" ")} başarısız oldu.`));
    });
  });
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

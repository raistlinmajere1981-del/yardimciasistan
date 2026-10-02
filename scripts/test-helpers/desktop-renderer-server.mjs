import { spawn } from "node:child_process";
import http from "node:http";
import { getLocalViteExecutable } from "./local-vite.mjs";

export async function startDesktopRendererServer() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(
    getLocalViteExecutable(),
    [
      "--config",
      "vite.renderer.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(port)
    ],
    {
      cwd: "apps/desktop-app",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let output = "";
  const collect = (chunk) => {
    output += chunk.toString();
  };
  server.stdout.on("data", collect);
  server.stderr.on("data", collect);

  try {
    await waitForUrl(baseUrl);
  } catch (error) {
    server.kill();
    throw error;
  }

  return {
    baseUrl,
    server,
    output: () => output
  };
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const freePort = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(freePort));
    });
  });
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Renderer server is still starting.
    }
    await delay(100);
  }

  throw new Error(`Desktop renderer did not become ready: ${url}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

import { execFileSync, spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(scriptDir, "..");
const appRepoRoot = resolve(appDir, "../..");

function findMainWorktree(fallback) {
  try {
    const output = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: fallback,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const worktrees = output.split(/\r?\n\r?\n/).map((block) => {
      const path = block.match(/^worktree (.+)$/m)?.[1];
      const branch = block.match(/^branch (.+)$/m)?.[1];
      return { path, branch };
    });
    return worktrees.find((worktree) => worktree.branch === "refs/heads/main")?.path ?? fallback;
  } catch {
    return fallback;
  }
}

const repositoryRoot = process.env.YARDIMCI_REPO_ROOT?.trim() || findMainWorktree(appRepoRoot);

await run("npx", ["tsc", "-p", "tsconfig.electron.json"], appDir);

const devServerUrl = "http://127.0.0.1:5185";
const vite = spawn("npx", ["vite", "--config", "vite.renderer.config.ts"], {
  cwd: appDir,
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32"
});

let electron = null;
let started = false;

function startElectron() {
  electron = spawn("npx", ["electron", "."], {
    cwd: appDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      YARDIMCI_REPO_ROOT: repositoryRoot,
      VITE_DEV_SERVER_URL: devServerUrl
    }
  });

  electron.on("exit", (code) => {
    electron = null;
    vite.kill();
    process.exit(code ?? 0);
  });
}

vite.stdout.on("data", (chunk) => {
  const output = chunk.toString();
  process.stdout.write(output);
  if (!started && output.includes("Local:")) {
    started = true;
    startElectron();
  }
});

vite.stderr.on("data", (chunk) => process.stderr.write(chunk));

process.on("SIGINT", () => {
  if (electron) electron.kill();
  vite.kill();
  process.exit(0);
});

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with ${code}`));
    });
  });
}

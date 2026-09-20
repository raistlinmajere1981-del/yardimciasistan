import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

export async function launchChromiumForSmoke(chromium, options = {}) {
  try {
    return await chromium.launch(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Executable doesn't exist")) {
      throw error;
    }

    const executablePath = resolveSystemChromiumExecutable();
    if (!executablePath) {
      throw error;
    }

    return chromium.launch({
      ...options,
      executablePath
    });
  }
}

export function resolveSystemChromiumExecutable() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim();
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const candidates = process.platform === "win32"
    ? windowsCandidates()
    : process.platform === "darwin"
      ? [
          "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium"
        ]
      : [
          "/usr/bin/brave-browser",
          "/usr/bin/brave",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable"
        ];

  return candidates.find((candidate) => existsSync(candidate)) ?? "";
}

function windowsCandidates() {
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"]
  ].filter(Boolean);

  return roots.flatMap((root) => [
    join(root, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    join(root, "Google", "Chrome", "Application", "chrome.exe"),
    join(root, "Chromium", "Application", "chrome.exe")
  ]);
}

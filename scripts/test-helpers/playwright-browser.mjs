import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

export async function launchChromiumForSmoke(chromium, options = {}) {
  const executablePath = resolveSystemChromiumExecutable();
  if (executablePath) {
    return chromium.launch({
      ...options,
      executablePath
    });
  }

  try {
    return await chromium.launch(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Executable doesn't exist")) {
      throw new Error(
        [
          "Sistem Brave/Chromium/Chrome tarayıcısı bulunamadı ve Playwright Chromium kurulu değil.",
          "Test tarayıcısı indirmek yerine Brave/Chromium/Chrome kurabilir veya",
          "PLAYWRIGHT_CHROMIUM_EXECUTABLE ile mevcut Chromium tabanlı tarayıcı yolunu verebilirsiniz.",
          "",
          message
        ].join("\n"),
        { cause: error }
      );
    }
    throw error;
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

export function describeSmokeBrowser(chromium) {
  const systemExecutable = resolveSystemChromiumExecutable();
  if (systemExecutable) {
    return {
      ready: true,
      source: "system",
      executablePath: systemExecutable,
      message: `Sistem tarayıcısı kullanılacak: ${systemExecutable}`
    };
  }

  try {
    const executablePath = chromium.executablePath();
    const ready = existsSync(executablePath);
    return {
      ready,
      source: "playwright",
      executablePath,
      message: ready
        ? `Playwright Chromium kullanılacak: ${executablePath}`
        : `Sistem Chromium tabanlı tarayıcı ve Playwright Chromium bulunamadı: ${executablePath}`
    };
  } catch (error) {
    return {
      ready: false,
      source: "none",
      executablePath: "",
      message: error instanceof Error ? error.message : String(error)
    };
  }
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

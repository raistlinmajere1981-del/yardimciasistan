import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

const systemChromiumExecutable = resolveSystemChromiumExecutable();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  reporter: [["list"]],
  use: {
    trace: "on-first-retry",
    ...(systemChromiumExecutable
      ? { launchOptions: { executablePath: systemChromiumExecutable } }
      : {})
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 }
      }
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 7"]
      }
    }
  ]
});

function resolveSystemChromiumExecutable() {
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
  ].filter((value): value is string => Boolean(value));

  return roots.flatMap((root) => [
    join(root, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    join(root, "Google", "Chrome", "Application", "chrome.exe"),
    join(root, "Chromium", "Application", "chrome.exe")
  ]);
}

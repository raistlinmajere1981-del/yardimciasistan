import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const baseUrl = process.env.DEMO_WEB_URL ?? "http://127.0.0.1:5173/";
const outputDir = join(process.cwd(), "artifacts", "screenshots");
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch();

try {
  await capture("demo-web-desktop.png", {
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    isMobile: false
  });

  await capture("demo-web-mobile.png", {
    ...devices["Pixel 7"]
  });
} finally {
  await browser.close();
}

async function capture(filename, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({
    path: join(outputDir, filename),
    fullPage: true
  });
  await context.close();
  console.log(`Kaydedildi: artifacts/screenshots/${filename}`);
}

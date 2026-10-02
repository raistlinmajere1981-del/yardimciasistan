import { expect } from "@playwright/test";

export async function expectWhatsAppToFillWorkspace(page) {
  const geometry = await page.locator(".whatsapp-webview").evaluate((webview) => {
    const frame = webview.parentElement;
    const panel = webview.closest(".whatsapp-live-panel");
    const surface = webview.closest(".page-work-surface");
    const content = webview.closest(".page-content");
    const shell = webview.closest(".content");
    const surfaceContent = surface ?? content;
    return {
      panelBottom: panel.getBoundingClientRect().bottom,
      contentBottom: surfaceContent.getBoundingClientRect().bottom
        - parseFloat(getComputedStyle(surfaceContent).paddingBottom)
        - parseFloat(getComputedStyle(surfaceContent).borderBottomWidth || "0"),
      webviewHeight: webview.getBoundingClientRect().height,
      frameHeight: frame.clientHeight,
      webviewWidth: webview.getBoundingClientRect().width,
      frameWidth: frame.clientWidth,
      outerOverflow: shell.scrollHeight - shell.clientHeight
    };
  });
  expect(Math.abs(geometry.panelBottom - geometry.contentBottom)).toBeLessThanOrEqual(1);
  expect(geometry.webviewHeight).toBeGreaterThan(0);
  expect(Math.abs(geometry.webviewHeight - geometry.frameHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.webviewWidth - geometry.frameWidth)).toBeLessThanOrEqual(1);
  expect(geometry.outerOverflow).toBeLessThanOrEqual(1);
}

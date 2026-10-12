import { expect } from "@playwright/test";

// WhatsApp's persistent webview remains mounted while the page is inactive.
// Only sample the visible active instance after React and flex layout settle.
export async function expectWhatsAppToFillWorkspace(page) {
  const webview = page.locator(".persistent-customer-messages-page.is-active .whatsapp-webview:visible");
  let geometry = null;
  try {
    await expect.poll(async () => {
      if (await webview.count() !== 1) return false;
      geometry = await webview.evaluate((element) => {
        const frame = element.parentElement;
        const panel = element.closest(".whatsapp-live-panel");
        const surface = element.closest(".page-work-surface");
        const content = element.closest(".page-content");
        const shell = element.closest(".content");
        const surfaceContent = surface ?? content;
        return {
          panelBottom: panel.getBoundingClientRect().bottom,
          contentBottom: surfaceContent.getBoundingClientRect().bottom
            - parseFloat(getComputedStyle(surfaceContent).paddingBottom)
            - parseFloat(getComputedStyle(surfaceContent).borderBottomWidth || "0"),
          webviewHeight: element.getBoundingClientRect().height,
          frameHeight: frame.clientHeight,
          webviewWidth: element.getBoundingClientRect().width,
          frameWidth: frame.clientWidth,
          outerOverflow: shell.scrollHeight - shell.clientHeight
        };
      });
      return geometry.panelBottom > 0 && geometry.webviewHeight > 0
        && Math.abs(geometry.panelBottom - geometry.contentBottom) <= 1
        && Math.abs(geometry.webviewHeight - geometry.frameHeight) <= 1
        && Math.abs(geometry.webviewWidth - geometry.frameWidth) <= 1
        && geometry.outerOverflow <= 1;
    }, { timeout: 10000, intervals: [100, 200, 400] }).toBe(true);
  } catch (error) {
    console.error("WHATSAPP_LAYOUT_FAILURE", JSON.stringify({
      geometry,
      visibleCount: await webview.count(),
      activeCount: await page.locator(".persistent-customer-messages-page.is-active").count(),
      webviewCount: await page.locator(".whatsapp-webview").count(),
      activeNav: await page.locator("#desktop-sidebar [aria-current='page']").allTextContents(),
      visibleCustomerTabs: await page.locator(".page-tabs:visible").allTextContents()
    }));
    throw error;
  }
  expect(geometry.panelBottom).toBeGreaterThan(0);
  expect(geometry.webviewHeight).toBeGreaterThan(0);
  expect(Math.abs(geometry.panelBottom - geometry.contentBottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.webviewHeight - geometry.frameHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.webviewWidth - geometry.frameWidth)).toBeLessThanOrEqual(1);
  expect(geometry.outerOverflow).toBeLessThanOrEqual(1);
}

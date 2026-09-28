import { expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

export async function captureOperationWorkspace(page, scene) {
  const directory = 'artifacts/screenshots/operations-workspaces';
  mkdirSync(directory, { recursive: true });
  const workspace = page.locator('.workspace-page-frame:visible, dialog.workspace-frame:visible').first();
  for (const [width, height] of [[1366, 768], [1920, 1080]]) for (const scheme of ['light', 'dark']) {
    await page.setViewportSize({ width, height });
    await page.evaluate(scheme => {
      document.documentElement.dataset.colorScheme = scheme;
      document.documentElement.dataset.density = 'comfortable';
      document.documentElement.style.setProperty('--ui-scale', '1');
      document.documentElement.style.zoom = '1';
      document.documentElement.dataset.motion = 'reduced';
      document.querySelectorAll('.operation-panel__body').forEach(element => element.scrollTop = 0);
    }, scheme);
    const bounds = await workspace.boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
    expect(await workspace.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await workspace.locator('.operation-surface').evaluate(element => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    expect(await workspace.locator('.operation-surface').evaluate(element => [...element.querySelectorAll('button, input:not([type="checkbox"]), select, summary')]
      .filter(control => control.getClientRects().length).every(control => control.getBoundingClientRect().height >= 43))).toBe(true);
    await page.screenshot({ path: `${directory}/${scene}-${width}x${height}-${scheme}.png` });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { launchChromiumForSmoke } from './playwright-browser.mjs';

const assets = 'test-site/landing/assets/showcase';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Offline artwork only: no HTTP, fixture database, publication or store runtime. */
export async function checkShowcaseStoreImages(browser, { write = false } = {}) {
  const manifest = JSON.parse(readFileSync(`${assets}/sources.json`, 'utf8'));
  const tokens = readFileSync('test-site/landing/assets/css/site.css', 'utf8').match(/:root\{[^}]+\}/)[0];
  const css = tokens + readFileSync(`${assets}/store-illustration.css`, 'utf8');
  const entries = [];
  for (const language of ['tr', 'en']) {
    const render = spawnSync('php', ['-r', '$_GET["lang"]=$argv[1]; require $argv[2]; require $argv[3]; showcase_store_illustration();', language, resolve('test-site/landing/inc/site.php'), resolve('test-site/landing/inc/showcase-content.php')], { encoding: 'utf8' });
    assert.equal(render.status, 0, render.stderr);
    assert.ok(!render.stdout.includes('Görsel yok'));
    for (const width of [660, 335]) {
      const file = `web-store${language === 'en' ? '-en' : ''}${width === 335 ? '-mobile' : ''}.webp`;
      const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
      try {
        await page.route('**/*', route => route.abort());
        await page.setContent(`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><style>${css}</style></head><body>${render.stdout}</body></html>`);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('[data-store-product]')).toHaveCount(4);
        await expect(page.locator('[data-store-product] svg')).toHaveCount(4);
        assert.equal(await page.locator('[data-store-price]').count(), 4);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), file);
        assert.ok(await page.locator('h2, [data-store-price], nav span, aside li').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)), `Text must fit: ${file}`);
        const sourceSha256 = digest(`${width}\n${css}\n${render.stdout}`);
        const bounds = await page.locator('[data-store-illustration]').boundingBox();
        if (write) {
          // Use whole CSS pixels: fractional line heights otherwise make the
          // browser's screenshot rounding differ from rounded DOM metadata.
          const png = await page.screenshot({ clip: { x: 0, y: 0, width: Math.ceil(bounds.width), height: Math.ceil(bounds.height) } });
          const encoded = await page.evaluate(async base64 => {
            const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            canvas.getContext('2d').drawImage(image, 0, 0);
            return canvas.toDataURL('image/webp', .86).split(',')[1];
          }, png.toString('base64'));
          const bytes = Buffer.from(encoded, 'base64');
          writeFileSync(`${assets}/${file}`, bytes);
          entries.push({ file, width: Math.ceil(bounds.width) * 2, height: Math.ceil(bounds.height) * 2, bytes: bytes.length,
            source: 'test-site/landing/inc/showcase-content.php#showcase_store_illustration',
            uiOwner: 'Homepage-only illustration / showcase_sample_products() and showcase_product_icon()',
            capture: 'Static illustration with sample prices and a sample cart. Not a live storefront, order or publication. Generated offline; no API or database.',
            crop: null, renderSourceSha256: sourceSha256, sha256: digest(bytes) });
        } else {
          const entry = manifest.images.find(image => image.file === file);
          assert.ok(entry, `Missing artwork metadata: ${file}`);
          assert.equal(entry.renderSourceSha256, sourceSha256, `Regenerate changed artwork: ${file}`);
          const bytes = readFileSync(`${assets}/${file}`);
          assert.equal(entry.bytes, bytes.length, file); assert.equal(entry.sha256, digest(bytes), file);
          assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', file);
          const dimensions = await page.evaluate(async base64 => {
            const image = new Image(); image.src = `data:image/webp;base64,${base64}`; await image.decode();
            return { width: image.naturalWidth, height: image.naturalHeight };
          }, bytes.toString('base64'));
          assert.deepEqual(dimensions, { width: entry.width, height: entry.height }, file);
          assert.deepEqual(dimensions, { width: Math.ceil(bounds.width) * 2, height: Math.ceil(bounds.height) * 2 }, file);
        }
      } finally { await page.close(); }
    }
  }
  if (write) {
    manifest.images = manifest.images.filter(image => !/^web-store(?:-en)?(?:-mobile)?\.webp$/.test(image.file)).concat(entries);
    manifest.description = 'Provenance for real application screenshots and explicitly labelled homepage store illustrations. Each entry identifies its source. Application crops retain the original UI and use disposable synthetic data. Store illustrations reuse the homepage sample products and native SVG drawings without contacting a database or API.';
    writeFileSync(`${assets}/sources.json`, JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log(write ? 'Four TR/EN store illustrations generated.' : 'Four store illustrations: source, dimensions, decoding and text fit OK.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  mkdirSync('artifacts/showcase', { recursive: true });
  const browser = await launchChromiumForSmoke(chromium);
  try { await checkShowcaseStoreImages(browser, { write: process.argv.includes('--write') }); }
  finally { await browser.close(); }
}

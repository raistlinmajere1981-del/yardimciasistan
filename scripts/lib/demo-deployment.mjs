import {cpSync, mkdirSync, readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {createHash} from 'node:crypto';
import {checkDemoTemplate} from '../sync-demo-template.mjs';

/** Extract a named input's value independent of HTML attribute order or CSS classes. */
export function readHtmlInputValue(html, inputId) {
  for (const tag of String(html).match(/<input\b[^>]*>/gi) ?? []) {
    const id = tag.match(/(?:^|\s)id\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (id !== inputId) continue;
    const value = tag.match(/(?:^|\s)value\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (value === undefined) return null;
    return value.replace(/&quot;|&#039;|&#39;|&lt;|&gt;|&amp;/g, match => ({
      '&quot;': '"', '&#039;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&'
    })[match]);
  }
  return null;
}

export const demoRoutes = ['hakkimizda','galeri','odalar','restoran','qr-menu','magaza','bayi','hesabim','yorumlar','iletisim','duyurular','kurulum','kullanim-kilavuzu','instagram','deneme','locales'];
export const retiredDemoPaths = [
  'demo', 'assets/product-guide', 'assets/showcase', 'assets/i18n',
  'assets/css/marketing.css','assets/css/portal.css','assets/css/showcase.css','assets/css/site.css','assets/css/storefront.css',
  ...['business-map','language','marketing','portal','qr-menu','rooms','showcase','site','storefront','tables'].map(name => `assets/js/${name}.js`),
  'assets/index-t2kNTUv0.js','assets/index-fcReLA3k.css','index.html'
];

/** Build an allowlisted deploy tree locally. Backend, credentials and downloads are never copied. */
export function stageDemoDeployment(source, target) {
  checkDemoTemplate(source);
  if (!readFileSync(join(source, 'assets/assistant/widget.js')).equals(readFileSync(join(source, 'deneme/assets/core/widget.js')))) {
    throw Error('Shared widget release differs from its source build; review and update the template release first');
  }
  mkdirSync(target, {recursive:true});
  const copy = path => cpSync(join(source, path), join(target, path), {recursive:true});
  for (const path of ['index.php','favicon.png','release.json', ...demoRoutes,
    'inc/.htaccess','inc/discovery.php','inc/upper-shell.php','inc/flag-language.php','inc/demo-installation.php','inc/retired-route.php',
    'assets/css/landing.css','assets/css/flag-language.css','assets/js/upper.js','assets/js/flag-language.js',
    'assets/assistant','assets/guide','assets/flags','assets/yardimci-asistan-symbol.png']) {
    mkdirSync(join(target, path, '..'), {recursive:true});
    copy(path);
  }
  const files = {};
  const visit = directory => {
    for (const entry of readdirSync(directory, {withFileTypes:true})) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error('Deploy symlinks are not supported');
      if (entry.isDirectory()) visit(path);
      else files[relative(target, path)] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
  };
  visit(target);
  return {files, cleanup: retiredDemoPaths, protected: ['yardimci-asistan/','downloads/','updates/']};
}

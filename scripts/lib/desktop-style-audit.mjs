import fs from 'node:fs';

const sharedNames = new Set(['.desktop-shell', '.content', '.sidebar', '.page-header', '.page-content', '.page-toolbar', '.page-toolbar__actions', '.panel', '.surface', '.empty-state', '.status-message', '.dialog', '.drawer', '.nav-item', '.page-header__title']);
const legacyImport = /(?:friendly[^/]*|[^/]+-ux|styles|setup-capabilities|segmented-control)\.css$/;

// Walk CSS blocks, preserving media/layer scope. Strings and comments do not open blocks.
export function cssRules(source) {
  const rules = [];
  const stack = [];
  let start = 0, quote = '', comment = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment) { if (c === '*' && next === '/') { comment = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && next === '*') { comment = true; i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') {
      const selector = source.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      stack.push({ selector, start, body: i + 1 }); start = i + 1;
    } else if (c === '}') {
      const block = stack.pop();
      if (block && !block.selector.startsWith('@')) rules.push({ selector: block.selector, body: source.slice(block.body, i), line: source.slice(0, block.start).split('\n').length, scope: stack.map(s => s.selector).join(' / ') });
      start = i + 1;
    } else if (c === ';' && stack.length === 0) start = i + 1;
  }
  return rules;
}

export function desktopStyleAudit(files) {
  const violations = [];
  const shared = new Map();
  const inventory = [];
  const add = (kind, file, detail, line = 1) => violations.push({ kind, file, line, detail });
  const cssFiles = files.filter(file => file.endsWith('.css'));
  const imported = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:@import\s+|import\s+)["']([^"']+\.css)["']/g)) {
      if (legacyImport.test(match[1])) add('legacyImport', file, match[1]);
      if (file.endsWith('/styles/index.css')) imported.add(match[1]);
    }
    if (!file.endsWith('.css')) continue;
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const isToken = /\/styles\/(tokens|themes)\//.test(file);
    const values = {
      file, lines: text.split('\n').length,
      rawColor: isToken ? 0 : [...clean.matchAll(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/gi)].length,
      rawPx: isToken ? 0 : [...clean.matchAll(/\b\d+(?:\.\d+)?px\b/g)].length,
      rawSpacing: isToken ? 0 : [...clean.matchAll(/(?:padding|margin|gap)(?:-[\w-]+)?\s*:[^;{}]*\dpx\b/g)].length,
      important: [...clean.matchAll(/!important\b/g)].length,
      override: [...clean.matchAll(/--override-[\w-]+/g)].length,
      oldAlias: [...clean.matchAll(/var\(--(?:ink(?:-muted)?|muted|text-muted|border|line(?:-soft)?|paper|surface(?:-elevated)?)\b/g)].length,
      duplicateSelectors: 0
    };
    for (const kind of ['rawColor','important','override','oldAlias']) if (values[kind]) add(kind, file, values[kind]);
    const seen = new Set();
    for (const rule of cssRules(clean)) {
      const selectors = rule.selector.split(/,(?![^()]*\))/).map(s => s.trim());
      for (const selector of selectors) {
        const key = `${rule.scope}:${selector}`;
        if (seen.has(key)) values.duplicateSelectors++;
        seen.add(key);
        if (!file.includes('/styles/layout/') && /^(?:\.desktop-shell|\.content|\.sidebar|\.page-header|\.page-content)(?:[.:#\s]|$)/.test(selector) && !file.endsWith('/components/navigation.css')) add('shellOutsideLayout', file, selector, rule.line);
        if (!file.includes('/styles/layout/') && file.endsWith('/components/navigation.css') && /^\.(?:desktop-shell|content|sidebar)(?:\.is-collapsed)?$/.test(selector)) add('shellOutsideLayout', file, selector, rule.line);
        if (/\/pages\/|\/components\/(?!navigation|header|notifications)/.test(file) && !file.includes('/styles/layout/') && /\.(?:sidebar(?:-[\w-]+)?|nav-item|topbar|page-header(?:__[\w-]+|-[\w-]+)?)(?![\w-])/.test(selector)) add('featureShellSelector', file, selector, rule.line);
        if (sharedNames.has(selector)) {
          const properties = [...rule.body.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map(match => match[1]);
          const previous = shared.get(key);
          const duplicated = previous && properties.filter(property => previous.properties.has(property));
          if (previous && (previous.file !== file || duplicated.length)) add('duplicateSharedPrimitive', file, `${selector} (${rule.scope || 'base'}); also ${previous.file}; ${duplicated.join(', ')}`, rule.line);
          shared.set(key, { file, properties: new Set([...(previous?.properties ?? []), ...properties]) });
        }
      }
    }
    inventory.push(values);
  }
  for (const file of cssFiles.filter(f => f.includes('/styles/') && !f.endsWith('/index.css'))) {
    const relative = './' + file.split('/styles/')[1];
    if (!imported.has(relative)) add('orphanStylesheet', file, relative);
  }
  return { totals: Object.fromEntries(['rawColor','rawPx','rawSpacing','important','override','oldAlias','duplicateSelectors'].map(k => [k, inventory.reduce((n,f) => n + f[k],0)])), inventory, violations };
}

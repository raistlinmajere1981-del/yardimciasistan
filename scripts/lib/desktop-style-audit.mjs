import fs from 'node:fs';

const sharedNames = new Set(['.desktop-shell', '.content', '.sidebar', '.page-header', '.page-content', '.page-toolbar', '.page-toolbar__actions', '.panel', '.surface', '.empty-state', '.status-message', '.dialog', '.drawer', '.nav-item', '.page-header__title', '.card', '.card__header', '.card__actions', '.data-records', '.data-list', '.list-row', '.list-row__actions', '.form-grid', '.form-row', '.form-field', '.record-workspace']);
const legacyImport = /(?:friendly[^/]*|[^/]+-ux|styles|setup-capabilities|segmented-control)\.css$/;
const intentionalRenderer = /\/styles\/pages\/menu-preview\.css$/;
const sharedVisualSelector = /\.(?:action-button(?:-[\w-]+)?|status-badge|status-chip|interactive-surface(?:--[\w-]+)?|list-row(?:--[\w-]+)?|resource-card(?:__[\w-]+)?|choice-chips|data-records)(?![\w-])/;
const sharedVisualProperty = /\b(?:background(?:-color)?|border(?:-(?:color|top-color|right-color|bottom-color|left-color|inline-color|block-color))?|color|box-shadow|opacity)\s*:/g;
const outlineSuppression = /\boutline\s*:\s*(?:none|0)(?:\s*;|\s*$)/i;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHasConditions(selector) {
  return selector.replace(/:has\([^)]*\)/g, '');
}

function delegatesVisibleFocus(selector, source) {
  const owner = selector.match(/^\s*(\.[\w-]+)\s+/)?.[1];
  if (!owner) return false;
  return new RegExp(
    escapeRegex(owner) + ':focus-within\\s*\\{[^}]*\\b(?:outline|box-shadow|border-color)\\s*:',
    'm'
  ).test(source);
}

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
    const isToken = /\/styles\/(tokens|appearance)\//.test(file);
    const rawColor = isToken ? 0 : [...clean.matchAll(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/gi)].length;
    const rawPx = isToken ? 0 : [...clean.matchAll(/\b\d+(?:\.\d+)?px\b/g)].length;
    const rawSpacing = isToken ? 0 : [...clean.matchAll(/(?:padding|margin|gap)(?:-[\w-]+)?\s*:[^;{}]*\dpx\b/g)].length;
    const values = {
      file, lines: text.split('\n').length,
      rawColor,
      intentionalRendererRawColor: intentionalRenderer.test(file) ? rawColor : 0,
      rawPx,
      geometryPx: Math.max(0, rawPx - rawSpacing),
      rawSpacing,
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
        if (/\[data-(?:theme|mode)(?:[=\]])/i.test(selector)) add('legacyAppearanceSelector', file, selector, rule.line);
        if (file.includes('/styles/pages/')) {
          const visualTarget = stripHasConditions(selector);
          const visualProperties = [...rule.body.matchAll(sharedVisualProperty)].map(match => match[0].split(':')[0].trim());
          if (sharedVisualSelector.test(visualTarget) && visualProperties.length) {
            add('pageOwnsSharedVisualState', file, selector + ': ' + [...new Set(visualProperties)].join(', '), rule.line);
          }
          if (
            !file.endsWith('/styles/pages/lock.css')
            && outlineSuppression.test(rule.body)
            && !delegatesVisibleFocus(selector, clean)
          ) {
            add('unsafeOutlineSuppression', file, selector, rule.line);
          }
        }
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
  const totals = Object.fromEntries(['rawColor', 'intentionalRendererRawColor', 'rawPx', 'geometryPx', 'rawSpacing', 'important', 'override', 'oldAlias', 'duplicateSelectors'].map(k => [k, inventory.reduce((n, f) => n + f[k], 0)]));
  totals.normalDomRawColor = totals.rawColor - totals.intentionalRendererRawColor;
  const violationTotals = Object.fromEntries([...new Set(violations.map((issue) => issue.kind))].sort().map((kind) => [kind, violations.filter((issue) => issue.kind === kind).length]));
  return { totals, violationTotals, inventory, violations };
}

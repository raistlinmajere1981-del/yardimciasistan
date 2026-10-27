/** Shared, immutable adapter for theme, widget and future account/cart consumers. */
export function createLanguage(context) {
  const {code, locale, direction, messages, available} = context;
  return Object.freeze({
    version: 1, code, locale, direction, available: Object.freeze([...available]),
    text(key, values = {}) {
      return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), messages[key] || '');
    },
    number(value, options) { return new Intl.NumberFormat(locale, options).format(value); },
    currency(value, currency, options) { return new Intl.NumberFormat(locale, {...options, style:'currency', currency}).format(value); },
    date(value, options) { return new Intl.DateTimeFormat(locale, options).format(value instanceof Date ? value : new Date(value)); },
    // Pass this alongside operation payloads; the API retains all business/session authority.
    requestContext: Object.freeze({version:1, language:code, locale, direction}),
  });
}

/** Progressive Intl formatting also works on hosts without PHP intl. */
export function formatLanguageElements(language, root = document) {
  for (const node of root.querySelectorAll('[data-format-number], [data-format-currency], [data-format-date]')) {
    try {
      let formatted;
      if (node.hasAttribute('data-format-date')) formatted = language.date(node.dataset.formatDate, node.hasAttribute('data-format-date-time') ? {dateStyle:'medium', timeStyle:'short'} : undefined);
      else {
        const value = Number(node.dataset.formatNumber ?? node.dataset.formatCurrency);
        if (!Number.isFinite(value)) continue;
        formatted = node.hasAttribute('data-format-currency') ? language.currency(value, node.dataset.currency) : language.number(value);
      }
      node.textContent = node.dataset.formatKey ? language.text(node.dataset.formatKey, {[node.dataset.formatValue]:formatted}) : formatted;
    } catch { /* Preserve server-rendered source on invalid data or unavailable Intl support. */ }
  }
}

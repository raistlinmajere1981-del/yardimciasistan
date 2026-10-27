/** Adapt existing account/cart/widget consumers to the hash-validated server catalog. */
(() => {
  const context = JSON.parse(document.getElementById('site-context').textContent);
  const {code, locale, messages} = context.language;
  const ui = (source, values = {}) => (messages[context.sourceKeys[source]] || source)
    .replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  const html = (source, values = {}) => ui(source, values).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const localize = (data, publication) => {
    const meta = data?.localization;
    if (!meta || meta.version !== 1 || meta.source_language !== 'tr' || !meta.target_languages?.includes(code)) return data;
    const record = (kind, row, id, fields) => {
      const result = {...row}, translations = meta.translations?.[kind]?.[id]?.[code] || {};
      for (const field of fields) if (typeof translations[field] === 'string' && translations[field].trim()) result[field] = translations[field];
      return result;
    };
    const result = {...data};
    if (publication === 'online_catalog') {
      result.products = (data.products || []).map(row => record('catalog_product', row, row.product_id, ['name','description']));
      result.categories = (data.categories || []).map(row => record('catalog_category', row, row.id, ['name']));
    }
    return result;
  };
  window.DemoLanguage = Object.freeze({ui, html, locale, localize});
})();

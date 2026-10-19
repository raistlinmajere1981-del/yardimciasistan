/* Demo-owned data selection. No HTML injection or shared translation framework. */
(() => {
  const language = document.documentElement.lang === 'en' ? 'en' : 'tr';
  const english = window.DemoEnglish || {};
  const locale = language === 'en' ? 'en-GB' : 'tr-TR';
  const ui = (source, values = {}) => (language === 'en' ? english[source] || source : source)
    .replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  const html = (source, values = {}) => ui(source, values).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const localize = (data, publication) => {
    if (!data || !data.localization?.target_languages?.includes(language)) return data;
    const metadata = data.localization.translations || {};
    const record = (kind, row, id, fields) => {
      const result = {...row}, translations = metadata[kind]?.[id]?.[language] || {};
      for (const field of fields) if (typeof translations[field] === 'string' && translations[field]) result[field] = translations[field];
      return result;
    };
    const result = {...data};
    if (publication === 'room_catalog') result.rooms = (data.rooms || []).map(r => record('room',r,r.id,['name','description','bed_info','price_note']));
    if (publication === 'table_catalog') result.tables = (data.tables || []).map(r => record('table',r,r.id,['name','description','area']));
    if (publication === 'menu') {
      result.categories = (data.categories || []).map(r => record('menu_category',r,r.id,['name','description']));
      result.items = (data.items || []).map(r => record('menu_product',r,r.id,['name','description']));
    }
    if (publication === 'online_catalog') {
      result.products = (data.products || []).map(r => record('catalog_product',r,r.product_id,['name','description']));
      result.categories = (data.categories || []).map(r => record('catalog_category',r,r.id,['name']));
    }
    if (publication === 'marketing_website') result.publications = (data.publications || []).map(r => record('marketing',r,r.id,['title','text']));
    if (publication === 'business_context' && data.business) {
      const id = Object.keys(metadata.business || {})[0];
      result.business = record('business',data.business,id,['description','about_text','directions_note','policy_note','payment_note']);
      result.business.gallery = (data.business.gallery || []).map(r => record('gallery',r,r.id,['title']));
    }
    return result;
  };
  window.DemoLanguage = {localize,ui,html,locale};
})();

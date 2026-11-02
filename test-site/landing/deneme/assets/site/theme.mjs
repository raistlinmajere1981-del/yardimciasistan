// Demo-local presentation only. No publication mutations or independent content cache.
export function mount(_site) {
  const tabs = [...document.querySelectorAll('[data-lab-tab]')];
  const panels = [...document.querySelectorAll('[data-lab-panel]')];
  if (tabs.length) {
    function activate(which, focus = false) {
      tabs.forEach(tab => {
        const selected = tab.dataset.labTab === which;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focus) tab.focus();
      });
      panels.forEach(panel => { panel.hidden = panel.dataset.labPanel !== which; });
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab.dataset.labTab));
      tab.addEventListener('keydown', event => {
        const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!direction && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + direction + tabs.length) % tabs.length;
        activate(tabs[next].dataset.labTab, true);
      });
    });
    activate('live');
  }

  // The optional visitor lens is query-scoped, not a persisted account setting.
  // Preserve it across ordinary public content links; never touch actions or external URLs.
  const params = new URLSearchParams(location.search);
  if (params.get('view') !== 'visitor') return;
  const allowed = new Set(['home','about','rooms','restaurant','menu','catalog','gallery','announcements','reviews','contact','account']);
  document.querySelectorAll('a[href]').forEach(anchor => {
    if (anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || url.pathname !== '/deneme/') return;
    const page = url.searchParams.get('page') || 'home';
    if (!allowed.has(page) || url.searchParams.has('action')) return;
    url.searchParams.set('view','visitor');
    anchor.href = url.pathname + url.search + url.hash;
  });
}

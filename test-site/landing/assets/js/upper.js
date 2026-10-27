// Presentation navigation only. Business operations belong to /deneme/.
document.documentElement.classList.add('js-enabled');
(() => {
  const button = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-site-nav]');
  const close = () => {
    nav?.classList.remove('is-open');
    button?.setAttribute('aria-expanded', 'false');
  };
  button?.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (button?.getAttribute('aria-expanded') === 'true') { close(); button.focus(); }
  });
})();

// Read-only discovery. Membership is a build projection of the shared capability graph.
(() => {
  const filters = document.querySelector('[data-sector-filters]');
  const tree = document.querySelector('[data-capability-tree]');
  if (!filters || !tree) return;
  const cards = [...tree.querySelectorAll('[data-capability]')].map(card => ({ card, levels: JSON.parse(card.dataset.levels) }));
  const counter = document.querySelector('[data-tree-count]');
  const selector = document.querySelector('[data-explanation-selector]');
  const hint = document.querySelector('[data-explanation-hint]');
  function updateLinks(sector, mode) {
    for (const link of [...filters.querySelectorAll('a'), ...selector.querySelectorAll('a')]) {
      const url = new URL(link.href);
      url.searchParams.set('sector', link.dataset.sector || sector);
      url.searchParams.set('explanation', link.dataset.explanation || mode);
      link.href = url;
    }
  }
  function explain(requested) {
    const mode = requested === 'detailed' ? 'detailed' : 'simple';
    tree.dataset.explanationMode = mode;
    for (const { card } of cards) card.open = mode === 'detailed';
    for (const link of selector.querySelectorAll('a')) {
      if (link.dataset.explanation === mode) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    hint.textContent = hint.dataset[`${mode}Hint`];
    updateLinks(filters.querySelector('[aria-current]').dataset.sector, mode);
  }
  selector.addEventListener('click', event => {
    const link = event.target.closest('a[data-explanation]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    explain(link.dataset.explanation);
    history.pushState({}, '', link.href);
  });
  function select(sector) {
    if (!filters.querySelector(`[data-sector="${sector}"]`)) return;
    let count = 0;
    for (const { card, levels } of cards) {
      const level = levels[sector];
      card.hidden = !level;
      if (level) {
        count++;
      }
    }
    for (const link of filters.querySelectorAll('a')) {
      if (link.dataset.sector === sector) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    for (const level of tree.querySelectorAll('[data-tree-group]')) {
      level.hidden = !level.querySelector('[data-capability]:not([hidden])');
    }
    for (const link of tree.querySelectorAll('.dependency-link')) link.hidden = Boolean(document.getElementById(link.hash.slice(1))?.hidden);
    for (const label of tree.querySelectorAll('[data-dependency]')) label.hidden = !document.getElementById(`cap-${label.dataset.dependency}`)?.hidden;
    updateLinks(sector, tree.dataset.explanationMode);
    counter.textContent = counter.dataset.countTemplate.replace('{count}', String(count));
  }
  filters.addEventListener('click', event => {
    const link = event.target.closest('a[data-sector]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    select(link.dataset.sector);
    const url = new URL(location.href);
    url.searchParams.set('sector', link.dataset.sector);
    history.pushState({}, '', url);
  });
  window.addEventListener('popstate', () => {
    const params = new URL(location.href).searchParams;
    const sector = params.get('sector');
    select(filters.querySelector(`[data-sector="${CSS.escape(sector || '')}"]`) ? sector : 'pension_restaurant');
    const mode = params.get('explanation') === 'detailed' ? 'detailed' : 'simple';
    if (tree.dataset.explanationMode !== mode) explain(mode);
  });
  tree.addEventListener('click', event => {
    const link = event.target.closest('.dependency-link');
    if (!link) return;
    const target = document.getElementById(link.hash.slice(1));
    if (target) {
      target.open = true;
      target.querySelector('summary').focus({ preventScroll: true });
    }
  });
  const active = filters.querySelector('[aria-current]');
  if (active) select(active.dataset.sector);
})();

(() => {
  const search = document.querySelector('#guide-search');
  if (!search) return;
  const topics = [...document.querySelectorAll('[data-guide-topic]')];
  const counter = document.querySelector('[data-guide-count]');
  const empty = document.querySelector('[data-guide-empty]');
  const reset = document.querySelector('[data-guide-reset]');
  const normalize = value => value.toLocaleLowerCase(document.documentElement.lang).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  const texts = topics.map(topic => normalize(topic.textContent));
  function filter() {
    const words = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    let count = 0;
    topics.forEach((topic, index) => {
      const matches = words.every(word => texts[index].includes(word));
      topic.hidden = !matches;
      if (matches) count++;
    });
    counter.textContent = counter.dataset.countTemplate.replace('{count}', String(count));
    empty.hidden = count !== 0;
    reset.hidden = !search.value;
  }
  document.querySelector('[data-guide-search]').hidden = false;
  search.addEventListener('input', filter);
  reset.addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  document.querySelectorAll('[data-guide-link]').forEach(link => link.addEventListener('click', () => {
    search.value = ''; filter();
    const topic = document.getElementById(link.dataset.guideLink);
    topic.tabIndex = -1;
    topic.focus({ preventScroll: true });
  }));
  filter();
})();

(() => {
  const dialog = document.querySelector('[data-image-dialog]');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  let trigger;
  const picture = dialog.querySelector('img');
  document.querySelectorAll('[data-guide-image]').forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    trigger = link;
    picture.src = link.href;
    picture.alt = link.querySelector('img').alt;
    dialog.querySelector('h2').textContent = link.dataset.imageTitle;
    dialog.showModal();
  }));
  dialog.querySelector('[data-image-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  // The close button is the only focusable control in this image viewer.
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') { event.preventDefault(); dialog.querySelector('[data-image-close]').focus(); }
  });
  dialog.addEventListener('close', () => trigger?.focus());
})();


(() => {
  const selector = document.querySelector('[data-connection-selector]');
  if (!selector) return;
  const diagram = document.querySelector('.ecosystem');
  selector.hidden = false;
  selector.addEventListener('click', event => {
    const button = event.target.closest('[data-connection]');
    if (!button) return;
    const connection = button.getAttribute('aria-pressed') === 'true' ? '' : button.dataset.connection;
    for (const mode of selector.querySelectorAll('button')) mode.setAttribute('aria-pressed', String(mode.dataset.connection === connection));
    diagram.dataset.connection = connection;
    for (const note of document.querySelectorAll('[data-connection-note]')) note.classList.toggle('is-highlighted', note.dataset.connectionNote === connection);
    for (const device of diagram.querySelectorAll('[data-device-path]')) device.classList.toggle('is-highlighted', device.dataset.devicePath === connection);
  });
})();

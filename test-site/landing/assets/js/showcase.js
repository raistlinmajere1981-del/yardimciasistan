/* Demo-owned gallery and profile exploration. No application or publication state. */
(() => {
  const { ui } = window.DemoLanguage;
  const profileButtons = [...document.querySelectorAll('[data-profile]')];
  const profileDetails = document.getElementById('profile-details');
  let activeProfile = null;
  function closeProfile() {
    if (!profileDetails) return;
    profileDetails.hidden = true;
    profileButtons.forEach(button => button.setAttribute('aria-expanded', 'false'));
    activeProfile?.focus({ preventScroll: true });
    activeProfile = null;
  }
  profileButtons.forEach(button => button.addEventListener('click', () => {
    if (!profileDetails) return;
    if (activeProfile === button) { closeProfile(); return; }
    activeProfile = button;
    profileButtons.forEach(item => item.setAttribute('aria-expanded', String(item === button)));
    document.querySelectorAll('[data-profile-panel]').forEach(panel => { panel.hidden = panel.dataset.profilePanel !== button.dataset.profile; });
    profileDetails.hidden = false;
    profileDetails.focus({ preventScroll: true });
    profileDetails.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }));
  document.querySelector('[data-profile-close]')?.addEventListener('click', closeProfile);
  const filters = [...document.querySelectorAll('[data-feature-filter]')];
  const features = [...document.querySelectorAll('[data-feature-group]')];
  const mobileFeatures = matchMedia('(max-width: 540px)');
  // Only the single-column view starts with a balanced editorial selection.
  // An explicit category or "all" choice survives viewport changes.
  let selectedFilter = null;
  function renderFeatures() {
    const selected = selectedFilter ?? (mobileFeatures.matches ? 'featured' : 'all');
    const filter = selected === 'featured' && !mobileFeatures.matches ? 'all' : selected;
    filters.forEach(button => {
      button.hidden = button.dataset.featureFilter === 'featured' && !mobileFeatures.matches;
      button.setAttribute('aria-pressed', String(button.dataset.featureFilter === filter));
    });
    features.forEach(card => {
      card.hidden = filter === 'featured' ? card.dataset.featured !== 'true' : filter !== 'all' && card.dataset.featureGroup !== filter;
    });
  }
  filters.forEach(button => button.addEventListener('click', () => {
    selectedFilter = button.dataset.featureFilter;
    renderFeatures();
  }));
  mobileFeatures.addEventListener('change', renderFeatures);
  renderFeatures();

  const anchors = [...document.querySelectorAll('a[data-gallery-image]')];
  if (!anchors.length) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'showcase-gallery';
  dialog.setAttribute('aria-labelledby', 'showcase-gallery-title');
  dialog.innerHTML = '<div class="showcase-gallery-header"><h2 id="showcase-gallery-title"></h2><button type="button" data-showcase-close>×</button></div><div class="showcase-gallery-media"><img alt=""></div><div class="showcase-gallery-footer"><p data-showcase-caption></p><div class="showcase-gallery-controls"><button type="button" data-showcase-previous>←</button><span data-showcase-counter></span><button type="button" data-showcase-next>→</button></div></div>';
  const title = dialog.querySelector('h2'), image = dialog.querySelector('img');
  const close = dialog.querySelector('[data-showcase-close]');
  const previous = dialog.querySelector('[data-showcase-previous]'), next = dialog.querySelector('[data-showcase-next]');
  close.ariaLabel = ui('Görseli kapat'); previous.ariaLabel = ui('Önceki görsel'); next.ariaLabel = ui('Sonraki görsel');
  document.body.append(dialog);
  let items = [], index = 0, opener = null, overflow = '';
  function render() {
    const anchor = items[index];
    image.src = anchor.hasAttribute('data-gallery-responsive') ? (anchor.querySelector('img').currentSrc || anchor.href) : anchor.href;
    image.alt = anchor.dataset.galleryTitle || anchor.querySelector('img')?.alt || '';
    title.textContent = image.alt;
    dialog.querySelector('[data-showcase-caption]').textContent = anchor.dataset.galleryCaption || ui('Gerçek uygulama ekranı · örnek veriler');
    dialog.querySelector('[data-showcase-counter]').textContent = `${index + 1} / ${items.length}`;
    previous.disabled = next.disabled = items.length < 2;
  }
  const advance = direction => { index = (index + direction + items.length) % items.length; render(); };
  anchors.forEach(anchor => anchor.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const source = new URL(anchor.href);
    if (source.origin !== location.origin || !source.pathname.startsWith('/assets/showcase/')) return;
    event.preventDefault();
    const scope = anchor.closest('[data-profile-panel], .feature-grid, .hero-workspace, .web-story, .guide-content') || document;
    items = [...scope.querySelectorAll('a[data-gallery-image]')].filter(item => item.getClientRects().length > 0);
    index = items.indexOf(anchor);
    if (index < 0) return;
    opener = anchor;
    render();
    overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    close.focus();
  }));
  close.addEventListener('click', () => dialog.close());
  previous.addEventListener('click', () => advance(-1)); next.addEventListener('click', () => advance(1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); advance(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  let backdrop = false;
  dialog.addEventListener('pointerdown', event => { backdrop = event.target === dialog; });
  dialog.addEventListener('pointerup', event => { if (backdrop && event.target === dialog) dialog.close(); backdrop = false; });
  dialog.addEventListener('close', () => {
    image.removeAttribute('src'); image.alt = ''; items = [];
    document.body.style.overflow = overflow;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
})();

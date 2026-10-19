(() => {
  const { ui } = window.DemoLanguage;
  const script = document.currentScript;
  const base = new URL(script.dataset.apiBase || '/yardimci-asistan/', window.location.origin);
  const surfaces = document.querySelectorAll('[data-marketing-surface]');
  if (!surfaces.length) return;
  fetch(new URL('api/marketing.php', base), { credentials: 'omit', cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error('unavailable'); return response.json(); })
    .then(source => {
      const data = window.DemoLanguage?.localize(source, "marketing_website") ?? source;
      for (const surface of surfaces) {
        surface.replaceChildren();
        let items = data.ok && Array.isArray(data.publications) ? data.publications.filter(item => item.published && item.placement === 'homepage_feature') : [];
        const wrapper = surface.closest('[data-marketing-wrapper]');
        if (wrapper) wrapper.hidden = !items.length;
        const empty = surface.parentElement.querySelector('[data-marketing-empty]');
        if (empty) empty.hidden = items.length > 0;
        const limit = Number(surface.dataset.marketingLimit);
        if (Number.isInteger(limit) && limit > 0) items = items.slice(0, Math.min(limit, 20));
        if (!items.length) { surface.hidden = true; continue; }
        const heading = document.createElement('h2'); heading.textContent = ui("Duyurular / Kampanyalar"); if (surface.dataset.marketingHeading !== 'false') surface.append(heading);
        const grid = document.createElement('div'); grid.className = 'ya-marketing-grid';
        for (const item of items) {
          const card = document.createElement('article'); card.className = 'ya-marketing-card';
          const title = document.createElement('h3'); title.textContent = item.title; card.append(title);
          const text = document.createElement('p'); text.className = 'ya-marketing-text'; text.textContent = item.text; card.append(text);
          if (item.images.length) {
            const gallery = document.createElement('div'); gallery.className = 'ya-marketing-gallery'; gallery.setAttribute('aria-label', ui("{0} görselleri", {0: item.title}));
            for (const media of item.images) {
              const url = new URL(media.url, base);
              if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}media/marketing/`)) continue;
              const image = document.createElement('img'); image.src = url.href; image.alt = media.altText || ''; image.loading = 'lazy';
              image.width = media.width; image.height = media.height; gallery.append(image);
            }
            card.append(gallery);
          }
          grid.append(card);
        }
        surface.append(grid); surface.hidden = false;
      }
    }).catch(() => { for (const surface of surfaces) surface.hidden = true; });
})();

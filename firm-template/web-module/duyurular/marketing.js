(() => {
  const script = document.currentScript;
  const base = new URL('../', script.src);
  const surfaces = document.querySelectorAll('[data-marketing-surface]');
  if (!surfaces.length) return;
  fetch(new URL('api/marketing.php', base), { credentials: 'omit', cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error('unavailable'); return response.json(); })
    .then(data => {
      for (const surface of surfaces) {
        surface.replaceChildren();
        const items = data.ok && Array.isArray(data.publications) ? data.publications.filter(item => item.published && item.placement === 'homepage_feature') : [];
        if (!items.length) { surface.hidden = true; continue; }
        const heading = document.createElement('h2'); heading.textContent = 'Duyurular / Kampanyalar'; surface.append(heading);
        const grid = document.createElement('div'); grid.className = 'ya-marketing-grid';
        for (const item of items) {
          const card = document.createElement('article'); card.className = 'ya-marketing-card';
          const title = document.createElement('h3'); title.textContent = item.title; card.append(title);
          const text = document.createElement('p'); text.className = 'ya-marketing-text'; text.textContent = item.text; card.append(text);
          if (item.images.length) {
            const gallery = document.createElement('div'); gallery.className = 'ya-marketing-gallery'; gallery.setAttribute('aria-label', `${item.title} görselleri`);
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

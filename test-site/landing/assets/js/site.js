(() => {
  const menuButton = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("[data-site-nav]");

  const setMenuOpen = (open) => {
    if (!menuButton || !nav) return;
    nav.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
  };

  menuButton?.addEventListener("click", () => {
    setMenuOpen(!(nav?.classList.contains("is-open") ?? false));
  });

  nav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuOpen(false);
  });

  document.querySelectorAll('[data-copy-target]').forEach(button => {
    button.addEventListener('click', async () => {
      const field = document.getElementById(button.dataset.copyTarget);
      const status = document.querySelector('[data-copy-status]');
      if (!field?.value) return;
      try { await navigator.clipboard.writeText(field.value); if (status) status.textContent = 'Kopyalandı.'; }
      catch { field.focus(); field.select(); if (status) status.textContent = 'Seçilen bilgiyi kopyalayabilirsiniz.'; }
    });
  });

  const businessFeatureCatalog = {
    wifi: ["Wi-Fi", "⌁"],
    parking: ["Otopark", "P"],
    pet_friendly: ["Evcil hayvan kabul edilir", "♡"],
    family_friendly: ["Çocuklu ailelere uygun", "⌂"],
    wheelchair_access: ["Tekerlekli sandalye erişimine uygun", "♿"],
    step_free_access: ["Basamaksız erişim", "↔"],
    garden: ["Bahçe", "♧"],
    terrace: ["Teras", "▱"],
    luggage_storage: ["Bagaj emaneti", "▣"],
    airport_transfer: ["Havalimanı transferi", "↗"]
  };

  const renderBusinessFeatures = (featureIds) => {
    const root = document.querySelector("[data-business-features]");
    if (!root) return;
    root.replaceChildren();
    const ids = [...new Set(featureIds.map((value) => String(value || "").trim()))]
      .filter((id) => businessFeatureCatalog[id]);
    if (!ids.length) {
      root.innerHTML = '<div class="room-catalog-empty">İşletme olanakları henüz yayınlanmadı.</div>';
      return;
    }
    for (const id of ids) {
      const [label, symbol] = businessFeatureCatalog[id];
      const item = document.createElement("div");
      item.className = "amenity-item";
      item.dataset.pensionAmenity = id;
      item.innerHTML = `<span class="amenity-icon" aria-hidden="true">${symbol}</span><span></span>`;
      item.lastElementChild.textContent = label;
      root.append(item);
    }
  };

  const socialPlatformCatalog = {
    facebook: {
      label: "Facebook",
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4.5c-.5-.1-1.7-.2-3.2-.2-3.1 0-5.2 1.9-5.2 5.4V12H5v4h3.6v8h4.4v-8h3.4l.6-4H13V10c0-1.2.3-2 1-2z"/></svg>'
    },
    instagram: {
      label: "Instagram",
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.2A4.8 4.8 0 1 1 7.2 12 4.8 4.8 0 0 1 12 7.2zm0 2A2.8 2.8 0 1 0 14.8 12 2.8 2.8 0 0 0 12 9.2zM17.4 6a1.1 1.1 0 1 1-1.1 1.1A1.1 1.1 0 0 1 17.4 6z"/></svg>'
    },
    youtube: {
      label: "YouTube",
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5A3.5 3.5 0 0 1 8 3h8a3.5 3.5 0 0 1 3.5 3.5v11A3.5 3.5 0 0 1 16 21H8a3.5 3.5 0 0 1-3.5-3.5v-11zM10 8.5v7l5.5-3.5L10 8.5z"/></svg>'
    },
    tiktok: {
      label: "TikTok",
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h3a5 5 0 0 0 4 4v3a8 8 0 0 1-4-1.1V15a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V3z"/></svg>'
    },
    x: {
      label: "X",
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h3.4l4.1 5.5L17.2 4H21l-6.7 7.8L20.5 20h-3.4l-4.5-6-5.1 6H3.7l7.1-8.3L5 4z"/></svg>'
    }
  };

  const renderBusinessSocialLinks = (links) => {
    const normalized = [];
    const seen = new Set();
    for (const item of Array.isArray(links) ? links : []) {
      const platform = String(item?.platform || "").trim().toLowerCase();
      const url = String(item?.url || "").trim();
      if (!socialPlatformCatalog[platform] || !/^https?:\/\//i.test(url) || seen.has(platform)) continue;
      seen.add(platform);
      normalized.push({ platform, url });
    }

    document.querySelectorAll("[data-business-social-links]").forEach((root) => {
      root.replaceChildren();
      for (const link of normalized) {
        const definition = socialPlatformCatalog[link.platform];
        const anchor = document.createElement("a");
        anchor.href = link.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.ariaLabel = definition.label;
        anchor.title = definition.label;
        anchor.innerHTML = definition.svg;
        root.append(anchor);
      }
      root.hidden = normalized.length === 0;
    });
  };

  const hydrateStructuredData = ({ phone, address, latitude, longitude }) => {
    const node = document.querySelector('script[data-business-structured-data][type="application/ld+json"]');
    if (!node) return;
    let payload = null;
    try {
      payload = JSON.parse(node.textContent || "");
    } catch {
      return;
    }
    if (!payload || typeof payload !== "object") return;
    let changed = false;
    const normalizedPhone = String(phone || "").trim();
    if (normalizedPhone) {
      payload.telephone = normalizedPhone.replace(/\s+/g, "");
      changed = true;
    }
    const normalizedAddress = String(address || "").trim();
    if (normalizedAddress) {
      if (payload.address && typeof payload.address === "object") {
        payload.address.streetAddress = normalizedAddress;
      } else {
        payload.address = { "@type": "PostalAddress", streetAddress: normalizedAddress };
      }
      changed = true;
    }
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      if (payload.geo && typeof payload.geo === "object") {
        payload.geo.latitude = latitude;
        payload.geo.longitude = longitude;
      } else {
        payload.geo = { "@type": "GeoCoordinates", latitude, longitude };
      }
      changed = true;
    }
    if (changed) node.textContent = JSON.stringify(payload);
  };

  const hydratePublicSurfaces = async () => {
    try {
      const response = await fetch("/yardimci-asistan/api/business.php", { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const data = await response.json();
      const surfaces = new Set(Array.isArray(data?.business?.public_surfaces) ? data.business.public_surfaces : []);
      document.querySelectorAll("[data-ya-surface]").forEach((node) => {
        const surface = node.getAttribute("data-ya-surface");
        node.hidden = !surface || !surfaces.has(surface);
      });

      const business = data?.business || {};
      const businessName = String(business.display_name || business.business_name || business.name || "").trim();
      if (businessName) {
        document.querySelectorAll("[data-business-name]").forEach((node) => {
          node.textContent = businessName;
        });
      }
      const whatsappEnabled = business.whatsapp_enabled === true;
      document.querySelectorAll('[data-ya-service="whatsapp"]').forEach((node) => {
        node.hidden = !whatsappEnabled;
      });

      const phone = String(business.phone || "").trim();
      if (phone) {
        document.querySelectorAll("[data-business-phone]").forEach((node) => {
          node.textContent = phone;
          if (node instanceof HTMLAnchorElement) node.href = "tel:" + phone.replace(/\s+/g, "");
        });
      }

      const address = String(business.address || "").trim();
      if (address) {
        document.querySelectorAll("[data-business-address]").forEach((node) => {
          node.textContent = address;
        });
        document.querySelectorAll("[data-business-directions-button]").forEach((node) => {
          node.setAttribute("data-ya-address", address);
        });
      }

      const directionsNote = String(business.directions_note || "").trim();
      if (directionsNote) {
        document.querySelectorAll("[data-business-directions-note]").forEach((node) => {
          node.textContent = directionsNote;
        });
      }

      const latitudeRaw = business.latitude;
      const longitudeRaw = business.longitude;
      const latitude = latitudeRaw === null || latitudeRaw === undefined || latitudeRaw === "" ? Number.NaN : Number(latitudeRaw);
      const longitude = longitudeRaw === null || longitudeRaw === undefined || longitudeRaw === "" ? Number.NaN : Number(longitudeRaw);
      window.YardimciBusinessMap?.render(business);

      renderBusinessFeatures(Array.isArray(business.feature_ids) ? business.feature_ids : []);
      renderBusinessSocialLinks(business.social_links);
      hydrateStructuredData({ phone, address, latitude, longitude });

      const googleReviewsEnabled = business.google_reviews_enabled === true;
      document.querySelectorAll("[data-google-reviews-link]").forEach((node) => {
        node.hidden = !googleReviewsEnabled;
      });
    } catch {
      // Yardımcı Asistan kurulmadan önce dinamik yüzeyler gizli kalır.
    }
  };
  hydratePublicSurfaces();

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const renderGoogleReviews = async () => {
    const roots = document.querySelectorAll("[data-google-reviews]");
    const summary = document.querySelector("[data-google-review-summary]");
    if (!roots.length && !summary) return;

    let payload = null;
    try {
      const response = await fetch("/yardimci-asistan/api/google-reviews.php", {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      payload = await response.json().catch(() => null);
      if (!response.ok) payload = null;
    } catch {
      payload = null;
    }

    if (!payload?.available) {
      roots.forEach((root) => { root.hidden = true; });
      if (summary) summary.hidden = true;
      return;
    }

    roots.forEach((root) => { root.hidden = false; });

    const ratingValue = Number(payload.rating || 0);
    const ratingText = ratingValue > 0 ? ratingValue.toFixed(1) : "—";
    const count = Number(payload.user_rating_count || 0);

    if (summary) {
      const score = summary.querySelector("[data-google-summary-score]");
      const summaryCount = summary.querySelector("[data-google-summary-count]");
      if (score) score.textContent = `${ratingText} ★`;
      if (summaryCount) summaryCount.textContent = `${count} Google Maps değerlendirmesi`;
      summary.hidden = false;
    }

    roots.forEach((root) => {
      const rating = root.querySelector("[data-google-rating]");
      const list = root.querySelector("[data-google-review-list]");
      const mapsLink = root.querySelector("[data-google-maps-link]");
      const limit = Math.max(1, Number(root.dataset.reviewLimit || 5));

      if (rating) {
        rating.innerHTML = `<strong>Google Maps ${escapeHtml(ratingText)} ★</strong><span>${escapeHtml(count)} değerlendirme</span>`;
      }

      const reviews = Array.isArray(payload.reviews) ? payload.reviews.slice(0, limit) : [];
      if (list) {
        if (!reviews.length) {
          list.innerHTML = '<div class="review-unavailable"><strong>Google Maps puanı bağlı.</strong><span>Gösterilebilecek yorum metni bulunamadı.</span></div>';
        } else {
          list.innerHTML = reviews.map((review) => {
            const stars = "★".repeat(Math.max(0, Math.min(5, Number(review.rating || 0))));
            const authorName = escapeHtml(review.author || "Google Maps kullanıcısı");
            const authorPhoto = review.author_photo_uri
              ? `<img src="${escapeHtml(review.author_photo_uri)}" alt="" loading="lazy">`
              : "";
            const author = review.author_uri
              ? `<a href="${escapeHtml(review.author_uri)}" target="_blank" rel="noopener noreferrer">${authorName}</a>`
              : `<strong>${authorName}</strong>`;
            const sourceLink = review.google_maps_uri
              ? `<a class="review-source-link" href="${escapeHtml(review.google_maps_uri)}" target="_blank" rel="noopener noreferrer">Yorumu Google Maps'te gör ↗</a>`
              : "";

            return `<blockquote>
              <div class="review-stars" aria-label="${escapeHtml(review.rating)} üzerinden 5 yıldız">${escapeHtml(stars)}</div>
              <p>“${escapeHtml(review.text)}”</p>
              <footer>
                <span class="review-author">${authorPhoto}<span class="review-author-copy">${author}<small>${escapeHtml(review.relative_time)}</small></span></span>
                ${sourceLink}
              </footer>
            </blockquote>`;
          }).join("");
        }
      }

      if (mapsLink && payload.google_maps_uri) {
        mapsLink.href = payload.google_maps_uri;
        mapsLink.hidden = false;
      }
    });
  };
  renderGoogleReviews();

  const panoramaDialog = document.querySelector("[data-panorama-dialog]");
  const panoramaTitle = panoramaDialog?.querySelector("[data-panorama-title]");
  const videoDialog = document.querySelector("[data-video-dialog]");
  const roomVideo = videoDialog?.querySelector("[data-room-video]");
  const galleryDialog = document.querySelector("[data-gallery-dialog]");
  const galleryImage = galleryDialog?.querySelector("[data-gallery-image]");
  let panorama = null;

  const destroyPanorama = () => {
    panorama?.destroy?.();
    panorama = null;
    const viewer = document.getElementById("panorama-viewer");
    if (viewer) viewer.innerHTML = "";
  };

  const stopVideo = () => {
    if (!roomVideo) return;
    roomVideo.pause();
    roomVideo.currentTime = 0;
  };

  document.querySelectorAll("[data-dialog-close]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    let pointerStartedOnBackdrop = false;

    dialog.addEventListener("pointerdown", (event) => {
      pointerStartedOnBackdrop = event.target === dialog;
    });

    dialog.addEventListener("pointerup", (event) => {
      const endedOnBackdrop = event.target === dialog;
      if (pointerStartedOnBackdrop && endedOnBackdrop) {
        dialog.close();
      }
      pointerStartedOnBackdrop = false;
    });

    dialog.addEventListener("pointercancel", () => {
      pointerStartedOnBackdrop = false;
    });
  });

  panoramaDialog?.addEventListener("close", destroyPanorama);
  videoDialog?.addEventListener("close", stopVideo);

  const readNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  document.querySelectorAll("[data-open-panorama]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!panoramaDialog || typeof window.pannellum === "undefined") return;

      const source = button.dataset.panoramaSrc?.trim();
      if (!source) return;

      destroyPanorama();
      if (panoramaTitle) {
        panoramaTitle.textContent = button.dataset.panoramaTitle || "Panoramik görünüm";
      }

      panoramaDialog.showModal();
      panorama = window.pannellum.viewer("panorama-viewer", {
        type: "equirectangular",
        panorama: source,
        autoLoad: true,
        showZoomCtrl: true,
        showFullscreenCtrl: true,
        compass: false,
        hfov: readNumber(button.dataset.panoramaHfov, 100),
        yaw: readNumber(button.dataset.panoramaYaw, 0),
        pitch: readNumber(button.dataset.panoramaPitch, 0),
        minYaw: readNumber(button.dataset.panoramaMinYaw, -180),
        maxYaw: readNumber(button.dataset.panoramaMaxYaw, 180)
      });
    });
  });

  document.querySelectorAll("[data-open-video]").forEach((button) => {
    button.addEventListener("click", () => videoDialog?.showModal());
  });

  document.querySelectorAll("[data-open-gallery]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!galleryDialog || !galleryImage) return;
      galleryImage.src = button.dataset.gallerySrc || "";
      galleryImage.alt = button.dataset.galleryAlt || "Oda fotoğrafı";
      galleryDialog.showModal();
    });
  });

  galleryDialog?.addEventListener("close", () => {
    if (!galleryImage) return;
    galleryImage.removeAttribute("src");
    galleryImage.alt = "";
  });
})();

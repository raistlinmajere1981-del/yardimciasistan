(() => {
  const ROOM_API = "/yardimci-asistan/api/rooms.php";
  const DETAIL_PATH = "/demo/odalar/oda/";
  const FALLBACK_ROOM_IMAGE = "/assets/yardimci-asistan-logo.png";

  const featureCatalog = {
    air_conditioning: ["Klima", "snowflake"],
    wifi: ["Wi-Fi", "wifi"],
    private_bathroom: ["Özel banyo", "bath"],
    balcony: ["Balkon", "balcony"],
    terrace: ["Teras", "terrace"],
    sea_view: ["Deniz manzarası", "waves"],
    garden_view: ["Bahçe manzarası", "leaf"],
    mountain_view: ["Dağ manzarası", "mountain"],
    tv: ["TV", "tv"],
    mini_fridge: ["Mini buzdolabı", "fridge"],
    heating: ["Isıtma", "heat"],
    work_desk: ["Çalışma masası", "desk"],
    kitchenette: ["Mini mutfak", "kitchen"],
    step_free_access: ["Basamaksız erişim", "step-free"],
    wheelchair_friendly: ["Tekerlekli sandalye erişimine uygun", "accessible"],
    non_smoking: ["Sigara içilmeyen oda", "no-smoking"]
  };

  const iconPaths = {
    snowflake: '<path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5l-15.6 11"/>',
    wifi: '<path d="M3 8.8a13.3 13.3 0 0 1 18 0M6.5 12.3a8.3 8.3 0 0 1 11 0M10 15.8a3.3 3.3 0 0 1 4 0"/><circle cx="12" cy="19" r="1"/>',
    bath: '<path d="M4 12h16v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-2ZM7 12V7a3 3 0 0 1 6 0M7 20v2M17 20v2"/>',
    balcony: '<path d="M5 4h14v7H5zM3 11h18M5 11v9M9 11v9M15 11v9M19 11v9M3 20h18"/>',
    terrace: '<path d="M3 11h18M5 11V6h14v5M7 14v6M17 14v6M4 20h16"/>',
    waves: '<path d="M3 8c2 0 2 1.5 4 1.5S9 8 11 8s2 1.5 4 1.5S17 8 19 8s2 1.5 2 1.5M3 14c2 0 2 1.5 4 1.5S9 14 11 14s2 1.5 4 1.5S17 14 19 14s2 1.5 2 1.5"/>',
    leaf: '<path d="M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-7 10-16ZM5 20c3-5 7-8 12-11"/>',
    mountain: '<path d="m3 20 7-12 4 6 2-3 5 9H3Z"/>',
    tv: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="m9 22 3-4 3 4"/>',
    fridge: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M7 10h10M14 6v2M14 13v3"/>',
    heat: '<path d="M8 21c-3-2-4-5-2-8 1-2 3-3 3-6 3 2 4 4 3 7 2-1 4-3 4-6 3 3 4 6 2 9-2 4-7 6-10 4Z"/>',
    desk: '<path d="M4 10h16v5H4zM7 15v6M17 15v6M8 6h8v4"/>',
    kitchen: '<path d="M4 5h16v15H4zM4 10h16M8 13h3M14 13h2M8 17h8M7 5V2M17 5V2"/>',
    "step-free": '<path d="M3 18h6v-4h5v-4h7M3 21h18"/>',
    accessible: '<circle cx="10" cy="4" r="2"/><path d="M10 7v5h5l3 6M10 9H7M9 12l-2 5M8 21a5 5 0 1 1 2-9"/>',
    "no-smoking": '<path d="M3 15h13v4H3zM18 15h3v4h-3zM7 12c0-3 4-2 4-5 0-2-2-2-2-4M4 4l16 16"/>',
    family: '<circle cx="8" cy="7" r="3"/><circle cx="16.5" cy="8" r="2.5"/><path d="M3 20c0-4 2-7 5-7s5 3 5 7M13 20c0-3 1.5-5.5 3.5-5.5S20 17 20 20"/>'
  };

  const iconSvg = (name) => {
    const body = iconPaths[name] || '<circle cx="12" cy="12" r="8"/>';
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  };

  const normalizeMediaUrl = (value) => {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^(?:https?:|data:|blob:)/i.test(url) || url.startsWith("/")) return url;
    return "/yardimci-asistan/" + url.replace(/^\.\//, "");
  };

  const mediaByKind = (room, kind) => (Array.isArray(room.media) ? room.media : [])
    .filter((media) => media && media.kind === kind && String(media.url || "").trim())
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  const coverFor = (room) => {
    const cover = mediaByKind(room, "cover")[0] || mediaByKind(room, "photo")[0];
    return cover ? normalizeMediaUrl(cover.url) : "";
  };

  const detailUrl = (room) => `${DETAIL_PATH}?id=${encodeURIComponent(String(room.id || ""))}`;

  const formatPrice = (minor, currency) => {
    const amount = Number(minor || 0) / 100;
    if (!(amount > 0)) return "";
    const code = /^[A-Z]{3}$/.test(String(currency || "")) ? String(currency) : "TRY";
    try {
      return new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0
      }).format(amount);
    } catch {
      return `${amount.toLocaleString("tr-TR")} ${code}`;
    }
  };

  const formatFloor = (value) => {
    const floor = String(value || "").trim();
    if (!floor) return "";
    if (/^\d+$/.test(floor)) return `${Number.parseInt(floor, 10)}. kat`;
    return floor;
  };

  const createRoomCard = (room) => {
    const article = document.createElement("article");
    article.className = "room-card";

    const link = document.createElement("a");
    link.className = "room-card-media";
    link.href = detailUrl(room);

    const cover = coverFor(room);
    if (cover) {
      const image = document.createElement("img");
      image.src = cover;
      image.alt = String(room.name || "Oda") + " fotoğrafı";
      image.loading = "lazy";
      link.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "room-card-media-placeholder";
      placeholder.textContent = "Oda fotoğrafı hazırlanıyor";
      link.append(placeholder);
    }

    if (mediaByKind(room, "panorama_360").length) {
      const badge = document.createElement("span");
      badge.className = "room-media-badge";
      badge.textContent = "360°";
      link.append(badge);
    }

    const body = document.createElement("div");
    body.className = "room-card-body";

    const title = document.createElement("h3");
    title.textContent = room.name || "Oda";

    const meta = document.createElement("p");
    meta.className = "room-meta";
    const metaParts = [];
    if (Number(room.capacity) > 0) metaParts.push(`${Math.trunc(Number(room.capacity))} kişi`);
    if (room.bed_info) metaParts.push(String(room.bed_info));
    meta.textContent = metaParts.join(" · ");

    const description = document.createElement("p");
    description.textContent = String(room.description || "Oda detaylarını inceleyebilirsiniz.");

    body.append(title);
    if (meta.textContent) body.append(meta);
    body.append(description);

    const priceText = formatPrice(room.nightly_price_minor, room.currency);
    if (priceText) {
      const price = document.createElement("p");
      price.className = "room-card-price";
      price.textContent = priceText + " / gece";
      body.append(price);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const details = document.createElement("a");
    details.href = detailUrl(room);
    details.textContent = "Odayı incele";

    const reserve = document.createElement("button");
    reserve.type = "button";
    reserve.dataset.yaAction = "accommodation.reserve";
    reserve.dataset.yaResourceType = "room";
    reserve.dataset.yaResourceId = String(room.id || "");
    reserve.dataset.yaResourceName = String(room.name || "");
    if (cover) reserve.dataset.yaImageUrl = cover;
    reserve.textContent = "Rezervasyon sor";

    actions.append(details, reserve);
    body.append(actions);
    article.append(link, body);
    return article;
  };

  const renderLists = (rooms) => {
    document.querySelectorAll("[data-room-list]").forEach((root) => {
      root.replaceChildren();
      const limit = Math.max(0, Number(root.dataset.roomLimit || 0));
      const visible = limit ? rooms.slice(0, limit) : rooms;
      if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "room-catalog-empty";
        empty.textContent = "Yayınlanmış aktif oda bulunmuyor.";
        root.append(empty);
        return;
      }
      visible.forEach((room) => root.append(createRoomCard(room)));
    });

    document.querySelectorAll("[data-room-count]").forEach((node) => {
      node.textContent = `${rooms.length} oda`;
    });
  };

  const renderRoomGallery = (rooms) => {
    document.querySelectorAll("[data-room-gallery]").forEach((root) => {
      for (const room of rooms) {
        const candidates = [
          ...mediaByKind(room, "cover"),
          ...mediaByKind(room, "photo")
        ];
        const seen = new Set();
        for (const media of candidates) {
          const url = normalizeMediaUrl(media.url);
          if (!url || seen.has(url)) continue;
          seen.add(url);
          const image = document.createElement("img");
          image.src = url;
          image.alt = `${room.name || "Oda"} fotoğrafı`;
          image.loading = "lazy";
          root.append(image);
        }
      }
    });
  };

  const renderFeatureGrid = (room) => {
    const root = document.querySelector("[data-room-feature-list]");
    if (!root) return;
    root.replaceChildren();
    const ids = Array.isArray(room.features) ? room.features : [];
    const known = ids.filter((id) => featureCatalog[id]);
    if (!known.length) {
      const empty = document.createElement("div");
      empty.className = "room-catalog-empty";
      empty.textContent = "Oda özellikleri henüz yayınlanmadı.";
      root.append(empty);
      return;
    }
    for (const id of known) {
      const [label, icon] = featureCatalog[id];
      const item = document.createElement("div");
      item.className = "amenity-item";
      item.dataset.roomFeature = id;
      item.innerHTML = `<span class="amenity-icon">${iconSvg(icon)}</span><span></span>`;
      item.lastElementChild.textContent = label;
      root.append(item);
    }
  };

  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = String(value || "");
    });
  };

  const configurePanoramaCard = (kind, media, cover) => {
    const card = document.querySelector(`[data-room-media-card="${kind}"]`);
    if (!(card instanceof HTMLElement)) return;
    if (!media) {
      card.hidden = true;
      return;
    }
    const url = normalizeMediaUrl(media.url);
    if (!url) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    card.dataset.panoramaSrc = url;
    card.dataset.panoramaTitle = media.title || (kind === "panorama_360" ? "360° oda görünümü" : "180° görünüm");
    card.dataset.panoramaHfov = kind === "panorama_180" ? "85" : "105";
    card.dataset.panoramaYaw = "0";
    card.dataset.panoramaPitch = "0";
    card.dataset.panoramaMinYaw = kind === "panorama_180" ? "-90" : "-180";
    card.dataset.panoramaMaxYaw = kind === "panorama_180" ? "90" : "180";
    const preview = card.querySelector("[data-room-media-preview]");
    if (preview instanceof HTMLImageElement) {
      preview.src = cover || FALLBACK_ROOM_IMAGE;
      preview.alt = "";
    }
  };

  const configureVideoCard = (media, cover) => {
    const card = document.querySelector('[data-room-media-card="video"]');
    const video = document.querySelector("[data-room-video]");
    const source = video?.querySelector("[data-room-video-source]");
    if (!(card instanceof HTMLElement) || !(video instanceof HTMLVideoElement) || !(source instanceof HTMLSourceElement)) return;
    if (!media) {
      card.hidden = true;
      return;
    }
    const url = normalizeMediaUrl(media.url);
    if (!url) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const preview = card.querySelector("[data-room-media-preview]");
    if (preview instanceof HTMLImageElement) {
      preview.src = cover || FALLBACK_ROOM_IMAGE;
      preview.alt = "";
    }
    source.src = url;
    source.type = String(media.mime_type || "video/mp4");
    video.poster = cover || "";
    video.load();
    const title = document.querySelector("[data-room-video-title]");
    if (title) title.textContent = media.title || "Oda videosu";
  };

  const renderGallery = (room) => {
    const root = document.querySelector("[data-room-photo-gallery]");
    if (!root) return 0;
    root.replaceChildren();
    const candidates = [...mediaByKind(room, "cover"), ...mediaByKind(room, "photo")];
    const seen = new Set();
    let count = 0;
    for (const media of candidates) {
      const url = normalizeMediaUrl(media.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      count += 1;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-item";
      button.setAttribute("aria-label", `${room.name || "Oda"} fotoğrafı ${count} büyüt`);
      const image = document.createElement("img");
      image.src = url;
      image.alt = `${room.name || "Oda"} fotoğrafı ${count}`;
      image.loading = "lazy";
      button.append(image);
      button.addEventListener("click", () => {
        const dialog = document.querySelector("[data-gallery-dialog]");
        const target = dialog?.querySelector("[data-gallery-image]");
        if (!(dialog instanceof HTMLDialogElement) || !(target instanceof HTMLImageElement)) return;
        target.src = url;
        target.alt = image.alt;
        dialog.showModal();
      });
      root.append(button);
    }
    root.hidden = count === 0;
    return count;
  };

  const renderDetail = (rooms) => {
    const root = document.querySelector("[data-room-detail]");
    if (!root) return;

    const roomId = new URLSearchParams(window.location.search).get("id") || "";
    const room = rooms.find((candidate) => String(candidate.id || "") === roomId);
    const loading = root.querySelector("[data-room-detail-loading]");
    const content = root.querySelector("[data-room-detail-content]");

    if (!room) {
      if (loading) {
        loading.className = "room-detail-error";
        loading.textContent = roomId
          ? "Bu oda artık yayında değil veya bulunamadı."
          : "Gösterilecek oda seçilmedi.";
      }
      if (content instanceof HTMLElement) content.hidden = true;
      return;
    }

    if (loading instanceof HTMLElement) loading.hidden = true;
    if (content instanceof HTMLElement) content.hidden = false;

    document.title = `${room.name || "Oda"} | Yardımcı Asistan Canlı Demo`;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute("content", String(room.description || "Yardımcı Asistan canlı demo oda detayları."));

    const heroTitle = document.querySelector(".scenic-page-hero h1");
    if (heroTitle) heroTitle.textContent = room.name || "Oda";
    const heroDescription = document.querySelector(".scenic-page-hero-content > p:not(.eyebrow)");
    if (heroDescription) heroDescription.textContent = room.description || "Oda detayları ve konaklama bilgileri.";

    setText("[data-room-name]", room.name || "Oda");
    const descriptionNode = document.querySelector("[data-room-description]");
    if (descriptionNode instanceof HTMLElement) {
      const description = String(room.description || "").trim();
      descriptionNode.textContent = description;
      descriptionNode.hidden = !description;
    }
    setText("[data-room-capacity]", Number(room.capacity) > 0 ? `${Math.trunc(Number(room.capacity))} kişi` : "");
    setText("[data-room-bed]", room.bed_info || "");
    setText("[data-room-floor]", formatFloor(room.floor));
    setText("[data-room-price-note]", room.price_note || "");

    const price = formatPrice(room.nightly_price_minor, room.currency);
    const priceNode = document.querySelector("[data-room-price]");
    if (priceNode instanceof HTMLElement) {
      priceNode.textContent = price ? `${price} / gece` : "";
      priceNode.hidden = !price;
    }

    renderFeatureGrid(room);

    const cover = coverFor(room);
    const coverImage = document.querySelector("[data-room-cover]");
    const coverPlaceholder = document.querySelector("[data-room-cover-placeholder]");
    if (coverImage instanceof HTMLImageElement && cover) {
      coverImage.src = cover;
      coverImage.alt = `${room.name || "Oda"} fotoğrafı`;
      coverImage.hidden = false;
      if (coverPlaceholder instanceof HTMLElement) coverPlaceholder.hidden = true;
    } else {
      if (coverImage instanceof HTMLImageElement) coverImage.hidden = true;
      if (coverPlaceholder instanceof HTMLElement) coverPlaceholder.hidden = false;
    }

    const reserve = document.querySelector("[data-room-reserve]");
    if (reserve instanceof HTMLElement) {
      reserve.dataset.yaResourceType = "room";
      reserve.dataset.yaResourceId = String(room.id || "");
      reserve.dataset.yaResourceName = String(room.name || "");
      if (cover) reserve.dataset.yaImageUrl = cover;
      else delete reserve.dataset.yaImageUrl;
    }

    const panorama360 = mediaByKind(room, "panorama_360")[0];
    const panorama180 = mediaByKind(room, "panorama_180")[0];
    const video = mediaByKind(room, "video")[0];
    configurePanoramaCard("panorama_360", panorama360, cover);
    configurePanoramaCard("panorama_180", panorama180, cover);
    configureVideoCard(video, cover);
    const galleryCount = renderGallery(room);

    const mediaSection = document.querySelector("[data-room-media-section]");
    if (mediaSection instanceof HTMLElement) {
      mediaSection.hidden = !(panorama360 || panorama180 || video || galleryCount);
    }
  };

  const load = async () => {
    let payload = null;
    try {
      const response = await fetch(ROOM_API, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.message || "Odalar okunamadı.");
    } catch (error) {
      document.querySelectorAll("[data-room-list]").forEach((root) => {
        root.innerHTML = '<div class="room-catalog-empty">Oda bilgilerine şu anda ulaşılamıyor.</div>';
      });
      const detailLoading = document.querySelector("[data-room-detail-loading]");
      if (detailLoading) detailLoading.textContent = error instanceof Error ? error.message : "Oda bilgilerine ulaşılamıyor.";
      return;
    }

    const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
    renderLists(rooms);
    renderRoomGallery(rooms);
    renderDetail(rooms);
  };

  load();
})();

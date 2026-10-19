(() => {
  const { ui, html } = window.DemoLanguage;
  const TABLE_API = "/yardimci-asistan/api/tables.php";
  const DETAIL_PATH = "/restoran/masa/";

  const featureCatalog = {
    indoor: ui("İç mekân"),
    outdoor: ui("Açık alan"),
    terrace: ui("Teras / veranda"),
    window_side: ui("Cam kenarı"),
    sea_view: ui("Deniz manzarası"),
    garden_view: ui("Bahçe manzarası"),
    quiet_area: ui("Sakin bölüm"),
    wheelchair_friendly: ui("Tekerlekli sandalye erişimine uygun")
  };

  const smokingLabels = {
    unspecified: "",
    non_smoking: ui("Sigara içilmez"),
    smoking_allowed: ui("Sigara içilebilir"),
    outdoor_only: ui("Yalnız açık alanda sigara içilebilir")
  };

  const normalizeMediaUrl = (value) => {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^(?:https?:|data:|blob:)/i.test(url) || url.startsWith("/")) return url;
    return "/yardimci-asistan/" + url.replace(/^\.\//, "");
  };

  const mediaByKind = (table, kind) => (Array.isArray(table.media) ? table.media : [])
    .filter((media) => media && media.kind === kind && String(media.url || "").trim())
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  const coverFor = (table) => {
    const cover = mediaByKind(table, "cover")[0] || mediaByKind(table, "photo")[0];
    return cover ? normalizeMediaUrl(cover.url) : "";
  };

  const detailUrl = (table) => `${DETAIL_PATH}?id=${encodeURIComponent(String(table.id || ""))}`;

  const createTableCard = (table) => {
    const article = document.createElement("article");
    article.className = "room-card table-card";

    const mediaLink = document.createElement("a");
    mediaLink.className = "room-card-media";
    mediaLink.href = detailUrl(table);

    const cover = coverFor(table);
    if (cover) {
      const image = document.createElement("img");
      image.src = cover;
      image.alt = String(table.name || ui("Masa")) + ui(" fotoğrafı");
      image.loading = "lazy";
      mediaLink.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "room-card-media-placeholder";
      placeholder.textContent = ui("Masa fotoğrafı hazırlanıyor");
      mediaLink.append(placeholder);
    }

    if (mediaByKind(table, "panorama_360").length) {
      const badge = document.createElement("span");
      badge.className = "room-media-badge";
      badge.textContent = "360°";
      mediaLink.append(badge);
    }

    const body = document.createElement("div");
    body.className = "room-card-body";
    const title = document.createElement("h3");
    title.textContent = table.name || ui("Masa");
    body.append(title);

    const metaParts = [];
    if (table.area) metaParts.push(String(table.area));
    if (Number(table.capacity) > 0) metaParts.push(ui("{0} kişi", {0: Math.trunc(Number(table.capacity))}));
    const smoking = smokingLabels[String(table.smoking_policy || "unspecified")] || "";
    if (smoking) metaParts.push(smoking);
    if (metaParts.length) {
      const meta = document.createElement("p");
      meta.className = "room-meta";
      meta.textContent = metaParts.join(" · ");
      body.append(meta);
    }

    const descriptionText = String(table.description || "").trim();
    if (descriptionText) {
      const description = document.createElement("p");
      description.textContent = descriptionText;
      body.append(description);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const details = document.createElement("a");
    details.href = detailUrl(table);
    details.textContent = ui("Masayı incele");
    actions.append(details);
    body.append(actions);

    article.append(mediaLink, body);
    return article;
  };

  const renderLists = (tables, enabled) => {
    document.querySelectorAll("[data-table-list]").forEach((root) => {
      root.replaceChildren();
      if (!enabled) {
        const empty = document.createElement("div");
        empty.className = "room-catalog-empty";
        empty.textContent = ui("Restoran / masa web yayını masaüstünden kapalı.");
        root.append(empty);
        return;
      }
      const limit = Math.max(0, Number(root.dataset.tableLimit || 0));
      const visible = limit ? tables.slice(0, limit) : tables;
      if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "room-catalog-empty";
        empty.textContent = ui("Yayınlanmış aktif masa bulunmuyor.");
        root.append(empty);
        return;
      }
      visible.forEach((table) => root.append(createTableCard(table)));
    });

    document.querySelectorAll("[data-table-count]").forEach((node) => {
      node.textContent = enabled ? ui("{0} masa", {0: tables.length}) : ui("Yayın kapalı");
    });
  };

  const renderFeatures = (table) => {
    const root = document.querySelector("[data-table-feature-list]");
    if (!root) return;
    root.replaceChildren();
    const features = Array.isArray(table.features) ? table.features : [];
    const known = features.filter((feature) => featureCatalog[feature]);
    const smokingPolicy = String(table.smoking_policy || "unspecified");
    const smokingLabel = smokingPolicy === "smoking_allowed" || smokingPolicy === "outdoor_only"
      ? smokingLabels[smokingPolicy] : "";
    if (!known.length && !smokingLabel) {
      const empty = document.createElement("div");
      empty.className = "room-catalog-empty";
      empty.textContent = ui("Masa özellikleri henüz yayınlanmadı.");
      root.append(empty);
      return;
    }
    for (const feature of known) {
      const item = document.createElement("div");
      item.className = "amenity-item";
      item.innerHTML = '<span class="amenity-icon" aria-hidden="true">◇</span><span></span>';
      item.lastElementChild.textContent = featureCatalog[feature];
      root.append(item);
    }
    if (smokingLabel) {
      const item = document.createElement("div");
      item.className = "amenity-item";
      const icon = document.createElement("span");
      icon.className = "amenity-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "🚬";
      const label = document.createElement("span");
      label.textContent = smokingLabel;
      item.append(icon, label);
      root.append(item);
    }
  };

  const configurePanorama = (kind, media, cover) => {
    const card = document.querySelector(`[data-table-media-card="${kind}"]`);
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
    card.dataset.panoramaTitle = media.title || (kind === "panorama_360" ? ui("360° masa görünümü") : ui("180° masa görünümü"));
    card.dataset.panoramaHfov = kind === "panorama_180" ? "85" : "105";
    card.dataset.panoramaYaw = "0";
    card.dataset.panoramaPitch = "0";
    card.dataset.panoramaMinYaw = kind === "panorama_180" ? "-90" : "-180";
    card.dataset.panoramaMaxYaw = kind === "panorama_180" ? "90" : "180";
    const preview = card.querySelector("[data-table-media-preview]");
    if (preview instanceof HTMLImageElement) {
      preview.src = cover || "/assets/yardimci-asistan-logo.png";
      preview.alt = "";
    }
  };

  const configureVideo = (media, cover) => {
    const card = document.querySelector('[data-table-media-card="video"]');
    const video = document.querySelector("[data-table-video]");
    const source = video?.querySelector("[data-table-video-source]");
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
    const preview = card.querySelector("[data-table-media-preview]");
    if (preview instanceof HTMLImageElement) {
      preview.src = cover || "/assets/yardimci-asistan-logo.png";
      preview.alt = "";
    }
    source.src = url;
    source.type = String(media.mime_type || "video/mp4");
    video.poster = cover || "";
    video.load();
  };

  const renderGallery = (table) => {
    const root = document.querySelector("[data-table-photo-gallery]");
    if (!root) return 0;
    root.replaceChildren();
    const candidates = [...mediaByKind(table, "cover"), ...mediaByKind(table, "photo")];
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
      button.setAttribute("aria-label", ui("{0} fotoğrafı {1} büyüt", {0: table.name || ui("Masa"), 1: count}));
      const image = document.createElement("img");
      image.src = url;
      image.alt = ui("{0} fotoğrafı {1}", {0: table.name || ui("Masa"), 1: count});
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

  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = String(value || "");
    });
  };

  const renderDetail = (tables, enabled) => {
    const root = document.querySelector("[data-table-detail]");
    if (!root) return;

    const tableId = new URLSearchParams(window.location.search).get("id") || "";
    const table = enabled ? tables.find((candidate) => String(candidate.id || "") === tableId) : null;
    const loading = root.querySelector("[data-table-detail-loading]");
    const content = root.querySelector("[data-table-detail-content]");

    if (!table) {
      if (loading) {
        loading.className = "room-detail-error";
        loading.textContent = !enabled
          ? ui("Restoran / masa web yayını masaüstünden kapalı.")
          : tableId
            ? ui("Bu masa artık yayında değil veya bulunamadı.")
            : ui("Gösterilecek masa seçilmedi.");
      }
      if (content instanceof HTMLElement) content.hidden = true;
      return;
    }

    if (loading instanceof HTMLElement) loading.hidden = true;
    if (content instanceof HTMLElement) content.hidden = false;

    document.title = `${table.name || ui("Masa")} | Yardımcı Asistan`;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute("content", String(table.description || ui("Yardımcı Asistan canlı demo masa detayları.")));

    const heroTitle = document.querySelector(".scenic-page-hero h1");
    if (heroTitle) heroTitle.textContent = table.name || ui("Masa");
    const heroDescription = document.querySelector(".scenic-page-hero-content > p:not(.eyebrow)");
    if (heroDescription) heroDescription.textContent = table.description || ui("Masa özellikleri ve yayınlanmış müşteri bilgileri.");

    setText("[data-table-name]", table.name || ui("Masa"));
    setText("[data-table-area]", table.area || ui("Bölüm belirtilmedi"));
    setText("[data-table-capacity]", Number(table.capacity) > 0 ? ui("{0} kişi", {0: Math.trunc(Number(table.capacity))}) : "");
    const smokingNotice = document.querySelector("[data-table-smoking]");
    if (smokingNotice instanceof HTMLElement) {
      const policy = String(table.smoking_policy || "unspecified");
      // Allowed policies are rendered with an icon in the feature grid; no duplicate note.
      smokingNotice.textContent = policy === "non_smoking" ? smokingLabels.non_smoking : "";
      smokingNotice.hidden = policy !== "non_smoking";
    }

    const description = document.querySelector("[data-table-description]");
    if (description instanceof HTMLElement) {
      const value = String(table.description || "").trim();
      description.textContent = value;
      description.hidden = !value;
    }

    renderFeatures(table);

    const cover = coverFor(table);
    const coverImage = document.querySelector("[data-table-cover]");
    const coverPlaceholder = document.querySelector("[data-table-cover-placeholder]");
    if (coverImage instanceof HTMLImageElement && cover) {
      coverImage.src = cover;
      coverImage.alt = ui("{0} fotoğrafı", {0: table.name || ui("Masa")});
      coverImage.hidden = false;
      if (coverPlaceholder instanceof HTMLElement) coverPlaceholder.hidden = true;
    } else {
      if (coverImage instanceof HTMLImageElement) coverImage.hidden = true;
      if (coverPlaceholder instanceof HTMLElement) coverPlaceholder.hidden = false;
    }

    const panorama360 = mediaByKind(table, "panorama_360")[0];
    const panorama180 = mediaByKind(table, "panorama_180")[0];
    const video = mediaByKind(table, "video")[0];
    configurePanorama("panorama_360", panorama360, cover);
    configurePanorama("panorama_180", panorama180, cover);
    configureVideo(video, cover);
    const galleryCount = renderGallery(table);

    const mediaSection = document.querySelector("[data-table-media-section]");
    if (mediaSection instanceof HTMLElement) {
      mediaSection.hidden = !(panorama360 || panorama180 || video || galleryCount);
    }
  };

  const load = async () => {
    let payload = null;
    try {
      const response = await fetch(TABLE_API, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      payload = await response.json().catch(() => null);
      payload = window.DemoLanguage?.localize(payload, "table_catalog") ?? payload;
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.message || ui("Masalar okunamadı."));
    } catch {
      document.querySelectorAll("[data-table-list]").forEach((root) => {
        root.innerHTML = `<div class="room-catalog-empty">${html("Masa bilgilerine şu anda ulaşılamıyor.")}</div>`;
      });
      const loading = document.querySelector("[data-table-detail-loading]");
      if (loading) {
        loading.className = "room-detail-error";
        loading.textContent = ui("Masa bilgilerine şu anda ulaşılamıyor.");
      }
      return;
    }

    const enabled = payload?.enabled === true;
    const tables = Array.isArray(payload?.tables) ? payload.tables : [];
    renderLists(tables, enabled);
    renderDetail(tables, enabled);
  };

  void load();
})();

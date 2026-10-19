(() => {
  const { ui, locale } = window.DemoLanguage;
  const root = document.querySelector("[data-qr-menu-root]");
  if (!root) return;

  const tabs = root.querySelector("[data-qr-menu-tabs]");
  const list = root.querySelector("[data-qr-menu-list]");
  const status = root.querySelector("[data-qr-menu-status]");
  const updated = root.querySelector("[data-qr-menu-updated]");
  const state = {
    activeCategoryId: "all",
    categories: [],
    items: [],
    updatedAt: "",
    etag: ""
  };
  const formatterCache = new Map();

  const normalizeImageUrl = (value) => {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^(?:https?:|data:|blob:)/i.test(url) || url.startsWith("/")) return url;
    return "/yardimci-asistan/" + url.replace(/^\.\//, "");
  };

  const formatPrice = (price, currency) => {
    const code = String(currency || "TRY").toUpperCase();
    if (!formatterCache.has(code)) {
      formatterCache.set(code, new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0
      }));
    }
    return formatterCache.get(code).format(Number(price || 0));
  };

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || "");
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  };

  const visibleCategories = () => state.activeCategoryId === "all"
    ? state.categories
    : state.categories.filter((category) => category.id === state.activeCategoryId);

  const renderTabs = () => {
    tabs.replaceChildren();
    const categories = [{ id: "all", name: ui("Tüm Ürünler") }, ...state.categories];
    for (const category of categories) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = category.name || ui("Kategori");
      const active = state.activeCategoryId === category.id;
      button.className = active ? "is-active" : "";
      button.setAttribute("aria-pressed", String(active));
      button.addEventListener("click", () => {
        state.activeCategoryId = category.id;
        render();
      });
      tabs.append(button);
    }
  };

  const createMenuItem = (item) => {
    const article = document.createElement("article");
    article.className = "qr-menu-item";

    const imageUrl = normalizeImageUrl(item.image_url);
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = item.name || ui("Menü ürünü");
      image.loading = "lazy";
      article.append(image);
    } else {
      article.classList.add("no-image");
    }

    const body = document.createElement("div");
    body.className = "qr-menu-item-body";

    const titleRow = document.createElement("div");
    titleRow.className = "qr-menu-item-title";
    const title = document.createElement("strong");
    title.textContent = item.name || ui("Ürün");
    if (item.is_featured) title.classList.add("is-featured");
    const price = document.createElement("span");
    price.textContent = formatPrice(item.price, item.currency);
    titleRow.append(title, price);
    body.append(titleRow);

    if (item.description) {
      const description = document.createElement("p");
      description.textContent = item.description;
      body.append(description);
    }

    if (Array.isArray(item.tags) && item.tags.length) {
      const tags = document.createElement("div");
      tags.className = "qr-menu-tags";
      for (const tag of item.tags.slice(0, 4)) {
        const chip = document.createElement("span");
        chip.textContent = tag;
        tags.append(chip);
      }
      body.append(tags);
    }

    article.append(body);
    return article;
  };

  const renderMenu = () => {
    list.replaceChildren();

    const sections = visibleCategories()
      .map((category) => ({
        category,
        items: state.items.filter((item) => item.category_id === category.id)
      }))
      .filter((section) => section.items.length);

    if (!sections.length) {
      const empty = document.createElement("div");
      empty.className = "qr-menu-empty";
      empty.textContent = ui("Bu kategori için aktif ürün bulunmuyor.");
      list.append(empty);
      return;
    }

    for (const { category, items } of sections) {
      const section = document.createElement("section");
      section.className = "qr-menu-category";
      const heading = document.createElement("div");
      heading.className = "qr-menu-category-heading";

      const title = document.createElement("h2");
      title.textContent = category.name || ui("Kategori");
      heading.append(title);

      if (category.description) {
        const description = document.createElement("p");
        description.textContent = category.description;
        heading.append(description);
      }

      const grid = document.createElement("div");
      grid.className = "qr-menu-grid";
      for (const item of items) grid.append(createMenuItem(item));

      section.append(heading, grid);
      list.append(section);
    }
  };

  const render = () => {
    renderTabs();
    renderMenu();
    updated.textContent = state.updatedAt
      ? ui("Güncelleme: ") + formatDate(state.updatedAt)
      : ui("Güncelleme bekleniyor.");
    status.textContent = "";
  };

  const loadMenu = async (silent = false) => {
    try {
      const response = await fetch("/yardimci-asistan/api/menu.php", {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(state.etag ? { "If-None-Match": state.etag } : {})
        }
      });

      if (response.status === 304) return;
      if (response.status === 404) {
        window.location.replace("/");
        return;
      }
      if (!response.ok) throw new Error(ui("Menü şu anda okunamadı."));

      const source = await response.json();
      const payload = window.DemoLanguage?.localize(source, "menu") ?? source;
      if (payload?.ok === false) throw new Error(ui("Menü şu anda okunamadı."));

      state.etag = response.headers.get("ETag") || state.etag;
      state.categories = Array.isArray(payload.categories) ? payload.categories : [];
      state.items = Array.isArray(payload.items) ? payload.items : [];
      state.updatedAt = typeof payload.updated_at === "string" ? payload.updated_at : "";

      if (
        state.activeCategoryId !== "all"
        && !state.categories.some((category) => category.id === state.activeCategoryId)
      ) {
        state.activeCategoryId = "all";
      }

      render();
    } catch {
      if (silent && state.categories.length) return;
      status.textContent = ui("Menü şu anda okunamadı.");
      list.replaceChildren();
    }
  };

  loadMenu();

  window.setInterval(() => {
    if (document.visibilityState === "visible") loadMenu(true);
  }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadMenu(true);
  });
  window.addEventListener("focus", () => loadMenu(true));
})();

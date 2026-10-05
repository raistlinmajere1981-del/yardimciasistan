/* Shared website map renderer. Does not change directions or canonical location. */
(() => {
  const googleEmbedUrl = (value) => {
    if (typeof value !== "string") return "";
    const raw = value.trim();
    if (!raw || raw.length > 4096 || /[<>\\\s]/.test(raw)) return "";
    try {
      const url = new URL(raw);
      return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash
        && ["google.com", "www.google.com"].includes(url.hostname)
        && url.pathname === "/maps/embed" && url.searchParams.get("pb") ? url.href : "";
    } catch { return ""; }
  };
  window.YardimciBusinessMap = {
    render(business, root = document) {
      const latitude = business.latitude == null || business.latitude === "" ? NaN : Number(business.latitude);
      const longitude = business.longitude == null || business.longitude === "" ? NaN : Number(business.longitude);
      const hasPoint = Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
      const lat = latitude.toFixed(6), lon = longitude.toFixed(6);
      const google = business.mapDisplayMode === "google_maps_embed" ? googleEmbedUrl(business.googleMapsEmbedUrl) : "";
      const bbox = [longitude - .009, latitude - .006, longitude + .009, latitude + .006].map(value => value.toFixed(6)).join("%2C");
      const src = google || (hasPoint ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}` : "");
      root.querySelectorAll("[data-business-map-frame]").forEach(node => {
        if (src) node.src = src; else node.removeAttribute("src");
        node.hidden = !src;
        node.title = "İşletme konumu";
        node.loading = "lazy";
        node.referrerPolicy = "strict-origin-when-cross-origin";
        node.style.width = "100%";
        node.style.border = "0";
      });
      root.querySelectorAll("[data-business-map-placeholder]").forEach(node => { node.hidden = !!src; });
      root.querySelectorAll("[data-business-map-attribution]").forEach(node => { node.hidden = !hasPoint || !!google; });
      root.querySelectorAll("[data-business-map-link]").forEach(node => {
        node.hidden = !hasPoint;
        if (hasPoint) node.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
      });
      if (hasPoint) root.querySelectorAll("[data-business-directions-button]").forEach(node => { node.setAttribute("data-ya-address", `${lat},${lon}`); });
    }
  };
})();

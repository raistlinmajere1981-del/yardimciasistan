const COLLAPSED_CLASS = "reports-details-collapsed";
const TOGGLE_CLASS = "cash-details-toggle";

type Cleanup = () => void;

let installedCleanup: Cleanup | null = null;
let enhanceScheduled = false;
let enhanceFrame = 0;

export function installCashPageUx(): Cleanup {
  if (installedCleanup) return installedCleanup;
  if (typeof document === "undefined") return () => undefined;

  const controller = new AbortController();
  const { signal } = controller;

  const enhance = () => {
    enhanceScheduled = false;
    enhanceFrame = 0;

    document.querySelectorAll<HTMLElement>(".reports-page").forEach((page) => {
      if (page.dataset.cashDetailsReady !== "true") {
        page.dataset.cashDetailsReady = "true";
        page.classList.add(COLLAPSED_CLASS);
      }

      const toggle = page.querySelector<HTMLElement>(".reports-detail-divider");
      if (!toggle) return;
      toggle.classList.add(TOGGLE_CLASS);
      toggle.setAttribute("role", "button");
      toggle.tabIndex = 0;
      updateToggleText(page, toggle);
    });

    document.querySelectorAll<HTMLElement>(".finance-outstanding-list article").forEach((row) => {
      const status = row.querySelector<HTMLElement>(".finance-outstanding-status")?.textContent?.trim() ?? "";
      const context = row.querySelector<HTMLElement>("div > span");
      if (!context) return;

      const text = context.textContent ?? "";
      const marker = " · Çıkış ";
      const markerIndex = text.lastIndexOf(marker);
      if (markerIndex < 0) return;

      if (status === "Açık oda hesabı") {
        const next = `${text.slice(0, markerIndex)} · Planlanan çıkış ${text.slice(markerIndex + marker.length)}`;
        if (context.textContent !== next) context.textContent = next;
        return;
      }

      if (status.includes("Çıkış yaptı")) {
        const next = text.slice(0, markerIndex);
        if (context.textContent !== next) context.textContent = next;
      }
    });
  };

  const scheduleEnhance = () => {
    if (enhanceScheduled) return;
    enhanceScheduled = true;
    enhanceFrame = window.requestAnimationFrame(enhance);
  };

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(`.${TOGGLE_CLASS}`) : null;
    if (!target) return;
    toggleReportDetails(target);
  }, { signal });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(`.${TOGGLE_CLASS}`) : null;
    if (!target) return;
    event.preventDefault();
    toggleReportDetails(target);
  }, { signal });

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleEnhance();

  const cleanup = () => {
    controller.abort();
    observer.disconnect();
    if (enhanceFrame) window.cancelAnimationFrame(enhanceFrame);
    enhanceFrame = 0;
    enhanceScheduled = false;
    installedCleanup = null;
  };

  installedCleanup = cleanup;
  return cleanup;
}

function toggleReportDetails(toggle: HTMLElement) {
  const page = toggle.closest<HTMLElement>(".reports-page");
  if (!page) return;
  page.classList.toggle(COLLAPSED_CLASS);
  updateToggleText(page, toggle);

  if (!page.classList.contains(COLLAPSED_CLASS)) {
    window.requestAnimationFrame(() => {
      toggle.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function updateToggleText(page: HTMLElement, toggle: HTMLElement) {
  const expanded = !page.classList.contains(COLLAPSED_CLASS);
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute("aria-label", expanded ? "Detaylı raporları gizle" : "Geçmiş ve detaylı raporları aç");

  const eyebrow = toggle.querySelector<HTMLElement>("span");
  const label = toggle.querySelector<HTMLElement>("strong");
  const eyebrowText = "Detaylı raporlar";
  const labelText = expanded ? "Detaylı Raporları Gizle" : "Geçmiş ve Detaylı Raporları Aç";

  if (eyebrow && eyebrow.textContent !== eyebrowText) eyebrow.textContent = eyebrowText;
  if (label && label.textContent !== labelText) label.textContent = labelText;
}

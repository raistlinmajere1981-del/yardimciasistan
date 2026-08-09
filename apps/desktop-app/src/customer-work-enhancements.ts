const customerDateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

type Cleanup = () => void;

let installedCleanup: Cleanup | null = null;
let formatScheduled = false;
let formatFrame = 0;

function formatCustomerLastContactDates(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".customers-workspace .compact-detail-meta > div").forEach((field) => {
    const label = field.querySelector("dt")?.textContent?.trim();
    const value = field.querySelector<HTMLElement>("dd");
    if (label !== "Son temas" || !value) return;

    const raw = value.title || value.textContent?.trim() || "";
    if (!raw || raw === "-") return;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return;

    const formatted = customerDateTimeFormatter.format(parsed);
    if (!value.title) value.title = raw;
    if (value.textContent !== formatted) value.textContent = formatted;
  });
}

export function installCustomerWorkEnhancements(): Cleanup {
  if (installedCleanup) return installedCleanup;
  if (typeof document === "undefined") return () => undefined;

  const scheduleFormat = () => {
    if (formatScheduled) return;
    formatScheduled = true;
    formatFrame = window.requestAnimationFrame(() => {
      formatScheduled = false;
      formatFrame = 0;
      formatCustomerLastContactDates();
    });
  };

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (target?.closest(".customers-workspace")) return true;
      return Array.from(mutation.addedNodes).some((node) => (
        node instanceof Element && (node.matches(".customers-workspace") || node.querySelector(".customers-workspace"))
      ));
    });
    if (relevant) scheduleFormat();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  scheduleFormat();

  const cleanup = () => {
    observer.disconnect();
    if (formatFrame) window.cancelAnimationFrame(formatFrame);
    formatFrame = 0;
    formatScheduled = false;
    installedCleanup = null;
  };

  installedCleanup = cleanup;
  return cleanup;
}

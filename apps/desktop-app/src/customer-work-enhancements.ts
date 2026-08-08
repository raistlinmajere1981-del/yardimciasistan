const customerDateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function formatCustomerLastContactDates(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".customers-workspace .compact-detail-meta > div").forEach((field) => {
    const label = field.querySelector("dt")?.textContent?.trim();
    const value = field.querySelector<HTMLElement>("dd");
    if (label !== "Son temas" || !value) {
      return;
    }

    const raw = value.textContent?.trim() ?? "";
    if (!raw || raw === "-") {
      return;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return;
    }

    const formatted = customerDateTimeFormatter.format(parsed);
    if (formatted === raw) {
      return;
    }

    value.title = raw;
    value.textContent = formatted;
  });
}

export function installCustomerWorkEnhancements() {
  if (typeof document === "undefined") {
    return;
  }

  formatCustomerLastContactDates();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" || mutation.type === "characterData") {
        formatCustomerLastContactDates();
        return;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

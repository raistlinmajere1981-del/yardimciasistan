const ITEM_DETAILS_SELECTOR = ".menu-manager details.item-details";
const IMAGE_LABEL_SELECTOR = `${ITEM_DETAILS_SELECTOR} label.menu-image-picker-label`;
const PREVIEW_CLASS = "menu-image-inline-preview";

let installed = false;

export function installMenuImagePreviewUx() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const scan = () => enhanceImagePreviews();

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".menu-manager .manager-row")) {
      window.setTimeout(scan, 0);
    }
  }, true);

  document.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.yaMenuImagePicker !== "true") return;
    syncPreviewForInput(input);
  }, true);

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.yaMenuImagePicker !== "true") return;
    syncPreviewForInput(input);
  }, true);

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
}

function enhanceImagePreviews() {
  document.querySelectorAll<HTMLLabelElement>(IMAGE_LABEL_SELECTOR).forEach((label) => {
    const details = label.closest<HTMLDetailsElement>(ITEM_DETAILS_SELECTOR);
    const input = label.querySelector<HTMLInputElement>('input[data-ya-menu-image-picker="true"]');
    if (!details || !input) return;

    details.classList.add("has-menu-image-preview");
    let preview = details.querySelector<HTMLElement>(`:scope > .${PREVIEW_CLASS}`);
    if (!preview) {
      preview = createPreview();
      details.append(preview);
    }
    syncPreview(input, preview);
  });
}

function createPreview() {
  const figure = document.createElement("figure");
  figure.className = PREVIEW_CLASS;
  figure.setAttribute("aria-label", "Mevcut ürün görseli önizlemesi");

  const frame = document.createElement("div");
  frame.className = "menu-image-preview-frame";

  const image = document.createElement("img");
  image.alt = "Mevcut ürün görseli";
  image.hidden = true;
  image.addEventListener("load", () => {
    image.hidden = false;
    const empty = frame.querySelector<HTMLElement>(".menu-image-preview-empty");
    if (empty) empty.hidden = true;
  });
  image.addEventListener("error", () => {
    image.hidden = true;
    const empty = frame.querySelector<HTMLElement>(".menu-image-preview-empty");
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Önizleme yok";
    }
  });

  const empty = document.createElement("span");
  empty.className = "menu-image-preview-empty";
  empty.textContent = "Görsel yok";

  const caption = document.createElement("figcaption");
  caption.textContent = "Mevcut görsel";

  frame.append(image, empty);
  figure.append(frame, caption);
  return figure;
}

function syncPreviewForInput(input: HTMLInputElement) {
  const details = input.closest<HTMLDetailsElement>(ITEM_DETAILS_SELECTOR);
  const preview = details?.querySelector<HTMLElement>(`:scope > .${PREVIEW_CLASS}`);
  if (preview) syncPreview(input, preview);
}

function syncPreview(input: HTMLInputElement, preview: HTMLElement) {
  const image = preview.querySelector<HTMLImageElement>("img");
  const empty = preview.querySelector<HTMLElement>(".menu-image-preview-empty");
  if (!image || !empty) return;

  const value = input.value.trim();
  if (!value) {
    image.removeAttribute("src");
    image.hidden = true;
    empty.hidden = false;
    empty.textContent = "Görsel yok";
    return;
  }

  const source = resolvePreviewSource(value);
  if (!source) {
    image.removeAttribute("src");
    image.hidden = true;
    empty.hidden = false;
    empty.textContent = "Önizleme yok";
    return;
  }

  if (image.src === source || image.getAttribute("src") === source) return;
  empty.hidden = false;
  empty.textContent = "Yükleniyor…";
  image.hidden = true;
  image.src = source;
}

function resolvePreviewSource(value: string) {
  if (/^(data:image\/|blob:|https?:\/\/)/i.test(value)) return value;

  try {
    return new URL(value, window.location.href).toString();
  } catch {
    return "";
  }
}

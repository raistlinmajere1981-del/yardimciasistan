const ALWAYS_OPEN_DETAILS_SELECTOR = ".menu-manager details.category-details, .menu-manager details.item-details";
const ITEM_DETAILS_SELECTOR = ".menu-manager details.item-details";
const IMAGE_LABEL_SELECTOR = `${ITEM_DETAILS_SELECTOR} label`;
const PREVIEW_CLASS = "menu-image-inline-preview";
const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 420 * 1024;
const MAX_OUTPUT_IMAGE_BYTES = 700 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Cleanup = () => void;

let installedCleanup: Cleanup | null = null;
let scanScheduled = false;
let scanFrame = 0;

/**
 * Menü editörünün React'e henüz taşınmamış uyumluluk davranışlarını tek gözlemci
 * ve tek event yaşam döngüsü altında toplar. Bu katman kademeli refaktör sırasında
 * geçicidir; yeni menü davranışları doğrudan React bileşeninde uygulanmalıdır.
 */
export function installMenuEditorUx(): Cleanup {
  if (installedCleanup) return installedCleanup;
  if (typeof document === "undefined") return () => undefined;

  const controller = new AbortController();
  const { signal } = controller;

  const scheduleScan = () => {
    if (scanScheduled) return;
    scanScheduled = true;
    scanFrame = window.requestAnimationFrame(() => {
      scanScheduled = false;
      scanFrame = 0;
      scanMenuEditor(signal);
    });
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const summary = target.closest(`${ALWAYS_OPEN_DETAILS_SELECTOR} > summary`);
    if (summary) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (target.closest(".menu-manager .manager-row")) {
      scheduleScan();
    }
  }, { capture: true, signal });

  document.addEventListener("toggle", (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.matches(ALWAYS_OPEN_DETAILS_SELECTOR)) return;
    if (!details.open) details.open = true;
  }, { capture: true, signal });

  document.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !isMenuImageInput(input)) return;
    syncPreviewForInput(input);
  }, { capture: true, signal });

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !isMenuImageInput(input)) return;
    syncPreviewForInput(input);
  }, { capture: true, signal });

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleScan();

  const cleanup = () => {
    controller.abort();
    observer.disconnect();
    if (scanFrame) window.cancelAnimationFrame(scanFrame);
    scanFrame = 0;
    scanScheduled = false;
    installedCleanup = null;
  };

  installedCleanup = cleanup;
  return cleanup;
}

function scanMenuEditor(signal: AbortSignal) {
  keepDetailSectionsOpen();
  enhanceImagePicker(signal);
  enhanceImagePreviews();
}

function keepDetailSectionsOpen() {
  document.querySelectorAll<HTMLDetailsElement>(ALWAYS_OPEN_DETAILS_SELECTOR).forEach((details) => {
    if (!details.open) details.open = true;
    details.dataset.yaAlwaysOpen = "true";
  });
}

function enhanceImagePicker(signal: AbortSignal) {
  document.querySelectorAll<HTMLLabelElement>(IMAGE_LABEL_SELECTOR).forEach((label) => {
    if (!isImageLabel(label)) return;
    const input = label.querySelector<HTMLInputElement>("input");
    if (!input) return;

    syncImagePickerLabel(input, label);
    if (input.dataset.yaMenuImagePicker === "true") return;

    input.dataset.yaMenuImagePicker = "true";
    input.readOnly = true;
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Ürün görseli seç");
    input.title = "Görsel seçmek veya değiştirmek için tıklayın. Görseli kaldırmak için Delete tuşuna basın.";
    label.classList.add("menu-image-picker-label");

    input.addEventListener("click", (event) => {
      event.preventDefault();
      void chooseMenuImage(input, label);
    }, { signal });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void chooseMenuImage(input, label);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        applyReactInputValue(input, "");
        input.dataset.yaMenuImageValue = "";
        label.dataset.menuImageLabel = "Görsel seçilmedi";
        syncPreviewForInput(input);
      }
    }, { signal });
  });
}

function enhanceImagePreviews() {
  document.querySelectorAll<HTMLLabelElement>(IMAGE_LABEL_SELECTOR).forEach((label) => {
    if (!isImageLabel(label)) return;
    const details = label.closest<HTMLDetailsElement>(ITEM_DETAILS_SELECTOR);
    const input = label.querySelector<HTMLInputElement>("input");
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

function isImageLabel(label: HTMLLabelElement) {
  return label.textContent?.includes("Görsel yolu") === true;
}

function isMenuImageInput(input: HTMLInputElement) {
  const label = input.closest<HTMLLabelElement>("label");
  return Boolean(label && isImageLabel(label) && input.closest(ITEM_DETAILS_SELECTOR));
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

  if (image.getAttribute("src") === source || image.src === source) return;
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

function syncImagePickerLabel(input: HTMLInputElement, label: HTMLLabelElement) {
  const value = input.value;
  if (input.dataset.yaMenuImageValue === value && label.dataset.menuImageLabel) return;
  input.dataset.yaMenuImageValue = value;
  label.dataset.menuImageLabel = describeImageValue(value);
}

async function chooseMenuImage(input: HTMLInputElement, label: HTMLLabelElement) {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
  picker.style.display = "none";
  document.body.append(picker);

  const cleanup = () => picker.remove();
  picker.addEventListener("cancel", cleanup, { once: true });
  picker.addEventListener("change", async () => {
    const file = picker.files?.[0];
    cleanup();
    if (!file) return;

    label.dataset.menuImageBusy = "true";
    label.dataset.menuImageLabel = "Görsel hazırlanıyor…";
    input.setAttribute("aria-busy", "true");

    try {
      const dataUrl = await prepareMenuImage(file);
      applyReactInputValue(input, dataUrl);
      input.dataset.yaMenuImageValue = dataUrl;
      label.dataset.menuImageLabel = file.name;
      clearInputError(input);
      syncPreviewForInput(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Görsel hazırlanamadı.";
      showInputError(input, message);
      syncImagePickerLabel(input, label);
    } finally {
      delete label.dataset.menuImageBusy;
      input.removeAttribute("aria-busy");
    }
  }, { once: true });

  picker.click();
}

async function prepareMenuImage(file: File): Promise<string> {
  if (!isSupportedImage(file)) {
    throw new Error("JPG, PNG veya WebP biçiminde bir görsel seçin.");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Görsel çok büyük. En fazla 15 MB boyutunda bir dosya seçin.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const longestSide = Math.max(bitmap.width, bitmap.height);
    let scale = Math.min(1, 1400 / Math.max(1, longestSide));
    let quality = 0.84;
    let prepared: Blob | null = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Görsel işleme alanı açılamadı.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      prepared = await canvasToBlob(canvas, "image/webp", quality);
      if (prepared.size <= TARGET_IMAGE_BYTES) break;
      scale *= 0.82;
      quality = Math.max(0.62, quality - 0.07);
    }

    if (!prepared) throw new Error("Görsel dönüştürülemedi.");
    if (prepared.size > MAX_OUTPUT_IMAGE_BYTES) {
      throw new Error("Görsel menü için hâlâ çok büyük. Daha küçük bir görsel seçin.");
    }
    return blobToDataUrl(prepared);
  } finally {
    bitmap.close();
  }
}

function isSupportedImage(file: File) {
  if (SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Görsel dönüştürülemedi."));
    }, type, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Görsel okunamadı."));
    reader.onerror = () => reject(new Error("Görsel okunamadı."));
    reader.readAsDataURL(blob);
  });
}

function applyReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function describeImageValue(value: string) {
  const normalized = value.trim();
  if (!normalized) return "Görsel seçilmedi";
  if (normalized.startsWith("data:image/")) return "Kayıtlı ürün görseli";

  try {
    const url = new URL(normalized, window.location.href);
    const fileName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    return fileName || "Kayıtlı ürün görseli";
  } catch {
    const fileName = normalized.split(/[\\/]/).filter(Boolean).pop();
    return fileName || "Kayıtlı ürün görseli";
  }
}

function showInputError(input: HTMLInputElement, message: string) {
  input.setCustomValidity(message);
  input.reportValidity();
  window.setTimeout(() => clearInputError(input), 3500);
}

function clearInputError(input: HTMLInputElement) {
  input.setCustomValidity("");
}

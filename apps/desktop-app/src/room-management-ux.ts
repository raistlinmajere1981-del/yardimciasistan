const PANEL_ID = "room-management-settings-panel";
const PANEL_SELECTOR = `#${PANEL_ID}`;

interface RoomDraftData {
  id: string;
  name: string;
  number: string;
  nightlyPriceMinor: number;
}

type Cleanup = () => void;

let installedCleanup: Cleanup | null = null;
let ensureScheduled = false;
let ensureFrame = 0;

export function installRoomManagementUx(): Cleanup {
  if (installedCleanup) return installedCleanup;
  if (typeof document === "undefined") return () => undefined;

  const scheduleEnsure = () => {
    if (ensureScheduled) return;
    ensureScheduled = true;
    ensureFrame = window.requestAnimationFrame(() => {
      ensureScheduled = false;
      ensureFrame = 0;
      ensureRoomManagementPanel();
    });
  };

  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleEnsure();

  const cleanup = () => {
    observer.disconnect();
    if (ensureFrame) window.cancelAnimationFrame(ensureFrame);
    ensureFrame = 0;
    ensureScheduled = false;
    document.querySelector(PANEL_SELECTOR)?.remove();
    installedCleanup = null;
  };

  installedCleanup = cleanup;
  return cleanup;
}

function ensureRoomManagementPanel() {
  const grid = document.querySelector<HTMLElement>(".setup-shell.is-embedded .settings-basic-grid");
  if (!grid) return;

  let panel = document.querySelector<HTMLElement>(PANEL_SELECTOR);
  if (panel && panel.parentElement !== grid) {
    panel.remove();
    panel = null;
  }
  if (panel) {
    syncRoomCountInput(panel);
    return;
  }

  panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.className = "setup-section room-management-settings";
  panel.innerHTML = `
    <div class="setup-section-title room-management-heading">
      <div>
        <p>Pansiyon</p>
        <h2>Oda Yönetimi</h2>
      </div>
      <div class="room-management-toolbar">
        <label class="room-management-count-control">
          <span>Oda sayısı</span>
          <input class="room-management-count-input" inputmode="numeric" min="0" step="1" type="number" />
        </label>
        <span class="room-management-save-state" role="status"></span>
      </div>
    </div>
    <p class="setup-section-description">Oda adlarını ve yeni konaklamalarda kullanılacak gecelik fiyatları tek yerden yönetin.</p>
    <div class="room-management-list" aria-label="Oda adı ve fiyatları">
      <div class="room-management-loading">Odalar hazırlanıyor…</div>
    </div>
    <div class="room-management-footer">
      <span>Oda sayısı değişikliği üstteki “Ayarları Kaydet” düğmesiyle uygulanır. Fiyat değişikliği açık oda adisyonlarını etkilemez.</span>
      <button class="setup-primary room-management-save" type="button">Oda Bilgilerini Kaydet</button>
    </div>
  `;

  grid.append(panel);
  bindRoomCountInput(panel);
  panel.querySelector<HTMLButtonElement>(".room-management-save")?.addEventListener("click", () => void saveRoomProfiles(panel!));
  void loadRoomProfiles(panel);
}

function bindRoomCountInput(panel: HTMLElement) {
  const input = panel.querySelector<HTMLInputElement>(".room-management-count-input");
  if (!input || input.dataset.bound === "true") return;
  input.dataset.bound = "true";
  input.addEventListener("input", () => {
    const original = getOriginalRoomCountInput();
    if (!original) return;
    setNativeInputValue(original, input.value);
    original.dispatchEvent(new Event("input", { bubbles: true }));
    original.dispatchEvent(new Event("change", { bubbles: true }));
  });
  syncRoomCountInput(panel);
}

function syncRoomCountInput(panel: HTMLElement) {
  const source = getOriginalRoomCountInput();
  const target = panel.querySelector<HTMLInputElement>(".room-management-count-input");
  if (!source || !target || document.activeElement === target) return;
  if (target.value !== source.value) target.value = source.value;
}

function getOriginalRoomCountInput() {
  return document.querySelector<HTMLInputElement>(".setup-shell.is-embedded .settings-room-count input");
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
}

async function loadRoomProfiles(panel: HTMLElement) {
  const bridge = window.yardimciDesktop;
  const list = panel.querySelector<HTMLElement>(".room-management-list");
  if (!list) return;
  if (!bridge?.getRoomFolioData) {
    list.innerHTML = '<div class="room-management-loading">Oda bilgileri bu ortamda kullanılamıyor.</div>';
    return;
  }

  try {
    const data = await bridge.getRoomFolioData();
    if (!panel.isConnected) return;
    renderRoomRows(panel, data.rooms);
  } catch {
    if (!panel.isConnected) return;
    list.innerHTML = '<div class="room-management-loading is-error">Oda bilgileri yüklenemedi.</div>';
  }
}

function renderRoomRows(panel: HTMLElement, rooms: RoomDraftData[]) {
  const list = panel.querySelector<HTMLElement>(".room-management-list");
  if (!list) return;
  if (rooms.length === 0) {
    list.innerHTML = '<div class="room-management-loading">Henüz oda kaydı yok. Oda sayısını belirleyip ayarları kaydedin.</div>';
    return;
  }

  const header = document.createElement("div");
  header.className = "room-management-list-head";
  header.innerHTML = "<span>Oda</span><span>Oda adı</span><span>Gecelik fiyat</span>";
  list.replaceChildren(header, ...rooms.map((room) => createRoomRow(room)));
}

function createRoomRow(room: RoomDraftData) {
  const row = document.createElement("div");
  row.className = "room-management-row";
  row.dataset.roomId = room.id;

  const identity = document.createElement("div");
  identity.className = "room-management-identity";
  const number = document.createElement("strong");
  number.textContent = room.number ? `Oda ${room.number}` : "Oda";
  identity.append(number);

  const nameInput = document.createElement("input");
  nameInput.className = "room-management-name";
  nameInput.value = room.name;
  nameInput.maxLength = 120;
  nameInput.placeholder = "Örn. Bahçe Katı Standart Oda";
  nameInput.setAttribute("aria-label", `${number.textContent} adı`);

  const priceWrap = document.createElement("div");
  priceWrap.className = "room-management-price-wrap";
  const priceInput = document.createElement("input");
  priceInput.className = "room-management-price";
  priceInput.inputMode = "decimal";
  priceInput.value = minorToInput(room.nightlyPriceMinor);
  priceInput.placeholder = "0,00";
  priceInput.setAttribute("aria-label", `${number.textContent} gecelik fiyatı`);
  const currency = document.createElement("span");
  currency.textContent = "₺ / gece";
  priceWrap.append(priceInput, currency);

  row.append(identity, nameInput, priceWrap);
  return row;
}

async function saveRoomProfiles(panel: HTMLElement) {
  const bridge = window.yardimciDesktop;
  const saveButton = panel.querySelector<HTMLButtonElement>(".room-management-save");
  const state = panel.querySelector<HTMLElement>(".room-management-save-state");
  if (!bridge?.setRoomNightlyPrice || !bridge.getRoomFolioData || !saveButton || !state) return;

  const rows = Array.from(panel.querySelectorAll<HTMLElement>(".room-management-row"));
  const drafts = rows.map((row) => ({
    roomId: row.dataset.roomId ?? "",
    name: row.querySelector<HTMLInputElement>(".room-management-name")?.value.trim() ?? "",
    amountMinor: parseMoneyToMinor(row.querySelector<HTMLInputElement>(".room-management-price")?.value ?? "")
  }));

  const invalid = drafts.find((draft) => !draft.roomId || !draft.name || draft.amountMinor < 0);
  if (invalid) {
    state.className = "room-management-save-state is-error";
    state.textContent = !invalid.name ? "Oda adı boş bırakılamaz." : "Fiyatları kontrol edin.";
    return;
  }

  saveButton.disabled = true;
  state.className = "room-management-save-state is-saving";
  state.textContent = "Kaydediliyor…";

  try {
    for (const draft of drafts) {
      const input = {
        roomId: draft.roomId,
        amountMinor: draft.amountMinor,
        currency: "TRY",
        name: draft.name
      };
      const result = await bridge.setRoomNightlyPrice(input);
      if (!result.ok) throw new Error(result.message);
    }

    const fresh = await bridge.getRoomFolioData();
    if (!panel.isConnected) return;
    renderRoomRows(panel, fresh.rooms);
    state.className = "room-management-save-state is-success";
    state.textContent = "Oda bilgileri kaydedildi.";
  } catch (error) {
    if (!panel.isConnected) return;
    state.className = "room-management-save-state is-error";
    state.textContent = error instanceof Error && error.message ? error.message : "Oda bilgileri kaydedilemedi.";
  } finally {
    if (panel.isConnected) saveButton.disabled = false;
  }
}

function minorToInput(value: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, value) / 100);
}

function parseMoneyToMinor(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : -1;
}

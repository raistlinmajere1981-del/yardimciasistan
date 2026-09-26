export function normalizeInteger(value: number) {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

export function normalizeStringArray(value: string[]) {
  return value.map((item) => item.trim()).filter(Boolean);
}

export function normalizeRequestType(value: string) {
  const allowed = new Set([
    "general_info",
    "pension_reservation",
    "restaurant_reservation",
    "breakfast_request",
    "qr_menu_question",
    "location_question",
    "price_question",
    "other"
  ]);
  const requestType = value.trim();
  return allowed.has(requestType) ? requestType : "general_info";
}

export function normalizePriority(value: string) {
  const allowed = new Set(["low", "normal", "high", "urgent"]);
  const priority = value.trim();
  return allowed.has(priority) ? priority : "normal";
}

export function normalizeDateInput(value: string) {
  const date = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

export function normalizeTimeInput(value: string) {
  const time = value.trim();
  return /^\d{2}:\d{2}$/.test(time) ? time : "";
}

export function getCustomerTagsForSource(source: string) {
  if (source === "manual") {
    return ["manuel", "talep"];
  }

  if (source === "web_ai") {
    return ["web", "ai", "talep"];
  }

  if (source === "whatsapp") {
    return ["whatsapp", "talep"];
  }

  return ["web", "talep"];
}

export function buildManualRequestReply(customerName: string) {
  return `Merhaba ${customerName}, talebinizi aldık. Detayları kontrol edip size dönüş yapacağız.`;
}

export function normalizeStatus(value: string, allowed: string[]) {
  const status = value.trim();
  return allowed.includes(status) ? status : "";
}

export function normalizeUrl(value: string) {
  const url = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(url) ? url : "";
}

export function slugifyBusinessName(value: string) {
  return (
    value
      .trim()
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "firma"
  );
}

export function buildReservationTitle(request: Record<string, unknown>, reservationType: string) {
  const name = String(request.customer_name ?? "Misafir").trim() || "Misafir";
  const labels: Record<string, string> = {
    room: "oda rezervasyonu",
    table: "masa rezervasyonu",
    other: "rezervasyon"
  };

  return `${name} - ${labels[reservationType] ?? "rezervasyon"}`;
}

export function buildReservationNotes(request: Record<string, unknown>) {
  const message = String(request.message ?? "").trim();
  const summary = String(request.ai_summary ?? "").trim();
  const parts = [message, summary ? `AI özet: ${summary}` : ""].filter(Boolean);

  return parts.join("\n");
}

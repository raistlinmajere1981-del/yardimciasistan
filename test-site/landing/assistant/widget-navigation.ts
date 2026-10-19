import { ui } from "./site-language";
import {
  isRequestTypeAvailable,
  isWhatsAppAvailable,
  type WidgetConfig,
  type WidgetRequestType
} from "./widget-config";

export type WidgetView = "home" | "form" | "info" | "whatsapp" | "directions";
export type WidgetIntent =
  | "home"
  | "accommodation.reserve"
  | "accommodation.info"
  | "food.reserve"
  | "contact.whatsapp"
  | "info"
  | "directions";

export interface WidgetContext {
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  imageUrl?: string;
  sourcePath?: string;
  question?: string;
  address?: string;
  mapUrl?: string;
}

export interface WidgetOpenOptions {
  intent?: WidgetIntent;
  context?: WidgetContext;
}

export interface WidgetOpenState {
  view: WidgetView;
  requestType?: WidgetRequestType;
  context: WidgetContext | null;
  questionDraft: string;
}

export function resolveWidgetOpenOptions(
  options: WidgetOpenOptions,
  config: WidgetConfig
): WidgetOpenState {
  const intent = options.intent ?? "home";
  const context = normalizeWidgetContext(options.context);

  if (intent === "accommodation.reserve") {
    return isRequestTypeAvailable(config, "pension_reservation")
      ? { view: "form", requestType: "pension_reservation", context, questionDraft: "" }
      : homeState();
  }
  if (intent === "food.reserve") {
    return isRequestTypeAvailable(config, "restaurant_reservation")
      ? { view: "form", requestType: "restaurant_reservation", context, questionDraft: "" }
      : homeState();
  }
  if (intent === "contact.whatsapp") {
    return isWhatsAppAvailable(config)
      ? { view: "whatsapp", context, questionDraft: "" }
      : homeState();
  }
  if (intent === "directions") {
    return { view: "directions", context, questionDraft: context?.question ?? "" };
  }
  if (intent === "accommodation.info" || intent === "info") {
    if (!config.aiEnabled) return homeState();
    const name = String(context?.resourceName ?? "").trim();
    const question = String(context?.question ?? "").trim()
      || (name ? ui("{0} hakkında bilgi almak istiyorum.", {0: name}) : "");
    return { view: "info", context, questionDraft: question };
  }
  return { view: "home", context, questionDraft: "" };
}

function normalizeWidgetContext(value: WidgetContext | undefined): WidgetContext | null {
  if (!value) return null;
  const normalized: WidgetContext = {
    resourceType: String(value.resourceType ?? "").trim(),
    resourceId: String(value.resourceId ?? "").trim(),
    resourceName: String(value.resourceName ?? "").trim(),
    imageUrl: String(value.imageUrl ?? "").trim(),
    sourcePath: String(value.sourcePath ?? "").trim() || window.location.pathname,
    question: String(value.question ?? "").trim(),
    address: String(value.address ?? "").trim(),
    mapUrl: String(value.mapUrl ?? "").trim()
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

export function normalizeWidgetIntent(value: unknown): WidgetIntent | null {
  const intent = String(value ?? "").trim();
  return [
    "home",
    "accommodation.reserve",
    "accommodation.info",
    "food.reserve",
    "contact.whatsapp",
    "info",
    "directions"
  ].includes(intent)
    ? intent as WidgetIntent
    : null;
}

export function buildMapSearchUrl(address: string): string {
  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : "";
}

function homeState(): WidgetOpenState {
  return { view: "home", context: null, questionDraft: "" };
}

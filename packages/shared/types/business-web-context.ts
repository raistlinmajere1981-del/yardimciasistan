import type { PublicResourceMedia } from "./public-resource-media";
import type { BusinessAiContext } from "./business-ai-context";
import type { BusinessMapDisplayMode } from "./business-public-profile";

/** Public website projection adds presentation preferences to canonical public facts. */
export interface BusinessWebContext extends BusinessAiContext {
  dealerApplicationEnabled?: boolean;
  localization?: import("./public-translations").PublicLocalization;
  mapDisplayMode: BusinessMapDisplayMode;
  googleMapsEmbedUrl: string;
  gallery: PublicResourceMedia[];
}

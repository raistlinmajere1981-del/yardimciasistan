import { createNexaPresence, resolveNexaAsset, type NexaState } from "@yardimci-asistan/shared";
import manifest from "../../../assets/nexa/manifest.json";

const scriptUrl = document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : "";
export const widgetNexa = createNexaPresence({
  schedule: (callback, delay) => window.setTimeout(callback, delay),
  cancel: (handle) => window.clearTimeout(handle as number),
});

export function widgetNexaUrl(role: "launcher" | "welcome" | "header", state: NexaState, apiBaseUrl: string) {
  const key = role !== "header" ? role : state === "thinking" || state === "speaking" || state === "concerned" ? state : "ready";
  const asset = resolveNexaAsset(manifest, manifest.runtime.web[key]);
  if (scriptUrl) return new URL(asset.assetPath, new URL(".", scriptUrl)).href;
  return apiBaseUrl ? `${apiBaseUrl.replace(/\/$/, "")}/${asset.assetPath}` : asset.assetPath;
}

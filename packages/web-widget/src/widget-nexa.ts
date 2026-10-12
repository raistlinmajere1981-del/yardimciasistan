import { createNexaPresence, mountNexaRig, resolveNexaAsset, type NexaRigController, type NexaState } from "@yardimci-asistan/shared";
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

type Role = "launcher" | "welcome" | "header";
const roleSize: Record<Role, number> = { launcher: 48, welcome: 112, header: 32 };
let mounted: { role: Role; controller: NexaRigController }[] = [];
let fallbacks: { role: Role; image: HTMLImageElement }[] = [];

export function unmountWidgetNexa() {
  for (const { controller } of mounted) controller.unmount();
  mounted = [];
  fallbacks = [];
}

export function mountWidgetNexa(root: HTMLElement, apiBaseUrl: string) {
  for (const host of root.querySelectorAll<HTMLElement>("[data-nexa-role]")) {
    const role = host.dataset.nexaRole as Role;
    try {
      const controller = mountNexaRig(host, { state: widgetNexa.getState(), motion: false, size: roleSize[role] });
      mounted.push({ role, controller });
    } catch {
      const image = root.ownerDocument.createElement("img");
      image.alt = "";
      image.className = "ya-widget-nexa-fallback";
      image.src = widgetNexaUrl(role, widgetNexa.getState(), apiBaseUrl);
      host.replaceChildren(image);
      fallbacks.push({ role, image });
    }
  }
}

export function updateWidgetNexa(motion: boolean, apiBaseUrl: string) {
  const state = widgetNexa.getState();
  for (const { role, controller } of mounted) {
    controller.update({ state, motion: motion && role !== "launcher", size: roleSize[role] });
  }
  for (const { role, image } of fallbacks) {
    const url = widgetNexaUrl(role, state, apiBaseUrl);
    if (image.src !== url) image.src = url;
  }
}

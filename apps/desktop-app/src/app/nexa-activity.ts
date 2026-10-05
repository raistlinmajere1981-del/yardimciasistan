import { createNexaPresence } from "@yardimci-asistan/shared";

/** Renderer-only presentation state. No messages, payloads or domain state stored. */
export const desktopNexa = createNexaPresence({
  schedule: (callback, delay) => window.setTimeout(callback, delay),
  cancel: (handle) => window.clearTimeout(handle as number),
});

/** Observe the existing promise without changing its result or failure contract. */
export async function observeNexaAi<T extends { ok: boolean; fallback?: boolean }>(
  work: () => Promise<T>,
  completion: "response" | "success" = "response",
  isCurrent: () => boolean = () => true,
): Promise<T> {
  const settle = desktopNexa.begin();
  try {
    const result = await work();
    settle(!isCurrent() ? "cancel" : !result.ok || result.fallback ? "error" : completion);
    return result;
  } catch (error) {
    settle(isCurrent() ? "error" : "cancel");
    throw error;
  }
}

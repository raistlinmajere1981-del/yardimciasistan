/** Static Nexa presentation contracts; no domain operation or status ownership. */
export type NexaState = "ready" | "thinking" | "speaking" | "pleased" | "concerned";
export type NexaOutcome = "response" | "success" | "error" | "cancel";
export interface NexaAsset {
  state: string | null;
  usage: string;
  assetPath: string;
  format: string;
  theme: string;
  dimensions: { width: number; height: number };
}
export interface NexaSelection { usage: string; width?: number; state?: string; theme?: string }
export interface NexaManifest {
  assets: NexaAsset[];
  runtime: {
    stateAliases: Record<string, string>;
    desktop: Record<"wide" | "compact" | "micro", NexaSelection & { displaySize: number }>;
    web: Record<"launcher" | "welcome" | "ready" | "thinking" | "speaking" | "concerned", NexaSelection>;
  };
}

export function resolveNexaAsset(manifest: NexaManifest, selection: NexaSelection): NexaAsset {
  const state = selection.state && (manifest.runtime.stateAliases[selection.state] ?? selection.state);
  const asset = manifest.assets.find((entry) => entry.usage === selection.usage
    && (selection.width === undefined || entry.dimensions.width === selection.width)
    && (state === undefined || entry.state === state)
    && (selection.theme === undefined || entry.theme === selection.theme));
  if (!asset) throw new Error(`Nexa asset missing: ${JSON.stringify(selection)}`);
  return asset;
}

/** Finite presentation reactions. Concurrent work keeps thinking until all settle;
 * an older completion cannot replace the newest operation's outcome. */
export function createNexaPresence(clock: {
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
}) {
  let state: NexaState = "ready";
  let sequence = 0;
  let latestOutcome: NexaOutcome = "cancel";
  let timer: unknown;
  let active = false;
  const pending = new Set<number>();
  const listeners = new Set<() => void>();
  function clearTimer() { if (timer !== undefined) { clock.cancel(timer); timer = undefined; } }
  function publish(next: NexaState) {
    if (state === next) return;
    state = next;
    for (const listener of listeners) listener();
  }
  function react(outcome: NexaOutcome) {
    clearTimer();
    if (outcome === "error") { publish("concerned"); return; }
    if (!active || outcome === "cancel") { publish("ready"); return; }
    publish(outcome === "success" ? "pleased" : "speaking");
    timer = clock.schedule(() => { timer = undefined; publish("ready"); }, outcome === "success" ? 900 : 700);
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setActive(value: boolean) {
      active = value;
      if (!active) {
        clearTimer();
        if (state === "speaking" || state === "pleased") publish("ready");
      }
    },
    begin() {
      clearTimer();
      const id = ++sequence;
      latestOutcome = "cancel";
      pending.add(id);
      publish("thinking");
      let settled = false;
      return (outcome: NexaOutcome) => {
        if (settled) return;
        settled = true;
        if (!pending.delete(id)) return;
        if (id === sequence) latestOutcome = outcome;
        if (!pending.size) react(latestOutcome);
      };
    },
    reset() { clearTimer(); pending.clear(); sequence++; latestOutcome = "cancel"; publish("ready"); },
  };
}

import { mountNexaRig, type NexaRigController } from "@yardimci-asistan/shared";
import { ui } from "./site-language";

/** Scripted tour only. The shared rig owns movement, viewport suspension and reduced motion. */
export function installShowcaseAvatar() {
  const hosts = [...document.querySelectorAll<HTMLElement>("[data-showcase-avatar]")];
  if (!hosts.length) return;
  const style = document.createElement("style");
  style.textContent = `
    [data-showcase-avatar] { width:min(100%,var(--showcase-avatar-size,200px)); min-width:0; display:grid; justify-items:center; isolation:isolate; }
    [data-showcase-avatar] .showcase-avatar-speech-slot { display:grid; place-items:center; width:100%; min-height:100px; padding:0 0 15px; box-sizing:border-box; }
    [data-showcase-avatar] .showcase-avatar-speech { position:relative; width:100%; padding:12px 17px; box-sizing:border-box; border:1px solid #d0ded1; border-radius:12px; color:var(--ink,#172c2b); background:#fff; box-shadow:0 4px 15px #17382705; font-size:12px; line-height:1.7; text-align:center; overflow-wrap:anywhere; }
    [data-showcase-avatar] .showcase-avatar-speech::after { content:""; position:absolute; left:calc(50% - 5px); top:100%; width:10px; height:10px; background:inherit; border-right:inherit; border-bottom:inherit; transform:translateY(-5px) rotate(45deg); }
    [data-showcase-avatar] .showcase-avatar-stage { position:relative; width:min(100%,var(--showcase-avatar-size,240px)); padding-bottom:20px; }
    [data-showcase-avatar] .showcase-avatar-character { display:block; width:100%; aspect-ratio:1; }
    [data-showcase-avatar] .showcase-avatar-character img { width:100%; height:100%; display:block; object-fit:contain; }
    [data-showcase-avatar] .showcase-avatar-stage::after { content:""; position:absolute; bottom:5px; left:20%; width:60%; height:9px; background:radial-gradient(ellipse,rgba(18,45,70,.13),transparent 70%); border-radius:50%; }
  `;
  document.head.append(style);
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-nexa-message]")];
  const hardware = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const motion = !hardware.connection?.saveData && !(hardware.deviceMemory && hardware.deviceMemory <= 2)
    && !(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  let disposers: (() => void)[] = [];
  function mount() {
    if (disposers.length) return;
    disposers = hosts.map(host => {
      const requestedSize = Number(host.dataset.showcaseSize || 200);
      const size = Number.isFinite(requestedSize) ? Math.min(240, Math.max(112, requestedSize)) : 200;
      const fallbackSource = host.querySelector<HTMLImageElement>("img")?.src || "/assets/assistant/assets/nexa/states/nexa-ready-256.webp";
      host.style.setProperty("--showcase-avatar-size", `${size}px`);
      host.innerHTML = '<div class="showcase-avatar-speech-slot"><span class="showcase-avatar-speech" role="status" aria-live="polite" aria-atomic="true"></span></div><div class="showcase-avatar-stage" aria-hidden="true"><span class="showcase-avatar-character"></span></div>';
      const character = host.querySelector<HTMLElement>(".showcase-avatar-character")!;
      const speech = host.querySelector<HTMLElement>(".showcase-avatar-speech")!;
      speech.textContent = host.dataset.greeting || ui("Merhaba!");
      let controller: NexaRigController | undefined;
      try {
        controller = mountNexaRig(character, { state: "ready", motion, natural: true, size });
      } catch {
        const fallback = document.createElement("img");
        fallback.alt = "";
        fallback.src = fallbackSource;
        character.replaceChildren(fallback);
      }
      const hover = () => controller?.react("hover");
      character.addEventListener("pointerenter", hover);
      const speak = (event: Event) => {
        const button = event.currentTarget as HTMLButtonElement;
        speech.textContent = button.dataset.nexaMessage || "";
        for (const topic of buttons) topic.setAttribute("aria-pressed", String(topic === button));
        controller?.react("press");
      };
      for (const button of buttons) {
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", speak);
      }
      document.querySelector<HTMLElement>("[data-nexa-topics]")?.removeAttribute("hidden");
      return () => {
        character.removeEventListener("pointerenter", hover);
        for (const button of buttons) button.removeEventListener("click", speak);
        controller?.unmount();
      };
    });
  }
  mount();
  window.addEventListener("pagehide", () => { for (const dispose of disposers) dispose(); disposers = []; });
  window.addEventListener("pageshow", mount);
}

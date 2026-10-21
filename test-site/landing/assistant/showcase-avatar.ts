import { mountNexaRig, type NexaRigController } from "@yardimci-asistan/shared";
import { html } from "./site-language";
import { widgetNexaUrl } from "./widget-nexa";

/** A page greeting is presentation, never an AI request or business activity. */
export function installShowcaseAvatar() {
  const hosts = [...document.querySelectorAll<HTMLElement>("[data-showcase-avatar]")];
  if (!hosts.length) return;
  const style = document.createElement("style");
  style.textContent = `
    [data-showcase-avatar] { width:var(--showcase-avatar-size,200px); max-width:100%; min-width:0; display:grid; justify-items:center; overflow:hidden; isolation:isolate; }
    [data-showcase-avatar] .showcase-avatar-speech-slot { display:grid; place-items:center; width:100%; min-height:52px; padding:5px 8px 12px; box-sizing:border-box; }
    [data-showcase-avatar] .showcase-avatar-speech { position:relative; max-width:100%; padding:7px 12px; box-sizing:border-box; border:1px solid var(--line,#d7e4df); border-radius:14px; color:var(--ink,#172033); background:var(--paper,#fffdf8); box-shadow:0 3px 9px rgba(18,45,70,.08); font-size:13px; line-height:1.4; text-align:center; overflow-wrap:anywhere; animation:showcase-avatar-greeting 180ms ease-out both; }
    [data-showcase-avatar] .showcase-avatar-speech[hidden] { display:none; }
    [data-showcase-avatar] .showcase-avatar-speech::after { content:""; position:absolute; left:calc(50% - 4px); top:100%; width:8px; height:8px; background:inherit; border-right:inherit; border-bottom:inherit; transform:translateY(-4px) rotate(45deg); }
    [data-showcase-avatar] .showcase-avatar-stage { position:relative; width:100%; padding-bottom:22px; }
    [data-showcase-avatar] .showcase-avatar-character { display:block; width:100%; aspect-ratio:1; }
    [data-showcase-avatar] .showcase-avatar-character img { width:100%; height:100%; display:block; object-fit:contain; }
    [data-showcase-avatar] .showcase-avatar-stage::after { content:""; position:absolute; top:calc(100% - 14px); left:20%; width:60%; height:10px; background:radial-gradient(ellipse,rgba(18,45,70,.18),transparent 70%); border-radius:50%; }
    @keyframes showcase-avatar-greeting { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
    @media (prefers-reduced-motion:reduce) { [data-showcase-avatar] .showcase-avatar-speech { animation:none; } }
  `;
  document.head.append(style);
  let disposers: (() => void)[] = [];
  function mount() {
    if (disposers.length) return;
    disposers = hosts.map(host => {
      const requestedSize = Number(host.dataset.showcaseSize || 200);
      const size = Number.isFinite(requestedSize) ? Math.min(240, Math.max(112, requestedSize)) : 200;
      host.style.setProperty("--showcase-avatar-size", `${size}px`);
      host.innerHTML = `<div class="showcase-avatar-speech-slot"><span class="showcase-avatar-speech" role="status" hidden>${html("Merhaba!")}</span></div><div class="showcase-avatar-stage" aria-hidden="true"><span class="showcase-avatar-character"></span></div>`;
      const character = host.querySelector<HTMLElement>(".showcase-avatar-character")!;
      const speech = host.querySelector<HTMLElement>(".showcase-avatar-speech")!;
      let controller: NexaRigController | undefined;
      let greetingTimer = 0;
      let greeted = false;
      try {
        controller = mountNexaRig(character, { state: "ready", motion: true, natural: true, size });
      } catch {
        const fallback = document.createElement("img");
        fallback.alt = "";
        fallback.src = widgetNexaUrl("welcome", "ready", "");
        character.replaceChildren(fallback);
      }
      const hover = () => controller?.react("hover");
      character.addEventListener("pointerenter", hover);
      const greeting = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting || greeted) return;
        greeted = true;
        speech.hidden = false;
        controller?.react("press");
        greetingTimer = window.setTimeout(() => { speech.hidden = true; greetingTimer = 0; }, 3600);
        greeting.disconnect();
      });
      greeting.observe(host);
      return () => {
        window.clearTimeout(greetingTimer);
        greeting.disconnect();
        character.removeEventListener("pointerenter", hover);
        controller?.unmount();
      };
    });
  }
  mount();
  window.addEventListener("pagehide", () => { for (const dispose of disposers) dispose(); disposers = []; });
  window.addEventListener("pageshow", mount);
}

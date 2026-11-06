import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { mountNexaRig, nexaStatusMessages, resolveNexaAsset, type NexaRigController } from "@yardimci-asistan/shared";
import manifest from "../../../../../assets/nexa/manifest.json";
import { desktopNexa } from "../../app/nexa-activity";

type HabitatSize = "wide" | "compact" | "micro" | "hidden";

export function NexaHabitat({ collapsed }: { collapsed: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const rigHost = useRef<HTMLSpanElement>(null);
  const rig = useRef<NexaRigController | null>(null);
  const [rigFailed, setRigFailed] = useState(false);
  const [size, setSize] = useState<HabitatSize>("hidden");
  const [motionActive, setMotionActive] = useState(false);
  const [dark, setDark] = useState(false);
  const state = useSyncExternalStore(desktopNexa.subscribe, desktopNexa.getState);

  useLayoutEffect(() => {
    const sidebar = host.current?.parentElement;
    if (!sidebar) return;
    const brand = sidebar.querySelector<HTMLElement>(".brand")!;
    const navigation = sidebar.querySelector<HTMLElement>(".sidebar-primary-nav")!;
    const footer = sidebar.querySelector<HTMLElement>(".sidebar-footer-nav");
    function measure() {
      const style = getComputedStyle(sidebar!);
      const free = sidebar!.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        - brand.offsetHeight - navigation.scrollHeight - (footer?.offsetHeight ?? 0)
        - parseFloat(style.rowGap) * (footer ? 3 : 2);
      // Reserve the ground shadow below the artwork as well as the two-line
      // speech area. Match CSS token sizes so neither can cover navigation.
      const groundSpace = parseFloat(style.getPropertyValue("--space-6"));
      const microHeight = 40 + parseFloat(style.getPropertyValue("--space-4"));
      const compactHeight = 64 + groundSpace + parseFloat(style.getPropertyValue("--space-4"));
      const wideHeight = 112 + groundSpace + parseFloat(getComputedStyle(document.documentElement).fontSize) * 4.5;
      setSize(collapsed ? free >= microHeight ? "micro" : "hidden" : free >= wideHeight ? "wide" : free >= compactHeight ? "compact" : "hidden");
    }
    const observer = new ResizeObserver(measure);
    for (const element of [sidebar, brand, navigation, footer]) if (element) observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [collapsed]);

  useEffect(() => {
    const colorQuery = matchMedia("(prefers-color-scheme: dark)");
    const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    function update() {
      const root = document.documentElement;
      setDark(root.dataset.colorScheme === "dark" || root.dataset.colorScheme === "system" && colorQuery.matches);
      const active = size !== "hidden" && inView && document.visibilityState === "visible" && document.hasFocus();
      desktopNexa.setActive(active);
      setMotionActive(active && root.dataset.motion !== "reduced" && (root.dataset.motion === "full" || !motionQuery.matches));
    }
    const intersection = new IntersectionObserver(([entry]) => { inView = entry?.isIntersecting ?? false; update(); });
    if (host.current) intersection.observe(host.current);
    const appearance = new MutationObserver(update);
    appearance.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme", "data-motion"] });
    colorQuery.addEventListener("change", update);
    motionQuery.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    update();
    return () => {
      intersection.disconnect(); appearance.disconnect(); desktopNexa.setActive(false);
      colorQuery.removeEventListener("change", update); motionQuery.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update); window.removeEventListener("blur", update);
    };
  }, [size]);

  const visible = size !== "hidden";
  useLayoutEffect(() => {
    if (!visible || !rigHost.current) return;
    setRigFailed(false);
    try {
      rig.current = mountNexaRig(rigHost.current, { state: "ready", motion: false, size: 112, natural: true });
    } catch {
      // Manifest-backed artwork remains usable when inline SVG is unavailable.
      setRigFailed(true);
    }
    return () => { rig.current?.unmount(); rig.current = null; };
  }, [visible]);
  useLayoutEffect(() => {
    rig.current?.update({ state, motion: motionActive, size: size === "micro" ? 40 : size === "compact" ? 64 : 112, natural: true });
  }, [state, motionActive, size, visible]);

  // Notify modal paint geometry after React commits speech/visibility changes.
  // SVG rig animation changes paint only and does not emit layout notifications.
  useLayoutEffect(() => {
    host.current?.dispatchEvent(new Event("nexa:geometry-change", { bubbles: true }));
  }, [state, size, collapsed, rigFailed, motionActive, dark]);

  const mode = size === "hidden" ? "micro" : size;
  const rule = manifest.runtime.desktop[mode];
  const character = resolveNexaAsset(manifest, { ...rule, state });
  const theme = dark ? "dark" : "light";
  const shadow = resolveNexaAsset(manifest, { usage: mode === "micro" ? "micro-shadow" : "contact-shadow", theme });
  const url = (path: string) => `${import.meta.env.BASE_URL}${path}`;
  return (
    <div ref={host} className={`nexa-habitat nexa-habitat--${size}`} data-nexa-state={state} data-motion-active={motionActive}>
      {size !== "hidden" && <>
        <div className="nexa-scene-back" aria-hidden="true"><span className="nexa-scene-core" /><span className="nexa-scene-crystals" /><span className="nexa-scene-platform" /></div>
        {size === "wide" && <div className="nexa-speech-slot">
          {nexaStatusMessages[state] && <span className="nexa-habitat-speech" role="status" aria-atomic="true" aria-label={nexaStatusMessages[state]} key={state}>
            {state === "thinking" ? <>Düşünüyorum<span className="nexa-speech-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></> : nexaStatusMessages[state]}
          </span>}
        </div>}
        <div className="nexa-character-stage" aria-hidden="true">
          <img className="nexa-habitat-shadow" src={url(shadow.assetPath)} alt="" />
          <span ref={rigHost} className="nexa-character" aria-hidden="true" />
          {rigFailed && <img className="nexa-character nexa-character-fallback" src={url(character.assetPath)} alt="" decoding="async" />}
        </div>
      </>}
    </div>
  );
}

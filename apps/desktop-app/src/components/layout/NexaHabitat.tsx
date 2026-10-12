import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { mountNexaRig, resolveNexaAsset, type NexaRigController } from "@yardimci-asistan/shared";
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
      setSize(collapsed ? free >= 44 ? "micro" : "hidden" : free >= 154 ? "wide" : free >= 80 ? "compact" : "hidden");
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
      rig.current = mountNexaRig(rigHost.current, { state: "ready", motion: false, size: 112 });
    } catch {
      // Manifest-backed artwork remains usable when inline SVG is unavailable.
      setRigFailed(true);
    }
    return () => { rig.current?.unmount(); rig.current = null; };
  }, [visible]);
  useLayoutEffect(() => {
    rig.current?.update({ state, motion: motionActive, size: size === "micro" ? 40 : size === "compact" ? 64 : 112 });
  }, [state, motionActive, size, visible]);

  const mode = size === "hidden" ? "micro" : size;
  const rule = manifest.runtime.desktop[mode];
  const character = resolveNexaAsset(manifest, { ...rule, state });
  const theme = dark ? "dark" : "light";
  const shadow = resolveNexaAsset(manifest, { usage: mode === "micro" ? "micro-shadow" : "contact-shadow", theme });
  const url = (path: string) => `${import.meta.env.BASE_URL}${path}`;
  return (
    <div ref={host} className={`nexa-habitat nexa-habitat--${size}`} data-nexa-state={state} data-motion-active={motionActive} aria-hidden="true">
      {size !== "hidden" && <>
        <img className="nexa-habitat-shadow" src={url(shadow.assetPath)} alt="" />
        <span ref={rigHost} className="nexa-character" />
        {rigFailed && <img className="nexa-character nexa-character-fallback" src={url(character.assetPath)} alt="" decoding="async" />}
        {size === "wide" && state !== "ready" && <span className="nexa-habitat-speech">{state === "thinking" ? "Düşünüyorum…" : state === "speaking" ? "Yanıt hazır." : state === "pleased" ? "Tamamlandı." : "Bir sorun oldu."}</span>}
      </>}
    </div>
  );
}

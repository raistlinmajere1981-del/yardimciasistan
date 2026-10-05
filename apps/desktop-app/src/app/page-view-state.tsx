import { createContext, useCallback, useContext, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

/** Session-only presentation context. Never store entity snapshots, secrets or form drafts here.
 * The unlocked app owns this provider; lock/logout and a different business/database remount it.
 */
const PageViewState = createContext<Map<string, unknown> | null>(null);
export function PageViewStateProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new Map<string, unknown>());
  return <PageViewState.Provider value={store}>{children}</PageViewState.Provider>;
}

export function usePageViewState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(PageViewState);
  const [value, setValue] = useState<T>(() => store?.has(key) ? store.get(key) as T : typeof initial === "function" ? (initial as () => T)() : initial);
  const current = useRef(value);
  const update = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(current.current) : next;
    current.current = resolved;
    store?.set(key, resolved);
    setValue(resolved);
  }, [key, store]);
  return [value, update];
}

/** Restore only the intentional scroll owner, including after its async list is populated. */
export function usePageViewScroll<T extends HTMLElement = HTMLDivElement>(key: string, contentVersion?: unknown) {
  const store = useContext(PageViewState);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  return useCallback((element: T | null) => {
    cleanup.current?.(); cleanup.current = undefined;
    if (!element || !store) return;
    const saved = store.get(key) as { top: number; left: number } | undefined;
    let restoring = Boolean(saved);
    const persist = () => { if (!restoring) store.set(key, { top: element.scrollTop, left: element.scrollLeft }); };
    const restore = () => {
      if (!restoring || !saved) return;
      element.scrollTo({ top: saved.top, left: saved.left, behavior: "instant" });
      if (Math.abs(element.scrollTop - saved.top) < 1 && Math.abs(element.scrollLeft - saved.left) < 1) restoring = false;
    };
    const interact = () => { restoring = false; };
    const resize = new ResizeObserver(restore); resize.observe(element);
    for (const child of element.children) resize.observe(child);
    const frame = requestAnimationFrame(restore);
    element.addEventListener("scroll", persist, { passive: true });
    element.addEventListener("wheel", interact, { passive: true }); element.addEventListener("pointerdown", interact); element.addEventListener("keydown", interact);
    cleanup.current = () => {
      persist(); cancelAnimationFrame(frame); resize.disconnect();
      element.removeEventListener("scroll", persist); element.removeEventListener("wheel", interact); element.removeEventListener("pointerdown", interact); element.removeEventListener("keydown", interact);
    };
  }, [key, store, contentVersion]);
}

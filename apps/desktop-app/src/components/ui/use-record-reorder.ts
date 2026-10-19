import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/** @compiledSmoke scripts/smoke-menu-reorder-contract.mjs (transpiled source VM) */
export function moveRecordId(ids: string[], sourceId: string, targetId: string, position: "before" | "after"): string[] | null {
  if (!ids.includes(sourceId) || !ids.includes(targetId) || sourceId === targetId) return null;
  const next = ids.filter(id => id !== sourceId);
  next.splice(next.indexOf(targetId) + (position === "after" ? 1 : 0), 0, sourceId);
  return next;
}

/** Menu record sorting: one handle-based interaction for mouse, touch and keyboard. */
export function useRecordReorder<K extends string>({ getIds, canDrag, onReorder }: {
  getIds: (kind: K, sourceId: string) => string[];
  canDrag: (kind: K, id: string) => boolean;
  onReorder: (kind: K, orderedIds: string[], sourceId: string) => Promise<void>;
}) {
  const [dragging, setDragging] = useState<{ kind: K; id: string } | null>(null);
  const draggingRef = useRef<{ kind: K; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ kind: K; id: string; position: "before" | "after" } | null>(null);
  const targetRef = useRef<typeof dropTarget>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const busyRef = useRef(false);
  const suppressRowClickRef = useRef(false);
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);

  function reset() { draggingRef.current = null; targetRef.current = null; setDragging(null); setDropTarget(null); }
  function start(kind: K, id: string) {
    if (busyRef.current || !canDrag(kind, id)) return false;
    draggingRef.current = { kind, id }; setDragging({ kind, id });
    targetRef.current = null; setDropTarget(null); suppressRowClickRef.current = false;
    return true;
  }
  function target(kind: K, id: string, y: number, element: HTMLElement) {
    const active = draggingRef.current;
    if (!active || active.kind !== kind || active.id === id || !getIds(kind, active.id).includes(id)) { targetRef.current = null; setDropTarget(null); return false; }
    const bounds = element.getBoundingClientRect();
    const next = { kind, id, position: y < bounds.top + bounds.height / 2 ? "before" as const : "after" as const };
    targetRef.current = next; setDropTarget(next);
    return true;
  }
  async function persist(kind: K, sourceId: string, targetId: string, position: "before" | "after") {
    const ids = getIds(kind, sourceId);
    const ordered = moveRecordId(ids, sourceId, targetId, position);
    if (!ordered || busyRef.current || ordered.every((id, index) => id === ids[index])) return;
    busyRef.current = true; setReorderBusy(true);
    try { await onReorder(kind, ordered, sourceId); } finally { busyRef.current = false; setReorderBusy(false); }
  }
  function finishDrag() {
    reset(); suppressRowClickRef.current = true;
    window.setTimeout(() => { suppressRowClickRef.current = false; }, 0);
  }
  function handleKeyDown(event: KeyboardEvent<HTMLElement>, kind: K, id: string) {
    if (!["ArrowUp", "ArrowDown"].includes(event.key) || !canDrag(kind, id)) return;
    event.preventDefault(); event.stopPropagation();
    const ids = getIds(kind, id), index = ids.indexOf(id), nextId = ids[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (nextId) void persist(kind, id, nextId, event.key === "ArrowUp" ? "before" : "after");
  }
  function handlePointerDown(event: PointerEvent<HTMLElement>, kind: K, id: string) {
    if (event.button !== 0 || !start(kind, id)) return;
    pointerOrigin.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerTarget(x: number, y: number) {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-sort-id]");
    const active = draggingRef.current;
    if (active && element?.dataset.sortKind === active.kind && element.dataset.sortId)
      target(active.kind, element.dataset.sortId, y, element);
    else { targetRef.current = null; setDropTarget(null); }
  }
  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (!pointerOrigin.current || !draggingRef.current) return;
    if (Math.hypot(event.clientX - pointerOrigin.current.x, event.clientY - pointerOrigin.current.y) < 6) return;
    event.preventDefault();
    pointerTarget(event.clientX, event.clientY);
  }
  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (!pointerOrigin.current) return;
    const active = draggingRef.current;
    const moved = Math.hypot(event.clientX - pointerOrigin.current.x, event.clientY - pointerOrigin.current.y) >= 6;
    if (moved) pointerTarget(event.clientX, event.clientY);
    const selected = moved ? targetRef.current : null;
    pointerOrigin.current = null;
    finishDrag();
    if (active && selected) void persist(active.kind, active.id, selected.id, selected.position);
  }
  function handlePointerCancel() { pointerOrigin.current = null; reset(); }
  const handleProps = (kind: K, id: string) => ({
    disabled: reorderBusy || !canDrag(kind, id),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => handleKeyDown(event, kind, id),
    onPointerDown: (event: PointerEvent<HTMLElement>) => handlePointerDown(event, kind, id),
    onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, onPointerCancel: handlePointerCancel,
    onClick: (event: { stopPropagation: () => void }) => event.stopPropagation()
  });
  return { dragging, dropTarget, reorderBusy, suppressRowClickRef, handleProps, handleKeyDown,
    handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel };
}

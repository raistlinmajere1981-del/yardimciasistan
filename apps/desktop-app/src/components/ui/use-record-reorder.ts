import { useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";

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
  function handleDragStart(event: DragEvent<HTMLElement>, kind: K, id: string) {
    if (!start(kind, id)) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-yardimci-record-sort", JSON.stringify({ kind, id }));
    event.dataTransfer.setData("text/plain", id);
    const record = event.currentTarget.closest(".menu-sortable-record");
    if (record) { const rect = record.getBoundingClientRect(); event.dataTransfer.setDragImage(record, Math.max(0, Math.min(rect.width, event.clientX - rect.left)), Math.max(0, Math.min(rect.height, event.clientY - rect.top))); }
  }
  function handleDragOver(event: DragEvent<HTMLElement>, kind: K, id: string) {
    if (target(kind, id, event.clientY, event.currentTarget)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }
  }
  async function handleDrop(event: DragEvent<HTMLElement>, kind: K, id: string) {
    event.preventDefault(); event.stopPropagation();
    const active = draggingRef.current, selected = targetRef.current;
    reset();
    if (active?.kind === kind) await persist(kind, active.id, id, selected?.id === id ? selected.position : "before");
  }
  function handleKeyDown(event: KeyboardEvent<HTMLElement>, kind: K, id: string) {
    if (!["ArrowUp", "ArrowDown"].includes(event.key) || !canDrag(kind, id)) return;
    event.preventDefault(); event.stopPropagation();
    const ids = getIds(kind, id), index = ids.indexOf(id), nextId = ids[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (nextId) void persist(kind, id, nextId, event.key === "ArrowUp" ? "before" : "after");
  }
  function handlePointerDown(event: PointerEvent<HTMLElement>, kind: K, id: string) {
    if (event.pointerType === "mouse" || !start(kind, id)) return;
    pointerOrigin.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" || !pointerOrigin.current || !draggingRef.current) return;
    if (Math.hypot(event.clientX - pointerOrigin.current.x, event.clientY - pointerOrigin.current.y) < 8) return;
    event.preventDefault();
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-sort-id]");
    if (element?.dataset.sortKind && element.dataset.sortId) target(element.dataset.sortKind as K, element.dataset.sortId, event.clientY, element);
    else { targetRef.current = null; setDropTarget(null); }
  }
  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" || !pointerOrigin.current) return;
    const active = draggingRef.current, selected = targetRef.current;
    pointerOrigin.current = null; finishDrag();
    if (active && selected) void persist(active.kind, active.id, selected.id, selected.position);
  }
  const handleProps = (kind: K, id: string) => ({
    draggable: !reorderBusy && canDrag(kind, id),
    disabled: reorderBusy || !canDrag(kind, id),
    onDragStart: (event: DragEvent<HTMLElement>) => handleDragStart(event, kind, id),
    onDragEnd: finishDrag,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => handleKeyDown(event, kind, id),
    onPointerDown: (event: PointerEvent<HTMLElement>) => handlePointerDown(event, kind, id),
    onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, onPointerCancel: () => { pointerOrigin.current = null; finishDrag(); },
    onClick: (event: { stopPropagation: () => void }) => event.stopPropagation()
  });
  return { dragging, dropTarget, reorderBusy, suppressRowClickRef, handleProps, handleDragStart, handleDragOver, handleDrop, finishDrag,
    handleKeyDown, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel: () => { pointerOrigin.current = null; finishDrag(); } };
}

import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";
import { useInsideModalSurface } from "./ModalSurface";

type ConfirmRequest = Pick<ConfirmDialogProps, "title" | "description" | "details" | "tone" | "eyebrow" | "confirmLabel" | "cancelLabel">;

/** Local replacement for a blocking confirm. Unmount or a second request cancels safely. */
export function useConfirmDialog() {
  const insideModal = useInsideModalSurface();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const pending = useRef<((approved: boolean) => void) | null>(null);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  const confirm = useCallback((next: ConfirmRequest) => {
    if (pending.current) return Promise.resolve(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => { pending.current = resolve; });
  }, []);
  const settle = (approved: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(approved);
  };
  return { confirm, confirmDialog: request ? createElement(ConfirmDialog, {
    ...request,
    withinModal: insideModal,
    onConfirm: () => settle(true),
    onCancel: () => settle(false)
  }) : null };
}

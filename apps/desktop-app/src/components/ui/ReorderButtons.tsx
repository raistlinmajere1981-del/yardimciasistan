import { ArrowDown, ArrowUp } from "lucide-react";
import { IconButton } from "./IconButton";

/** Boundary availability and the actual reorder remain with the collection owner. */
export function ReorderButtons({ label, canMoveUp, canMoveDown, disabled = false, onMove }: {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled?: boolean;
  onMove: (direction: "up" | "down") => void;
}) {
  return <>
    <IconButton size="sm" disabled={disabled || !canMoveUp} aria-label={`${label} yukarı`} onClick={() => onMove("up")}>
      <ArrowUp size={14} aria-hidden="true" />
    </IconButton>
    <IconButton size="sm" disabled={disabled || !canMoveDown} aria-label={`${label} aşağı`} onClick={() => onMove("down")}>
      <ArrowDown size={14} aria-hidden="true" />
    </IconButton>
  </>;
}

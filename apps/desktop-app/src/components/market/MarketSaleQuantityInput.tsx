import { useEffect, useRef, useState } from "react";
import type { CommerceUnit } from "@yardimci-asistan/shared";

/** A quantity draft must not remove a cart line while the numeric field is being cleared. */
export function MarketSaleQuantityInput({ name, quantity, unit, disabled, onChange }: {
  name: string; quantity: number; unit: CommerceUnit; disabled: boolean; onChange: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState(String(quantity));
  const cancelled = useRef(false);
  useEffect(() => setDraft(String(quantity)), [quantity]);
  function commit() {
    const value = Number(draft.trim().replace(",", "."));
    if (!draft.trim() || !Number.isFinite(value) || Math.round(value * 10000) <= 0) { setDraft(String(quantity)); return; }
    onChange(value);
  }
  return <input role="spinbutton" inputMode={unit === "piece" || unit === "pack" || unit === "box" ? "numeric" : "decimal"}
    aria-label={`${name} miktarı`} aria-valuenow={quantity} aria-valuemin={0.0001} value={draft} disabled={disabled}
    onFocus={event => { cancelled.current = false; event.currentTarget.select(); }} onChange={event => setDraft(event.target.value)} onBlur={() => { if (!cancelled.current) commit(); }}
    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); cancelled.current = true; setDraft(String(quantity)); event.currentTarget.blur(); } }} />;
}

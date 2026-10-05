import type { ReactNode } from "react";
import { ActionButton } from "../ui/ActionButton";

/** Page views are navigation buttons, not entity workspace tabs. */
export function FeatureViewSelector<T extends string>({ items, value, onChange, label, disabled = false }: {
  items: readonly { id: T; label: string; icon?: ReactNode }[];
  value: NoInfer<T>;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return <nav className="page-tabs" aria-label={label}>
    {items.map(item => <ActionButton key={item.id} variant="quiet" className={value === item.id ? "is-active" : ""} disabled={disabled}
      aria-pressed={value === item.id} onClick={() => onChange(item.id)}>{item.icon}{item.label}</ActionButton>)}
  </nav>;
}

import { ActionButton } from "../ui/ActionButton";

/** Page views are navigation buttons, not entity workspace tabs. */
export function FeatureViewSelector<T extends string>({ items, value, onChange, label }: {
  items: readonly { id: T; label: string }[];
  value: NoInfer<T>;
  onChange: (value: T) => void;
  label: string;
}) {
  return <nav className="action-row" aria-label={label}>
    {items.map(item => <ActionButton key={item.id} variant={value === item.id ? "primary" : "secondary"}
      aria-pressed={value === item.id} onClick={() => onChange(item.id)}>{item.label}</ActionButton>)}
  </nav>;
}

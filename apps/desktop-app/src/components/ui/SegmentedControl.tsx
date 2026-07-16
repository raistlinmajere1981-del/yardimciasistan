import type { ReactNode } from "react";

export interface SegmentedControlOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: Array<SegmentedControlOption<T>>;
  value: T;
  ariaLabel: string;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, ariaLabel, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="segmented-control" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          className={value === option.id ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          key={option.id}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

interface ChoiceChipOption<T extends string> {
  id: T;
  label: string;
  title?: string;
  disabled?: boolean;
}

interface ChoiceChipsProps<T extends string> {
  options: Array<ChoiceChipOption<T>>;
  value: T;
  ariaLabel: string;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

export function ChoiceChips<T extends string>({
  options,
  value,
  ariaLabel,
  onChange,
  disabled = false,
  className = ""
}: ChoiceChipsProps<T>) {
  return (
    <div className={`choice-chips ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={active ? "is-active" : ""}
            aria-pressed={active}
            title={option.title}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

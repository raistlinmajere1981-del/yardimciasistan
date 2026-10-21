import { useEffect, useRef } from "react";

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
  horizontalWheel?: boolean;
}

export function ChoiceChips<T extends string>({
  options,
  value,
  ariaLabel,
  onChange,
  disabled = false,
  className = "",
  horizontalWheel = false
}: ChoiceChipsProps<T>) {
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = surface.current;
    if (!horizontalWheel || !element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(element).lineHeight) || 16 : event.deltaMode === 2 ? element.clientWidth : 1;
      const next = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + event.deltaY * unit));
      if (next === element.scrollLeft) return;
      event.preventDefault();
      element.scrollLeft = next;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [horizontalWheel]);
  return (
    <div ref={surface} className={`choice-chips ${className}`.trim()} role="group" aria-label={ariaLabel}>
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

import type { ChangeEvent, InputHTMLAttributes, Ref } from "react";

interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "value" | "defaultValue" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}

// Keep the editing separators accepted by shared normalizePhone. Full number
// validation and country-code normalization remain with the existing save flow.
const phoneCharacters = (value: string) => value.replace(/[^+\d\s()./-]/g, "");

export function PhoneInput({ value, onChange, ref, autoComplete = "tel", ...rest }: PhoneInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const raw = input.value;
    const next = phoneCharacters(raw);
    if (next !== raw) {
      const start = phoneCharacters(raw.slice(0, input.selectionStart ?? raw.length)).length;
      const end = phoneCharacters(raw.slice(0, input.selectionEnd ?? raw.length)).length;
      const direction = input.selectionDirection;
      input.value = next;
      input.setSelectionRange(start, end, direction ?? undefined);
    }
    if (next !== value) onChange(next);
  }

  return <input {...rest} ref={ref} type="tel" inputMode="tel" autoComplete={autoComplete}
    spellCheck={false} value={value} onChange={handleChange} />;
}

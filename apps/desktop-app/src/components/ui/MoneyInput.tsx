import { useCallback, type ChangeEvent, type ClipboardEvent, type InputHTMLAttributes, type Ref } from "react";
import {
  MONEY_INPUT_PLACEHOLDER,
  normalizePastedMoneyText,
  sanitizeMoneyKeystroke
} from "@yardimci-asistan/shared";

interface MoneyInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "min" | "max" | "step"
> {
  value: string;
  onChange: (next: string) => void;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Canonical controlled money field. Only Turkish plain-form editing text is
 * accepted ("1250,5"); letters, signs and extra separators are ignored at the
 * keystroke level, and pasted text is normalized ("125,50 TL" -> "125,5") or
 * ignored when it cannot be interpreted safely. The field never reformats
 * while typing, so the caret does not jump.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = MONEY_INPUT_PLACEHOLDER,
  ref,
  ...rest
}: MoneyInputProps) {
  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const next = sanitizeMoneyKeystroke(event.target.value);
    if (next === null) {
      // Rejected keystroke: restore the controlled value so invalid
      // characters never linger in the DOM.
      event.target.value = value;
      return;
    }
    if (next !== value) onChange(next);
  }, [onChange, value]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData?.getData("text") ?? "";
    const normalized = normalizePastedMoneyText(pasted);
    if (normalized !== null && normalized !== value) onChange(normalized);
  }, [onChange, value]);

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      onPaste={handlePaste}
    />
  );
}

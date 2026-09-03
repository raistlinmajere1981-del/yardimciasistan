export type BarcodeInputSource = "simulator" | "keyboard-wedge" | "camera-android";

export interface BarcodeScan {
  value: string;
  source: BarcodeInputSource;
  capturedAt: string;
}

export interface BarcodeInputAdapter {
  id: BarcodeInputSource;
  label: string;
  start: (onScan: (scan: BarcodeScan) => void) => () => void;
}

export interface BarcodeSimulatorAdapter extends BarcodeInputAdapter {
  submit: (value: string) => BarcodeScan | null;
}

export interface KeyboardBarcodeInputOptions {
  target?: Document;
  maxInterKeyMs?: number;
  terminatorWindowMs?: number;
  minLength?: number;
  maxLength?: number;
}

export function normalizeBarcodeValue(value: unknown, maxLength = 80) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function barcodeScan(value: string, source: BarcodeInputSource): BarcodeScan {
  return {
    value,
    source,
    capturedAt: new Date().toISOString()
  };
}

export function createBarcodeSimulatorAdapter(): BarcodeSimulatorAdapter {
  let listener: ((scan: BarcodeScan) => void) | null = null;

  return {
    id: "simulator",
    label: "Simülatör",
    start(onScan) {
      listener = onScan;
      return () => {
        if (listener === onScan) listener = null;
      };
    },
    submit(value) {
      const normalized = normalizeBarcodeValue(value);
      if (!normalized) return null;
      const scan = barcodeScan(normalized, "simulator");
      listener?.(scan);
      return scan;
    }
  };
}

export function createKeyboardBarcodeInputAdapter(
  options: KeyboardBarcodeInputOptions = {}
): BarcodeInputAdapter {
  const maxInterKeyMs = Math.max(10, options.maxInterKeyMs ?? 70);
  const terminatorWindowMs = Math.max(maxInterKeyMs, options.terminatorWindowMs ?? 120);
  const minLength = Math.max(1, options.minLength ?? 4);
  const maxLength = Math.max(minLength, options.maxLength ?? 80);

  return {
    id: "keyboard-wedge",
    label: "USB Klavye Okuyucu",
    start(onScan) {
      const target = options.target ?? document;
      let buffer = "";
      let lastKeyAt = 0;
      let sequenceStartedAt = 0;

      function reset() {
        buffer = "";
        lastKeyAt = 0;
        sequenceStartedAt = 0;
      }

      function handleKeyDown(event: KeyboardEvent) {
        if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) {
          return;
        }

        const now = performance.now();
        if (event.key === "Enter") {
          const normalized = normalizeBarcodeValue(buffer, maxLength);
          const terminatorIsFast = lastKeyAt > 0 && now - lastKeyAt <= terminatorWindowMs;
          if (terminatorIsFast && normalized.length >= minLength) {
            onScan(barcodeScan(normalized, "keyboard-wedge"));
          }
          reset();
          return;
        }

        if (event.key.length !== 1) return;

        if (!lastKeyAt || now - lastKeyAt > maxInterKeyMs) {
          buffer = event.key;
          sequenceStartedAt = now;
        } else {
          buffer += event.key;
        }
        lastKeyAt = now;

        if (buffer.length > maxLength) {
          buffer = buffer.slice(-maxLength);
          sequenceStartedAt = now;
        }

        const maximumSequenceMs = Math.max(terminatorWindowMs, maxInterKeyMs * Math.max(buffer.length, minLength));
        if (sequenceStartedAt && now - sequenceStartedAt > maximumSequenceMs) {
          buffer = event.key;
          sequenceStartedAt = now;
        }
      }

      target.addEventListener("keydown", handleKeyDown, true);
      return () => {
        target.removeEventListener("keydown", handleKeyDown, true);
        reset();
      };
    }
  };
}

/**
 * Camera/Android intentionally has no implementation in the desktop MVP.
 * The source value is reserved so a later adapter can emit the same BarcodeScan contract.
 */
export const CAMERA_ANDROID_BARCODE_SOURCE: BarcodeInputSource = "camera-android";

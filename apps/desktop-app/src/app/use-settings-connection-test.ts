import { useRef, useState } from "react";

/** Feedback is evidence for one draft, never authority to persist activation. */
export function useSettingsConnectionTest<Result extends { ok: boolean; message: string }>(configuration: unknown) {
  const signature = JSON.stringify(configuration);
  const [evidence, setEvidence] = useState<{ signature: string; result: Result } | null>(null);
  const [testing, setTesting] = useState(false);
  const inFlight = useRef(false);
  async function run(test: () => Promise<Result>): Promise<Result | undefined> {
    if (inFlight.current) return;
    inFlight.current = true;
    setTesting(true);
    setEvidence(null);
    try {
      const result = await test();
      setEvidence({ signature, result });
      return result;
    } finally { inFlight.current = false; setTesting(false); }
  }
  return { testing, result: evidence?.signature === signature ? evidence.result : null,
    run, clear: () => setEvidence(null) };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopDictationStatus } from "../../electron/desktop-dictation-contract";
import type { DesktopSetupData } from "../../electron/database";
import type { SettingsOperationResult } from "./settings-save";

/** Main owns persisted opt-in and verification; this resource owns only the Services draft. */
export function useDesktopDictationSettings(setupData: DesktopSetupData) {
  const [status, setStatus] = useState<DesktopDictationStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const draft = useRef(false), baseline = useRef(false), active = useRef(false), pending = useRef(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState("");
  const accept = useCallback((next: DesktopDictationStatus | null) => {
    if (!active.current) return;
    setStatus(next);
    if ((!next?.ready && draft.current) || draft.current === baseline.current) {
      draft.current = baseline.current = next?.enabled === true;
      setEnabled(draft.current);
    }
    setLoading(false);
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try { accept(await window.yardimciDesktop?.getDictationStatus?.() ?? null); }
    catch { accept(null); }
    finally { pending.current = false; }
  }, [accept]);
  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => { active.current = false; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => { setError(""); void refresh(); }, [refresh, setupData]);
  const change = (value: boolean) => {
    draft.current = value;
    setEnabled(value);
    setError("");
  };
  const save = async (): Promise<SettingsOperationResult> => {
    if (draft.current === baseline.current) return { ok: true, changed: false };
    setWorking("save"); setError("");
    try {
      const latest = await window.yardimciDesktop!.getDictationStatus();
      const result = await window.yardimciDesktop!.saveDictationEnabled(draft.current && latest.ready);
      if (!result.ok) { setError(result.message); return result; }
      draft.current = baseline.current = result.status.enabled;
      setEnabled(draft.current); setStatus(result.status);
      return { ok: true, changed: true };
    } catch {
      const message = "Masaüstü dikte tercihi kaydedilemedi.";
      setError(message); return { ok: false, message };
    } finally { setWorking(null); }
  };
  const test = async () => {
    setWorking("test"); setError("");
    try {
      const result = await window.yardimciDesktop!.testDictationConnection();
      if (!result.ok) setError(result.message);
      else accept(result.status);
    } catch { setError("STT bağlantısı doğrulanamadı"); }
    finally { await refresh(); setWorking(null); }
  };
  const discard = async () => {
    draft.current = baseline.current;
    setEnabled(draft.current); setError("");
    await refresh();
  };
  return { status, enabled, change, save, test, discard, error, loading,
    dirty: enabled !== baseline.current, busy: working !== null, testing: working === "test", saving: working === "save" };
}

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import type { DesktopSetupData, SaveInitialSetupInput } from "../../electron/database";
import { createSetupInput, toSetupForm, type SetupFormState } from "./setup-model";
import {
  copyCategory,
  isCategoryDirty,
  mergeSettingsCategory,
  stagedSettingsCategories,
  validateSettingsCategory
} from "./settings-draft-model";
import { settingsCategories, type StagedSettingsCategoryId } from "./settings-registry";
import type {
  SettingsOperationResult,
  SettingsSaveState,
  SettingsSetupSaveResult
} from "./settings-save";

type CategoryFeedback = { state: SettingsSaveState; message: string };

export function useSettingsDrafts(
  setupData: DesktopSetupData,
  persist: (input: SaveInitialSetupInput) => Promise<SettingsSetupSaveResult>
) {
  const [initial] = useState(() => toSetupForm(setupData));
  const [form, setForm] = useState(initial);
  const draftRef = useRef(initial);
  const canonicalRef = useRef(initial);
  const baselineRef = useRef(initial);
  const sourceRef = useRef(setupData);
  const savingRef = useRef(false);
  const [feedback, setFeedback] = useState<Partial<Record<StagedSettingsCategoryId, CategoryFeedback>>>({});
  const [busy, setBusy] = useState(false);

  const setDraft = useCallback((next: SetStateAction<SetupFormState>) => {
    const previous = draftRef.current;
    const value = typeof next === "function" ? next(previous) : next;
    draftRef.current = value;
    setForm(value);

    setFeedback((current) => {
      let changed = false;
      const nextFeedback = { ...current };
      for (const category of stagedSettingsCategories) {
        if (isCategoryDirty(value, previous, category) && nextFeedback[category]) {
          delete nextFeedback[category];
          changed = true;
        }
      }
      return changed ? nextFeedback : current;
    });
  }, []);

  const applyExternalSnapshot = useCallback((next: DesktopSetupData) => {
    const fresh = toSetupForm(next);

    // First-run generated sync secret is initialization state, not a new draft on each bootstrap.
    if (next.setupRequired && (!next.syncSecret || next.syncSecret === "change-this-secret")) {
      fresh.syncSecret = canonicalRef.current.syncSecret;
    }

    let nextDraft = draftRef.current;
    let nextBaseline = baselineRef.current;

    for (const category of stagedSettingsCategories) {
      if (!isCategoryDirty(nextDraft, nextBaseline, category)) {
        nextDraft = copyCategory(nextDraft, fresh, category);
        nextBaseline = copyCategory(nextBaseline, fresh, category);
      }
    }

    canonicalRef.current = fresh;
    baselineRef.current = nextBaseline;
    draftRef.current = nextDraft;
    setForm(nextDraft);
  }, []);

  const replaceWithCommittedSnapshot = useCallback((next: DesktopSetupData) => {
    const fresh = toSetupForm(next);
    canonicalRef.current = fresh;
    baselineRef.current = fresh;
    draftRef.current = fresh;
    setForm(fresh);
  }, []);

  useEffect(() => {
    if (sourceRef.current === setupData) return;
    sourceRef.current = setupData;
    applyExternalSnapshot(setupData);
  }, [applyExternalSnapshot, setupData]);

  const dirty = Object.fromEntries(
    stagedSettingsCategories.map((category) => [
      category,
      isCategoryDirty(form, baselineRef.current, category)
    ])
  ) as Record<StagedSettingsCategoryId, boolean>;

  function discard(category: StagedSettingsCategoryId) {
    if (savingRef.current) return;

    const next = copyCategory(draftRef.current, canonicalRef.current, category);
    baselineRef.current = copyCategory(baselineRef.current, canonicalRef.current, category);
    draftRef.current = next;
    setForm(next);
    setFeedback((current) => ({
      ...current,
      [category]: { state: "idle", message: "" }
    }));
  }

  async function save(category: StagedSettingsCategoryId): Promise<SettingsOperationResult> {
    if (savingRef.current) return { ok: false, message: "Ayarlar kaydediliyor." };
    if (!dirty[category]) return { ok: true, changed: false };

    savingRef.current = true;
    setBusy(true);

    const title = settingsCategories.find((item) => item.id === category)!.title;
    const report = (state: SettingsSaveState, message: string) => {
      setFeedback((current) => ({
        ...current,
        [category]: { state, message }
      }));
    };

    report("loading", `${title} kaydediliyor…`);

    try {
      const latest = await window.yardimciDesktop?.getSetupData?.();
      const latestCanonical = latest ? toSetupForm(latest) : canonicalRef.current;
      canonicalRef.current = latestCanonical;

      const merged = mergeSettingsCategory(latestCanonical, draftRef.current, category);
      const error = category !== "business" && !merged.businessName.trim()
        ? "Önce İşletme kategorisindeki firma adını kaydedin."
        : validateSettingsCategory(merged, category);

      if (error) {
        report("error", error);
        return { ok: false, message: error };
      }

      const result = await persist(createSetupInput(merged));
      if (!result.ok) {
        report("error", result.message);
        return { ok: false, message: result.message };
      }

      sourceRef.current = result.setupData;
      replaceWithCommittedSnapshot(result.setupData);

      const warning = result.refreshWarning
        || (merged.aiEnabled && (result.aiWebSync?.ok === false || result.businessContextWebSync?.ok === false)
          ? result.message
          : "");

      const message = warning
        ? `${title}: ${warning}`
        : `${title} kaydedildi.`;

      report(warning ? "error" : "success", message);
      return { ok: true, changed: true, message };
    } catch (error) {
      const message = error instanceof Error ? error.message : `${title} kaydedilemedi.`;
      report("error", message);
      return { ok: false, message };
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  return {
    form,
    setDraft,
    dirty,
    feedback,
    busy,
    save,
    discard,
    canonical: canonicalRef.current
  };
}

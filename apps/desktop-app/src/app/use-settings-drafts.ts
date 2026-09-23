import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import type { DesktopSetupData, SaveInitialSetupInput } from "../../electron/database";
import { createSetupInput, toSetupForm, type SetupFormState } from "./setup-model";
import { copyCategory, isCategoryDirty, mergeSettingsCategory, stagedSettingsCategories, unavailableSettingsFields, validateSettingsCategory } from "./settings-draft-model";
import { settingsCategories, type StagedSettingsCategoryId } from "./settings-registry";
import type { SettingsSaveState, SettingsSetupSaveResult } from "./settings-save";

type CategoryFeedback = { state: SettingsSaveState; message: string };
export function useSettingsDrafts(setupData: DesktopSetupData, persist: (input: SaveInitialSetupInput) => Promise<SettingsSetupSaveResult>) {
  const [initial] = useState(() => toSetupForm(setupData));
  const [form, setForm] = useState(initial);
  const draftRef = useRef(form);
  const canonical = useRef(initial);
  const baseline = useRef(initial);
  const saving = useRef(false);
  const [feedback, setFeedback] = useState<Partial<Record<StagedSettingsCategoryId, CategoryFeedback>>>({});
  const [busy, setBusy] = useState(false);
  const source = useRef(setupData);

  const setDraft = useCallback((next: SetStateAction<SetupFormState>) => {
    const value = typeof next === "function" ? next(draftRef.current) : next;
    const previous = draftRef.current;
    draftRef.current = value;
    setForm(value);
    setFeedback(current => Object.fromEntries(Object.entries(current).filter(([category]) =>
      !isCategoryDirty(value, previous, category as StagedSettingsCategoryId)
    )));
  }, []);

  const refresh = useCallback((next: DesktopSetupData, savedCategory?: StagedSettingsCategoryId, submitted?: SetupFormState) => {
    const fresh = toSetupForm(next);
    // The generated first-run secret is an initialization value, not a new draft on each bootstrap.
    if (next.setupRequired && (!next.syncSecret || next.syncSecret === "change-this-secret")) fresh.syncSecret = canonical.current.syncSecret;
    let draft = draftRef.current;
    let base = baseline.current;
    for (const category of stagedSettingsCategories) {
      const unchangedSinceSubmit = submitted && !isCategoryDirty(draft, submitted, category);
      if (!isCategoryDirty(draft, base, category) || (savedCategory === category && unchangedSinceSubmit)) {
        draft = copyCategory(draft, fresh, category);
        base = copyCategory(base, fresh, category);
      } else if (savedCategory === category) {
        // Edits made while a request was in flight remain pending against its committed result.
        base = copyCategory(base, fresh, category);
      }
    }
    if (savedCategory) {
      // Fields excluded by the persisted sector were not saved: keep their pending values and baseline.
      for (const key of unavailableSettingsFields(canonical.current, savedCategory)) {
        Object.assign(draft, { [key]: draftRef.current[key] });
        Object.assign(base, { [key]: baseline.current[key] });
      }
    }
    canonical.current = fresh;
    baseline.current = base;
    draftRef.current = draft;
    setForm(draft);
  }, []);

  useEffect(() => {
    if (source.current === setupData) return;
    source.current = setupData;
    refresh(setupData);
  }, [setupData, refresh]);

  const dirty = Object.fromEntries(stagedSettingsCategories.map(category => [category, isCategoryDirty(form, baseline.current, category)])) as Record<StagedSettingsCategoryId, boolean>;

  function discard(category: StagedSettingsCategoryId) {
    if (saving.current) return;
    baseline.current = copyCategory(baseline.current, canonical.current, category);
    setDraft(copyCategory(draftRef.current, canonical.current, category));
    setFeedback(current => ({ ...current, [category]: { state: "idle", message: "" } }));
  }

  async function save(category: StagedSettingsCategoryId) {
    if (saving.current || !dirty[category]) return;
    saving.current = true;
    setBusy(true);
    const title = settingsCategories.find(item => item.id === category)!.title;
    const report = (state: SettingsSaveState, message: string) => setFeedback(current => ({ ...current, [category]: { state, message } }));
    report("loading", `${title} kaydediliyor…`);
    try {
      // Use the existing read API immediately before full-save merge. Other pending categories are never serialized.
      const latest = await window.yardimciDesktop?.getSetupData?.();
      if (latest) refresh(latest);
      const submitted = draftRef.current;
      const merged = mergeSettingsCategory(canonical.current, submitted, category);
      const error = !merged.businessName.trim() && category !== "business"
        ? "Önce İşletme kategorisindeki firma adını kaydedin."
        : validateSettingsCategory(merged, category);
      if (error) { report("error", error); return; }
      const result = await persist(createSetupInput(merged));
      if (!result.ok) { report("error", result.message); return; }
      refresh(result.setupData, category, submitted);
      source.current = result.setupData;
      const warning = result.refreshWarning || (merged.aiEnabled && (result.aiWebSync?.ok === false || result.businessContextWebSync?.ok === false) ? result.message : "");
      const retained = isCategoryDirty(draftRef.current, baseline.current, category);
      report(warning ? "error" : "success", warning ? `${title}: ${warning}`
        : `${title} kaydedildi.${retained ? " Kaydedilmeyen yerel değişiklikler korunuyor." : ""}`);
    } catch (error) {
      report("error", error instanceof Error ? error.message : `${title} kaydedilemedi.`);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return { form, setDraft, dirty, feedback, busy, save, discard, canonical: canonical.current };
}

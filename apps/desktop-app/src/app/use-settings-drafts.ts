import { copySettingsFields, serviceSettingsFields, settingsFieldsDirty, type SetupServiceId } from './settings-service-fields';
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { getBusinessProfile, normalizeBusinessProfileOptions } from "@yardimci-asistan/shared";
import type { DesktopSetupData, SaveInitialSetupInput } from "../../electron/database";
import { createSetupInput, toSetupForm, type SetupFormState } from "./setup-model";
import {
  settingsFieldOwners,
  copyCategory,
  copyWebConnection,
  type WebConnectionSettings,
  isCategoryDirty,
  stagedSettingsCategories,
  validateSettingsCategory
} from "./settings-draft-model";
import type { StagedSettingsCategoryId } from "./settings-registry";
import type {
  SettingsOperationResult,
  SettingsSetupSaveResult
} from "./settings-save";

const usesWeb = (value: SetupFormState) => Boolean(value.webModuleUrl.trim() || value.syncSecret.trim());
const webKey = (value: WebConnectionSettings) => JSON.stringify([value.webModuleUrl.trim().replace(/\/+$/, ""), value.syncSecret.trim()]);

export function useSettingsDrafts(
  setupData: DesktopSetupData,
  persist: (input: SaveInitialSetupInput) => Promise<SettingsSetupSaveResult>
) {
  const [initial] = useState(() => toSetupForm(setupData));
  const [form, setForm] = useState(initial);
  const [webEnabled, setWebEnabled] = useState(() => usesWeb(initial));
  const webEnabledRef = useRef(webEnabled);
  const verifiedWeb = useRef("");
  const [webResetVersion, setWebResetVersion] = useState(0);
  function setWebActive(enabled: boolean) {
    webEnabledRef.current = enabled;
    setWebEnabled(enabled);
  }
  function markWebVerified(web: WebConnectionSettings | null) {
    verifiedWeb.current = web ? webKey(web) : "";
  }
  const draftRef = useRef(initial);
  const canonicalRef = useRef(initial);
  const baselineRef = useRef(initial);
  const sourceRef = useRef(setupData);
  const savingRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const setDraft = useCallback((next: SetStateAction<SetupFormState>) => {
    const previous = draftRef.current;
    let value = typeof next === "function" ? next(previous) : next;
    if (value.profileId !== previous.profileId) {
      value = { ...value, profileOptions: value.profileId === canonicalRef.current.profileId
        ? [...canonicalRef.current.profileOptions]
        : [...getBusinessProfile(value.profileId).defaultOptionalCapabilities] };
    }
    value = { ...value, profileOptions: normalizeBusinessProfileOptions(value.profileId, value.profileOptions) };
    if (webKey(value) !== webKey(previous)) verifiedWeb.current = "";
    draftRef.current = value;
    setForm(value);
  }, []);

  const applyExternalSnapshot = useCallback((next: DesktopSetupData, resetDraft = false) => {
    const fresh = toSetupForm(next);
    if (resetDraft) {
      // Clean start owns a new form; never resurrect a secret or pending fields.
      canonicalRef.current = fresh;
      baselineRef.current = fresh;
      draftRef.current = fresh;
      webEnabledRef.current = usesWeb(fresh);
      setWebEnabled(webEnabledRef.current);
      verifiedWeb.current = "";
      setWebResetVersion(version => version + 1);
      setForm(fresh);
      return;
    }

    const webDirty = webEnabledRef.current !== usesWeb(baselineRef.current) || JSON.stringify([draftRef.current.webModuleUrl, draftRef.current.syncSecret, draftRef.current.autoSyncEnabled])
      !== JSON.stringify([baselineRef.current.webModuleUrl, baselineRef.current.syncSecret, baselineRef.current.autoSyncEnabled]);
    let nextDraft = webDirty ? draftRef.current : copyWebConnection(draftRef.current, fresh);
    let nextBaseline = webDirty ? baselineRef.current : copyWebConnection(baselineRef.current, fresh);
    if (!webDirty) {
      webEnabledRef.current = usesWeb(fresh);
      setWebEnabled(webEnabledRef.current);
    }

    // Each service is an independent owner even while another service is dirty.
    for (const fields of [settingsFieldOwners.business, ...Object.values(serviceSettingsFields)]) {
      if (!settingsFieldsDirty(nextDraft, nextBaseline, fields)) {
        nextDraft = copySettingsFields(nextDraft, fresh, fields);
        nextBaseline = copySettingsFields(nextBaseline, fresh, fields);
      }
    }

    canonicalRef.current = fresh;
    baselineRef.current = nextBaseline;
    draftRef.current = nextDraft;
    setForm(nextDraft);
  }, []);

  function acceptCommitted(next: DesktopSetupData, fields: readonly (keyof SetupFormState)[]) {
    const fresh = toSetupForm(next);
    applyExternalSnapshot(next);
    baselineRef.current = copySettingsFields(baselineRef.current, fresh, fields);
    draftRef.current = copySettingsFields(draftRef.current, fresh, fields);
    setForm(draftRef.current);
  }

  useEffect(() => {
    if (sourceRef.current === setupData) return;
    const resetDraft = !sourceRef.current.setupRequired && setupData.setupRequired;
    sourceRef.current = setupData;
    applyExternalSnapshot(setupData, resetDraft);
  }, [applyExternalSnapshot, setupData]);

  const dirty = Object.fromEntries(
    stagedSettingsCategories.map((category) => [
      category,
      isCategoryDirty(form, baselineRef.current, category)
        || (category === "business" && (webEnabled !== usesWeb(baselineRef.current) ||
          JSON.stringify([form.webModuleUrl, form.syncSecret, form.autoSyncEnabled]) !==
          JSON.stringify([baselineRef.current.webModuleUrl, baselineRef.current.syncSecret, baselineRef.current.autoSyncEnabled])))
    ])
  ) as Record<StagedSettingsCategoryId, boolean>;

  function discardBusiness() {
    if (savingRef.current) return;

    const categoryDraft = copyCategory(draftRef.current, canonicalRef.current, "business");
    const next = copyWebConnection(categoryDraft, canonicalRef.current);
    setWebActive(usesWeb(canonicalRef.current));
    verifiedWeb.current = "";
    setWebResetVersion(version => version + 1);
    baselineRef.current = copyCategory(baselineRef.current, canonicalRef.current, "business");
    baselineRef.current = copyWebConnection(baselineRef.current, canonicalRef.current);
    draftRef.current = next;
    setForm(next);
  }

  async function saveBusiness(): Promise<SettingsOperationResult> {
    if (savingRef.current) return { ok: false, message: "Ayarlar kaydediliyor." };
    if (!dirty.business && !setupData.setupRequired) return { ok: true, changed: false };

    savingRef.current = true;
    setBusy(true);

    const title = "İşletme";

    try {
      const latest = await window.yardimciDesktop?.getSetupData?.();
      const latestCanonical = latest ? toSetupForm(latest) : canonicalRef.current;
      canonicalRef.current = latestCanonical;

      const categoryDraft = copyCategory(latestCanonical, draftRef.current, "business");
      const merged = copyWebConnection(categoryDraft, webEnabledRef.current ? draftRef.current
        : { webModuleUrl: "", syncSecret: "", autoSyncEnabled: false });
      const needsWebVerification = webEnabledRef.current && (setupData.setupRequired || latest?.setupRequired
        || !usesWeb(latestCanonical) || webKey(merged) !== webKey(latestCanonical));
      if (needsWebVerification && (!merged.webModuleUrl.trim() || !merged.syncSecret.trim())) {
        return { ok: false, message: "Web adresini ve güvenlik anahtarını girip Bağlan ile doğrulayın." };
      }
      if (needsWebVerification && verifiedWeb.current !== webKey(merged)) {
        return { ok: false, message: "Web bağlantısını Bağlan ile doğrulayın, ardından Kaydet düğmesini kullanın." };
      }
      const error = validateSettingsCategory(merged, "business");

      if (error) {
        return { ok: false, message: error };
      }

      const result = await persist(createSetupInput(merged));
      if (!result.ok) {
        return { ok: false, message: result.message };
      }

      sourceRef.current = result.setupData;
      acceptCommitted(result.setupData, [...settingsFieldOwners.business, "webModuleUrl", "syncSecret", "autoSyncEnabled"]);

      setWebActive(usesWeb(toSetupForm(result.setupData)));

      const warning = result.refreshWarning
        || ((result.aiWebSync?.ok === false || result.businessContextWebSync?.ok === false)
          ? result.message
          : "");

      const message = warning
        ? `${title}: ${warning}`
        : `${title} kaydedildi.`;

      return { ok: true, changed: true, message };
    } catch (error) {
      const message = error instanceof Error ? error.message : `${title} kaydedilemedi.`;
      return { ok: false, message };
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  function serviceDirty(id: SetupServiceId) {
    return settingsFieldsDirty(form, baselineRef.current, serviceSettingsFields[id]);
  }

  function discardService(id: SetupServiceId) {
    if (savingRef.current) return;
    const fields = serviceSettingsFields[id];
    baselineRef.current = copySettingsFields(baselineRef.current, canonicalRef.current, fields);
    draftRef.current = copySettingsFields(draftRef.current, canonicalRef.current, fields);
    setForm(draftRef.current);
  }

  async function saveService(id: SetupServiceId): Promise<SettingsOperationResult> {
    if (savingRef.current) return { ok: false, message: "Ayarlar kaydediliyor." };
    if (!serviceDirty(id)) return { ok: true, changed: false };
    savingRef.current = true;
    setBusy(true);
    try {
      const latest = await window.yardimciDesktop?.getSetupData?.();
      if (!latest || latest.setupRequired) return { ok: false, message: "Önce işletme kurulumunu tamamlayın." };
      const fields = serviceSettingsFields[id];
      const merged = copySettingsFields(toSetupForm(latest), draftRef.current, fields);
      const error = validateSettingsCategory(merged, "services");
      if (error) return { ok: false, message: error };
      const result = await persist(createSetupInput(merged));
      if (!result.ok) return result;
      sourceRef.current = result.setupData;
      acceptCommitted(result.setupData, fields);
      return { ok: true, changed: true, message: result.refreshWarning || result.message || "Servis ayarları kaydedildi." };
    } catch {
      return { ok: false, message: "Servis ayarları kaydedilemedi. Tekrar deneyin." };
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  return {
    form,
    setDraft,
    dirty,
    busy,
    saveBusiness,
    webEnabled,
    webResetVersion,
    setWebActive,
    markWebVerified,
    saveService,
    discardService,
    serviceDirty,
    discardBusiness,
    canonical: canonicalRef.current
  };
}

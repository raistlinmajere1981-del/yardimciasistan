import { useCallback, useEffect, useRef, useState } from "react";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import type {
  DesktopFinanceCategory,
  DesktopFinanceData,
  DesktopFinanceEntry,
  FinanceDirection,
  FinancePaymentMethod
} from "../../electron/finance";
import type { DesktopRoomFolioData } from "../../electron/room-folio";
import { runtimeHasCapability } from "./capabilities";

const EMPTY_FINANCE_DATA: DesktopFinanceData = {
  generatedAt: "",
  currency: "TRY",
  todayIncomeMinor: 0,
  todayExpenseMinor: 0,
  todayNetMinor: 0,
  outstandingPensionMinor: 0,
  recentEntries: [],
  pensionBalances: [],
  categories: []
};

const EMPTY_FINANCE_ROOM_DATA: DesktopRoomFolioData = {
  generatedAt: "",
  rooms: [],
  activeStays: [],
  folios: [],
  menuCategories: [],
  menuItems: []
};

export interface FinanceEntryDraft {
  mode: FinanceDirection | null;
  amount: string;
  category: string;
  paymentMethod: FinancePaymentMethod;
  description: string;
  date: string;
}

type FinanceMutationType = "save" | "delete" | "category-save" | "category-delete";

interface FinanceMutationLock {
  id: number;
  type: FinanceMutationType;
  targetId: string;
  epoch: number;
}

function todayDateInput(): string {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
}

function emptyDraft(): FinanceEntryDraft {
  return {
    mode: null,
    amount: "",
    category: "other_expense",
    paymentMethod: "cash",
    description: "",
    date: todayDateInput()
  };
}

function parseMoneyToMinor(value: string): number {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return 0;
  let normalized = compact;
  if (compact.includes(",")) normalized = compact.replace(/\./g, "").replace(",", ".");
  else if ((compact.match(/\./g) ?? []).length > 1) normalized = compact.replace(/\./g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : -1;
}

function dateInputToTimestamp(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return date.toISOString();
}

function financeCategoryAvailable(
  category: DesktopFinanceCategory,
  accommodationEnabled: boolean,
  foodServiceEnabled: boolean
) {
  if (!category.isActive) return false;
  if (category.id === "pension") return accommodationEnabled;
  if (category.id === "restaurant") return foodServiceEnabled;
  return true;
}

function financeCategoriesForMode(
  categories: DesktopFinanceCategory[],
  mode: FinanceDirection,
  accommodationEnabled: boolean,
  foodServiceEnabled: boolean
) {
  return categories.filter((category) => (
    category.direction === mode
    && financeCategoryAvailable(category, accommodationEnabled, foodServiceEnabled)
  ));
}

function defaultCategoryForMode(
  categories: DesktopFinanceCategory[],
  mode: FinanceDirection,
  accommodationEnabled: boolean,
  foodServiceEnabled: boolean
) {
  const options = financeCategoriesForMode(categories, mode, accommodationEnabled, foodServiceEnabled);
  const preferredId = mode === "income" ? "other_income" : "other_expense";
  return options.find((category) => category.id === preferredId)?.id ?? options[0]?.id ?? "";
}

export function useFinanceController({
  businessCapabilities,
  active,
  enabled = true
}: {
  businessCapabilities: BusinessCapabilitySnapshot | null;
  active: boolean;
  enabled?: boolean;
}) {
  const bridge = window.yardimciDesktop;
  const C = BUSINESS_CAPABILITIES;
  const financeEnabled = runtimeHasCapability(businessCapabilities, C.FINANCE);
  const accommodationFolioEnabled = runtimeHasCapability(businessCapabilities, C.ACCOMMODATION_FOLIO);
  const accommodationEnabled = (
    runtimeHasCapability(businessCapabilities, C.ACCOMMODATION_ROOMS)
    || runtimeHasCapability(businessCapabilities, C.ACCOMMODATION_RESERVATIONS)
    || runtimeHasCapability(businessCapabilities, C.ACCOMMODATION_STAYS)
    || accommodationFolioEnabled
  );
  const foodServiceEnabled = (
    runtimeHasCapability(businessCapabilities, C.FOOD_TABLES)
    || runtimeHasCapability(businessCapabilities, C.FOOD_RESERVATIONS)
    || runtimeHasCapability(businessCapabilities, C.FOOD_ORDERS)
    || runtimeHasCapability(businessCapabilities, C.FOOD_MENU)
  );

  const [data, setData] = useState<DesktopFinanceData>(EMPTY_FINANCE_DATA);
  const [roomData, setRoomData] = useState<DesktopRoomFolioData>(EMPTY_FINANCE_ROOM_DATA);
  const [loading, setLoading] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<FinanceEntryDraft>(emptyDraft);
  const [mutationType, setMutationType] = useState<FinanceMutationType | null>(null);

  const enabledRef = useRef(enabled);
  const financeEnabledRef = useRef(financeEnabled);
  const folioEnabledRef = useRef(accommodationFolioEnabled);
  const activeRef = useRef(active);
  const financeLoadGeneration = useRef(0);
  const roomLoadGeneration = useRef(0);
  const financeEpoch = useRef(0);
  const mutationSequence = useRef(0);
  const mutationInFlight = useRef<FinanceMutationLock | null>(null);
  const refreshAfterMutation = useRef(false);

  enabledRef.current = enabled;
  financeEnabledRef.current = financeEnabled;
  folioEnabledRef.current = accommodationFolioEnabled;
  activeRef.current = active;

  const refreshFinanceData = useCallback(async () => {
    if (!enabledRef.current || !financeEnabledRef.current || !bridge?.getFinanceData) return;
    if (mutationInFlight.current) {
      refreshAfterMutation.current = true;
      return;
    }
    const request = ++financeLoadGeneration.current;
    setLoading(true);
    try {
      const next = await bridge.getFinanceData(100);
      if (
        request !== financeLoadGeneration.current
        || !enabledRef.current
        || !financeEnabledRef.current
      ) return;
      setData(next);
    } catch {
      if (
        request === financeLoadGeneration.current
        && enabledRef.current
        && financeEnabledRef.current
      ) {
        setMessage("Kasa bilgileri hazırlanamadı.");
      }
    } finally {
      if (
        request === financeLoadGeneration.current
        && enabledRef.current
        && financeEnabledRef.current
      ) {
        setLoading(false);
      }
    }
  }, [bridge]);

  const refreshRoomData = useCallback(async () => {
    if (!enabledRef.current || !folioEnabledRef.current || !bridge?.getRoomFolioData) return;
    const request = ++roomLoadGeneration.current;
    setRoomLoading(true);
    try {
      const next = await bridge.getRoomFolioData();
      if (
        request !== roomLoadGeneration.current
        || !enabledRef.current
        || !folioEnabledRef.current
      ) return;
      setRoomData(next);
    } catch {
      // Finance mutation success remains authoritative even when this projection refresh fails.
    } finally {
      if (
        request === roomLoadGeneration.current
        && enabledRef.current
        && folioEnabledRef.current
      ) {
        setRoomLoading(false);
      }
    }
  }, [bridge]);

  const acquireMutation = useCallback((type: FinanceMutationType, targetId = "") => {
    if (!enabledRef.current || !financeEnabledRef.current || mutationInFlight.current) return null;
    const lock: FinanceMutationLock = {
      id: ++mutationSequence.current,
      type,
      targetId,
      epoch: financeEpoch.current
    };
    mutationInFlight.current = lock;
    financeLoadGeneration.current += 1;
    setLoading(false);
    setMutationType(type);
    return lock;
  }, [accommodationEnabled, data.categories, foodServiceEnabled]);

  const releaseMutation = useCallback((lock: FinanceMutationLock) => {
    if (mutationInFlight.current?.id !== lock.id) return;
    mutationInFlight.current = null;
    setMutationType(null);
    const shouldRefresh = refreshAfterMutation.current;
    refreshAfterMutation.current = false;
    if (
      shouldRefresh
      && activeRef.current
      && enabledRef.current
      && financeEnabledRef.current
    ) {
      void refreshFinanceData();
    }
  }, [refreshFinanceData]);

  const openEntry = useCallback((mode: FinanceDirection) => {
    if (!enabledRef.current || !financeEnabledRef.current || mutationInFlight.current) return false;
    setDraft({
      mode,
      amount: "",
      category: defaultCategoryForMode(data.categories, mode, accommodationEnabled, foodServiceEnabled),
      paymentMethod: "cash",
      description: "",
      date: todayDateInput()
    });
    setMessage("");
    return true;
  }, []);

  const closeEntry = useCallback(() => {
    if (mutationInFlight.current) return false;
    setDraft(emptyDraft());
    return true;
  }, []);

  const updateDraft = useCallback((patch: Partial<Omit<FinanceEntryDraft, "mode">>) => {
    if (mutationInFlight.current) return false;
    setDraft((current) => ({ ...current, ...patch }));
    return true;
  }, []);

  const saveEntry = useCallback(async () => {
    if (!draft.mode || !bridge?.saveManualFinanceEntry) return false;
    const amountMinor = parseMoneyToMinor(draft.amount);
    if (amountMinor <= 0) {
      setMessage("Geçerli bir tutar girin.");
      return false;
    }
    const occurredAt = dateInputToTimestamp(draft.date);
    if (!occurredAt) {
      setMessage("Tarihi GG.AA.YYYY biçiminde girin.");
      return false;
    }

    const lock = acquireMutation("save");
    if (!lock) return false;
    const payload = {
      direction: draft.mode,
      amountMinor,
      paymentMethod: draft.paymentMethod,
      category: draft.category,
      description: draft.description,
      occurredAt
    } as const;

    try {
      const result = await bridge.saveManualFinanceEntry(payload);
      const sameOperation = mutationInFlight.current?.id === lock.id;
      if (!sameOperation) return result.ok;

      const contextCurrent = (
        lock.epoch === financeEpoch.current
        && enabledRef.current
        && financeEnabledRef.current
      );
      if (contextCurrent) setMessage(result.message);

      if (result.ok) {
        if (contextCurrent) {
          financeLoadGeneration.current += 1;
          setData(result.data);
        } else {
          refreshAfterMutation.current = true;
        }
        setDraft((current) => current.mode ? emptyDraft() : current);
        if (folioEnabledRef.current) void refreshRoomData();
      }
      return result.ok;
    } catch {
      if (
        mutationInFlight.current?.id === lock.id
        && lock.epoch === financeEpoch.current
        && enabledRef.current
        && financeEnabledRef.current
      ) {
        setMessage("Kasa hareketi kaydedilemedi.");
      }
      return false;
    } finally {
      releaseMutation(lock);
    }
  }, [acquireMutation, bridge, draft, refreshRoomData, releaseMutation]);

  const saveCategory = useCallback(async (direction: FinanceDirection, name: string) => {
    if (!bridge?.saveFinanceCategory) return false;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setMessage("Tür adı gerekli.");
      return false;
    }
    const lock = acquireMutation("category-save");
    if (!lock) return false;
    try {
      const result = await bridge.saveFinanceCategory({ direction, name: normalizedName });
      const sameOperation = mutationInFlight.current?.id === lock.id;
      if (!sameOperation) return result.ok;
      const contextCurrent = (
        lock.epoch === financeEpoch.current
        && enabledRef.current
        && financeEnabledRef.current
      );
      if (contextCurrent) setMessage(result.message);
      if (result.ok) {
        if (contextCurrent) {
          financeLoadGeneration.current += 1;
          setData(result.data);
          const activeOptions = financeCategoriesForMode(
            result.data.categories,
            direction,
            accommodationEnabled,
            foodServiceEnabled
          );
          const created = activeOptions.find((category) => category.name.toLocaleLowerCase("tr-TR") === normalizedName.toLocaleLowerCase("tr-TR"));
          if (created && draft.mode === direction) {
            setDraft((current) => current.mode === direction ? { ...current, category: created.id } : current);
          }
        } else {
          refreshAfterMutation.current = true;
        }
      }
      return result.ok;
    } catch {
      if (
        mutationInFlight.current?.id === lock.id
        && lock.epoch === financeEpoch.current
        && enabledRef.current
        && financeEnabledRef.current
      ) setMessage("Tür eklenemedi.");
      return false;
    } finally {
      releaseMutation(lock);
    }
  }, [
    accommodationEnabled,
    acquireMutation,
    bridge,
    draft.mode,
    foodServiceEnabled,
    releaseMutation
  ]);

  const deleteCategory = useCallback(async (category: DesktopFinanceCategory) => {
    if (category.isSystem || !bridge?.deleteFinanceCategory) return false;
    const lock = acquireMutation("category-delete", category.id);
    if (!lock) return false;
    try {
      const result = await bridge.deleteFinanceCategory(category.id);
      const sameOperation = mutationInFlight.current?.id === lock.id;
      if (!sameOperation) return result.ok;
      const contextCurrent = (
        lock.epoch === financeEpoch.current
        && enabledRef.current
        && financeEnabledRef.current
      );
      if (contextCurrent) setMessage(result.message);
      if (result.ok) {
        if (contextCurrent) {
          financeLoadGeneration.current += 1;
          setData(result.data);
          if (draft.mode === category.direction && draft.category === category.id) {
            const fallback = defaultCategoryForMode(
              result.data.categories,
              category.direction,
              accommodationEnabled,
              foodServiceEnabled
            );
            setDraft((current) => (
              current.mode === category.direction && current.category === category.id
                ? { ...current, category: fallback }
                : current
            ));
          }
        } else {
          refreshAfterMutation.current = true;
        }
      }
      return result.ok;
    } catch {
      if (
        mutationInFlight.current?.id === lock.id
        && lock.epoch === financeEpoch.current
        && enabledRef.current
        && financeEnabledRef.current
      ) setMessage("Tür kaldırılamadı.");
      return false;
    } finally {
      releaseMutation(lock);
    }
  }, [
    accommodationEnabled,
    acquireMutation,
    bridge,
    draft.category,
    draft.mode,
    foodServiceEnabled,
    releaseMutation
  ]);

  const deleteManualEntry = useCallback(async (entry: DesktopFinanceEntry) => {
    if (entry.sourceType !== "manual" || !bridge?.deleteManualFinanceEntry) return false;
    const lock = acquireMutation("delete", entry.id);
    if (!lock) return false;
    try {
      const result = await bridge.deleteManualFinanceEntry(entry.id);
      const sameOperation = mutationInFlight.current?.id === lock.id;
      if (!sameOperation) return result.ok;

      const contextCurrent = (
        lock.epoch === financeEpoch.current
        && enabledRef.current
        && financeEnabledRef.current
      );
      if (contextCurrent) setMessage(result.message);
      if (result.ok) {
        if (contextCurrent) {
          financeLoadGeneration.current += 1;
          setData(result.data);
        } else {
          refreshAfterMutation.current = true;
        }
      }
      return result.ok;
    } catch {
      if (
        mutationInFlight.current?.id === lock.id
        && lock.epoch === financeEpoch.current
        && enabledRef.current
        && financeEnabledRef.current
      ) {
        setMessage("Kasa hareketi kaldırılamadı.");
      }
      return false;
    } finally {
      releaseMutation(lock);
    }
  }, [acquireMutation, bridge, releaseMutation]);

  useEffect(() => {
    financeEpoch.current += 1;
    financeLoadGeneration.current += 1;
    setLoading(false);
    if (!financeEnabled) {
      setData(EMPTY_FINANCE_DATA);
      setMessage("");
      setDraft(emptyDraft());
    }
  }, [enabled, financeEnabled]);

  useEffect(() => {
    if (enabled && financeEnabled && active) void refreshFinanceData();
  }, [active, enabled, financeEnabled, refreshFinanceData]);

  useEffect(() => {
    roomLoadGeneration.current += 1;
    setRoomLoading(false);
    if (!enabled || !accommodationFolioEnabled) {
      setRoomData(EMPTY_FINANCE_ROOM_DATA);
    }
  }, [accommodationFolioEnabled, enabled]);

  useEffect(() => {
    if (enabled && accommodationFolioEnabled && active) void refreshRoomData();
  }, [active, accommodationFolioEnabled, enabled, refreshRoomData]);

  useEffect(() => {
    if (!draft.mode || mutationInFlight.current) return;
    const options = financeCategoriesForMode(
      data.categories,
      draft.mode,
      accommodationEnabled,
      foodServiceEnabled
    );
    if (options.some((category) => category.id === draft.category)) return;
    const fallback = defaultCategoryForMode(
      data.categories,
      draft.mode,
      accommodationEnabled,
      foodServiceEnabled
    );
    setDraft((current) => current.mode ? { ...current, category: fallback } : current);
  }, [
    accommodationEnabled,
    data.categories,
    draft.category,
    draft.mode,
    foodServiceEnabled,
    mutationType
  ]);

  return {
    data,
    roomData,
    loading,
    roomLoading,
    message,
    setMessage,
    draft,
    mutationType,
    saving: mutationType !== null,
    mutationInFlight,
    financeEnabled,
    accommodationEnabled,
    accommodationFolioEnabled,
    foodServiceEnabled,
    openEntry,
    closeEntry,
    updateDraft,
    saveEntry,
    saveCategory,
    deleteCategory,
    deleteManualEntry,
    refreshFinanceData,
    refreshRoomData
  };
}

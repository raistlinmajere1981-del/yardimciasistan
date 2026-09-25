import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ROOM_PUBLIC_DETAIL_LIMITS,
  formatMinorToInput as minorToInput,
  normalizeRoomPublicFeatures,
  normalizeTableCategoryInputs,
  parseMoneyToMinor,
  type RoomPublicFeatureId
} from "@yardimci-asistan/shared";
import type {
  BusinessLayoutRoom,
  BusinessLayoutSnapshot,
  SaveBusinessLayoutInput
} from "../../electron/business-layout";
import type { SettingsOperationResult } from "./settings-save";

export interface BusinessLayoutRoomDraft {
  key: string;
  id: string;
  name: string;
  number: string;
  capacity: number;
  bedInfo: string;
  floor: string;
  features: RoomPublicFeatureId[];
  description: string;
  priceNote: string;
  price: string;
  currency: string;
  canRemove: boolean;
  removeBlockReason: string;
}

interface BusinessLayoutTableCategoryDraft {
  key: string;
  sourceName: string;
  name: string;
  tableCount: string;
}

export interface BusinessLayoutDraft {
  rooms: BusinessLayoutRoomDraft[];
  tableCategories: BusinessLayoutTableCategoryDraft[];
  capabilities: BusinessLayoutSnapshot["capabilities"];
}

let localKeySequence = 0;
function nextLocalKey(prefix: string) {
  localKeySequence += 1;
  return `${prefix}-${localKeySequence}`;
}

export function useBusinessLayoutSettings(options: {
  enabled: boolean;
  onDashboardRefresh?: () => Promise<unknown>;
}) {
  const { enabled, onDashboardRefresh } = options;
  const [draft, setDraftState] = useState<BusinessLayoutDraft>(() => emptyDraft());
  const draftRef = useRef(draft);
  const baselineRef = useRef(draft);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "success" | "error">("idle");

  const applyCanonical = useCallback((snapshot: BusinessLayoutSnapshot) => {
    const next = snapshotToDraft(snapshot);
    baselineRef.current = next;
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const load = useCallback(async () => {
    if (!enabled) {
      const next = emptyDraft();
      baselineRef.current = next;
      draftRef.current = next;
      setDraftState(next);
      setLoading(false);
      setState("idle");
      setMessage("");
      return;
    }
    const bridge = window.yardimciDesktop;
    if (!bridge?.getBusinessLayout) {
      setLoading(false);
      setState("error");
      setMessage("İşletme düzeni bu ortamda kullanılamıyor.");
      return;
    }
    setLoading(true);
    try {
      const snapshot = await bridge.getBusinessLayout();
      applyCanonical(snapshot);
      setState("idle");
      setMessage("");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error && error.message ? error.message : "İşletme düzeni yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [applyCanonical, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const setDraft = useCallback((recipe: (current: BusinessLayoutDraft) => BusinessLayoutDraft) => {
    const next = recipe(draftRef.current);
    draftRef.current = next;
    setDraftState(next);
    if (state !== "idle") {
      setState("idle");
      setMessage("");
    }
  }, [state]);

  const dirty = useMemo(
    () => comparableDraft(draft) !== comparableDraft(baselineRef.current),
    [draft]
  );

  const updateRoom = useCallback((key: string, patch: Partial<BusinessLayoutRoomDraft>) => {
    setDraft((current) => ({
      ...current,
      rooms: current.rooms.map((room) => room.key === key ? { ...room, ...patch } : room)
    }));
  }, [setDraft]);

  const addRoom = useCallback(() => {
    setDraft((current) => ({
      ...current,
      rooms: [
        ...current.rooms,
        {
          key: nextLocalKey("room"),
          id: "",
          name: "Yeni Oda",
          number: "",
          capacity: 2,
          bedInfo: "1 çift kişilik yatak",
          floor: "",
          features: [],
          description: "",
          priceNote: "",
          price: "0,00",
          currency: "TRY",
          canRemove: true,
          removeBlockReason: ""
        }
      ]
    }));
  }, [setDraft]);

  const removeRoom = useCallback((key: string) => {
    const room = draftRef.current.rooms.find((candidate) => candidate.key === key);
    if (!room) return;
    if (!room.canRemove) {
      setState("error");
      setMessage(room.removeBlockReason || "Bu oda şu anda kaldırılamaz.");
      return;
    }
    setDraft((current) => ({
      ...current,
      rooms: current.rooms.filter((candidate) => candidate.key !== key)
    }));
  }, [setDraft]);

  const updateTableCategory = useCallback((key: string, field: "name" | "tableCount", value: string) => {
    setDraft((current) => ({
      ...current,
      tableCategories: current.tableCategories.map((category) =>
        category.key === key ? { ...category, [field]: value } : category
      )
    }));
  }, [setDraft]);

  const addTableCategory = useCallback(() => {
    setDraft((current) => ({
      ...current,
      tableCategories: [
        ...current.tableCategories,
        { key: nextLocalKey("table-category"), sourceName: "", name: "", tableCount: "1" }
      ]
    }));
  }, [setDraft]);

  const removeTableCategory = useCallback((key: string) => {
    setDraft((current) => ({
      ...current,
      tableCategories: current.tableCategories.filter((category) => category.key !== key)
    }));
  }, [setDraft]);

  const validate = useCallback((): string | null => {
    if (loading) return "İşletme düzeni yükleniyor.";

    if (draftRef.current.capabilities.rooms) {
      for (const room of draftRef.current.rooms) {
        if (!room.name.trim()) return "Oda adı boş bırakılamaz.";
        if (room.name.trim().length > ROOM_PUBLIC_DETAIL_LIMITS.name) return "Oda adı çok uzun.";
        if (!Number.isInteger(room.capacity) || room.capacity < 1 || room.capacity > 100) {
          return "Oda kapasitesi 1 ile 100 arasında olmalı.";
        }
        if (parseMoneyToMinor(room.price) === null) return "Oda fiyatlarını kontrol edin.";
      }
    }

    if (draftRef.current.capabilities.tables) {
      const result = normalizeTableCategoryInputs(
        draftRef.current.tableCategories.map((category) => ({
          sourceName: category.sourceName,
          name: category.name,
          tableCount: Number(category.tableCount)
        }))
      );
      if (!result.ok) return result.message;
    }

    return null;
  }, [loading]);

  const save = useCallback(async (): Promise<SettingsOperationResult> => {
    if (savingRef.current || !enabled) return { ok: true, changed: false };
    const validationMessage = validate();
    if (validationMessage) {
      setState("error");
      setMessage(validationMessage);
      return { ok: false, message: validationMessage };
    }
    if (comparableDraft(draftRef.current) === comparableDraft(baselineRef.current)) {
      return { ok: true, changed: false };
    }

    const bridge = window.yardimciDesktop;
    if (!bridge?.saveBusinessLayout) {
      const errorMessage = "İşletme düzeni bu ortamda kullanılamıyor.";
      setState("error");
      setMessage(errorMessage);
      return { ok: false, message: errorMessage };
    }

    savingRef.current = true;
    setSaving(true);
    setMessage("İşletme düzeni kaydediliyor…");
    try {
      const current = draftRef.current;
      const input: SaveBusinessLayoutInput = {
        rooms: current.capabilities.rooms
          ? current.rooms.map((room) => ({
              id: room.id || undefined,
              clientKey: room.id ? undefined : room.key,
              name: room.name,
              number: room.number,
              capacity: room.capacity,
              bedInfo: room.bedInfo,
              floor: room.floor,
              features: room.features,
              description: room.description,
              priceNote: room.priceNote,
              // validate() rejects blank/invalid prices before save, so the
              // fallback below is unreachable in practice.
              nightlyPriceMinor: parseMoneyToMinor(room.price) ?? 0,
              currency: room.currency
            }))
          : undefined,
        tableCategories: current.capabilities.tables
          ? current.tableCategories.map((category) => ({
              sourceName: category.sourceName,
              name: category.name,
              tableCount: Number(category.tableCount)
            }))
          : undefined
      };
      const result = await bridge.saveBusinessLayout(input);
      if (!result.ok) {
        setState("error");
        setMessage(result.message);
        return { ok: false, message: result.message };
      }

      applyCanonical(result.layout);
      await onDashboardRefresh?.();
      setState("success");
      setMessage(result.message);
      return { ok: true, changed: true, message: result.message };
    } catch (error) {
      const errorMessage = error instanceof Error && error.message
        ? error.message
        : "İşletme düzeni kaydedilemedi.";
      setState("error");
      setMessage(errorMessage);
      return { ok: false, message: errorMessage };
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [applyCanonical, enabled, onDashboardRefresh, validate]);

  const discard = useCallback(() => {
    if (savingRef.current) return;
    const next = cloneDraft(baselineRef.current);
    draftRef.current = next;
    setDraftState(next);
    setState("idle");
    setMessage("");
  }, []);

  return {
    draft,
    dirty,
    loading,
    saving,
    state,
    message,
    updateRoom,
    addRoom,
    removeRoom,
    updateTableCategory,
    addTableCategory,
    removeTableCategory,
    save,
    discard,
    refresh: load
  };
}

function snapshotToDraft(snapshot: BusinessLayoutSnapshot): BusinessLayoutDraft {
  return {
    rooms: snapshot.rooms.map(toRoomDraft),
    tableCategories: snapshot.tableCategories.map((category) => ({
      key: nextLocalKey("table-category"),
      sourceName: category.name,
      name: category.name,
      tableCount: String(category.tableCount)
    })),
    capabilities: { ...snapshot.capabilities }
  };
}

function toRoomDraft(room: BusinessLayoutRoom): BusinessLayoutRoomDraft {
  return {
    key: room.id,
    id: room.id,
    name: room.name,
    number: room.number,
    capacity: room.capacity,
    bedInfo: room.bedInfo,
    floor: room.floor,
    features: normalizeRoomPublicFeatures(room.features),
    description: room.description,
    priceNote: room.priceNote,
    price: minorToInput(room.nightlyPriceMinor),
    currency: room.currency,
    canRemove: room.canRemove,
    removeBlockReason: room.removeBlockReason
  };
}

function emptyDraft(): BusinessLayoutDraft {
  return {
    rooms: [],
    tableCategories: [],
    capabilities: { rooms: false, tables: false }
  };
}

function cloneDraft(value: BusinessLayoutDraft): BusinessLayoutDraft {
  return {
    rooms: value.rooms.map((room) => ({ ...room, features: [...room.features] })),
    tableCategories: value.tableCategories.map((category) => ({ ...category })),
    capabilities: { ...value.capabilities }
  };
}

function comparableDraft(value: BusinessLayoutDraft): string {
  return JSON.stringify({
    rooms: value.rooms.map((room) => ({
      id: room.id,
      name: room.name.trim(),
      number: room.number.trim(),
      capacity: room.capacity,
      bedInfo: room.bedInfo.trim(),
      floor: room.floor.trim(),
      features: normalizeRoomPublicFeatures(room.features),
      description: room.description.trim(),
      priceNote: room.priceNote.trim(),
      priceMinor: parseMoneyToMinor(room.price),
      currency: room.currency
    })),
    tableCategories: value.tableCategories.map((category) => ({
      sourceName: category.sourceName,
      name: category.name.trim(),
      tableCount: Number(category.tableCount)
    })),
    capabilities: value.capabilities
  });
}

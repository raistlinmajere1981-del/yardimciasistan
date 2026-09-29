import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ROOM_PUBLIC_DETAIL_LIMITS,
  TABLE_PUBLIC_DETAIL_LIMITS,
  formatMinorToInput as minorToInput,
  normalizeRoomPublicFeatures,
  normalizeTableCategoryInputs,
  normalizeTablePublicFeatures,
  normalizeTableSmokingPolicy,
  parseMoneyToMinor,
  type RoomPublicFeatureId,
  type TablePublicFeatureId,
  type TableSmokingPolicy
} from "@yardimci-asistan/shared";
import type {
  BusinessLayoutRoom,
  BusinessLayoutSnapshot,
  BusinessLayoutTable,
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
  outOfService: boolean;
  canRemove: boolean;
  removeBlockReason: string;
}

export interface BusinessLayoutTableDraft {
  key: string;
  id: string;
  name: string;
  area: string;
  capacity: number;
  description: string;
  features: TablePublicFeatureId[];
  smokingPolicy: TableSmokingPolicy;
  sortOrder: number;
}

interface BusinessLayoutTableCategoryDraft {
  key: string;
  sourceName: string;
  name: string;
  tableCount: string;
}

export interface BusinessLayoutDraft {
  rooms: BusinessLayoutRoomDraft[];
  tables: BusinessLayoutTableDraft[];
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
  const [mediaDirty, setMediaDirty] = useState(false);
  const [mediaRevision, setMediaRevision] = useState(0);
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
      setMediaDirty(false);
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
      const [snapshot, mediaState] = await Promise.all([
        bridge.getBusinessLayout(),
        bridge.getRoomMediaDraftState?.() ?? Promise.resolve({ dirty: false })
      ]);
      applyCanonical(snapshot);
      setMediaDirty(mediaState.dirty);
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
    () => comparableDraft(draft) !== comparableDraft(baselineRef.current) || mediaDirty,
    [draft, mediaDirty]
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
          outOfService: false,
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

  const updateTable = useCallback((key: string, patch: Partial<BusinessLayoutTableDraft>) => {
    setDraft((current) => ({
      ...current,
      tables: current.tables.map((table) => table.key === key ? { ...table, ...patch } : table)
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
      for (const table of draftRef.current.tables) {
        if (!Number.isInteger(table.capacity) || table.capacity < 1 || table.capacity > 100) {
          return "Masa kapasitesi 1 ile 100 arasında olmalı.";
        }
        if (table.description.trim().length > TABLE_PUBLIC_DETAIL_LIMITS.description) {
          return "Masa açıklaması çok uzun.";
        }
      }

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

    const layoutChanged = comparableDraft(draftRef.current) !== comparableDraft(baselineRef.current);
    const tableDetailsChanged = comparableTableDetails(draftRef.current.tables) !== comparableTableDetails(baselineRef.current.tables);
    const mediaChanged = mediaDirty;
    if (!layoutChanged && !mediaChanged) return { ok: true, changed: false };

    const bridge = window.yardimciDesktop;
    if (layoutChanged && !bridge?.saveBusinessLayout) {
      const errorMessage = "İşletme düzeni bu ortamda kullanılamıyor.";
      setState("error");
      setMessage(errorMessage);
      return { ok: false, message: errorMessage };
    }
    if (mediaChanged && !bridge?.commitRoomMediaDraft) {
      const errorMessage = "Oda medyası taslağı kaydedilemiyor. Uygulamayı yeniden başlatın.";
      setState("error");
      setMessage(errorMessage);
      return { ok: false, message: errorMessage };
    }

    savingRef.current = true;
    setSaving(true);
    setMessage("İşletme düzeni kaydediliyor…");
    try {
      let changed = false;
      const messages: string[] = [];

      if (layoutChanged) {
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
                nightlyPriceMinor: parseMoneyToMinor(room.price) ?? 0,
                currency: room.currency,
                outOfService: room.outOfService
              }))
            : undefined,
          tables: current.capabilities.tables && tableDetailsChanged
            ? current.tables.map((table) => ({
                id: table.id,
                capacity: table.capacity,
                description: table.description,
                features: table.features,
                smokingPolicy: table.smokingPolicy
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
        const result = await bridge!.saveBusinessLayout(input);
        if (!result.ok) {
          setState("error");
          setMessage(result.message);
          return { ok: false, message: result.message };
        }
        applyCanonical(result.layout);
        changed = true;
        messages.push(result.message);
      }

      if (mediaChanged) {
        const mediaResult = await bridge!.commitRoomMediaDraft();
        setMediaDirty(mediaResult.dirty);
        if (!mediaResult.ok) {
          // The layout above may already be committed; refresh so the
          // dashboard never stays behind a persisted layout change.
          if (changed) await onDashboardRefresh?.();
          setState("error");
          setMessage(mediaResult.message);
          return { ok: false, message: mediaResult.message };
        }
        changed ||= mediaResult.changed;
        if (mediaResult.changed) {
          setMediaRevision((current) => current + 1);
          messages.push(mediaResult.message);
        }
      }

      await onDashboardRefresh?.();
      const successMessage = messages.join(" ") || "İşletme düzeni kaydedildi.";
      setState("success");
      setMessage(successMessage);
      return { ok: true, changed, message: successMessage };
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
  }, [applyCanonical, enabled, mediaDirty, onDashboardRefresh, validate]);

  const discard = useCallback(async () => {
    if (savingRef.current) return false;

    // Discard is one category operation. Do not reset the in-memory layout
    // draft until the filesystem-backed media draft is known to be discarded;
    // otherwise a media failure would silently lose unrelated unsaved layout edits.
    if (mediaDirty) {
      if (!window.yardimciDesktop?.discardRoomMediaDraft) {
        const errorMessage = "Oda medyası taslağı geri alınamıyor. Uygulamayı yeniden başlatın.";
        setState("error");
        setMessage(errorMessage);
        return false;
      }
      try {
        const result = await window.yardimciDesktop.discardRoomMediaDraft();
        setMediaDirty(result.dirty);
        if (!result.ok) {
          setState("error");
          setMessage(result.message);
          return false;
        }
        if (result.changed) setMediaRevision((current) => current + 1);
      } catch (error) {
        setState("error");
        setMessage(error instanceof Error && error.message ? error.message : "Oda medyası değişiklikleri geri alınamadı.");
        return false;
      }
    }

    const next = cloneDraft(baselineRef.current);
    draftRef.current = next;
    setDraftState(next);
    setState("idle");
    setMessage("");
    return true;
  }, [mediaDirty]);

  const reportMediaDirty = useCallback((dirtyValue: boolean) => {
    setMediaDirty(dirtyValue);
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
    updateTable,
    updateTableCategory,
    addTableCategory,
    removeTableCategory,
    mediaRevision,
    reportMediaDirty,
    save,
    discard,
    refresh: load
  };
}

function snapshotToDraft(snapshot: BusinessLayoutSnapshot): BusinessLayoutDraft {
  return {
    rooms: snapshot.rooms.map(toRoomDraft),
    tables: snapshot.tables.map(toTableDraft),
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
    outOfService: room.outOfService === true,
    canRemove: room.canRemove,
    removeBlockReason: room.removeBlockReason
  };
}

function toTableDraft(table: BusinessLayoutTable): BusinessLayoutTableDraft {
  return {
    key: table.id,
    id: table.id,
    name: table.name,
    area: table.area,
    capacity: table.capacity,
    description: table.description,
    features: normalizeTablePublicFeatures(table.features),
    smokingPolicy: normalizeTableSmokingPolicy(table.smokingPolicy),
    sortOrder: table.sortOrder
  };
}

function emptyDraft(): BusinessLayoutDraft {
  return {
    rooms: [],
    tables: [],
    tableCategories: [],
    capabilities: { rooms: false, tables: false }
  };
}

function cloneDraft(value: BusinessLayoutDraft): BusinessLayoutDraft {
  return {
    rooms: value.rooms.map((room) => ({ ...room, features: [...room.features] })),
    tables: value.tables.map((table) => ({ ...table, features: [...table.features] })),
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
      currency: room.currency,
      outOfService: room.outOfService === true
    })),
    tables: value.tables.map((table) => ({
      id: table.id,
      name: table.name.trim(),
      area: table.area.trim(),
      capacity: table.capacity,
      description: table.description.trim(),
      features: normalizeTablePublicFeatures(table.features),
      smokingPolicy: normalizeTableSmokingPolicy(table.smokingPolicy),
      sortOrder: table.sortOrder
    })),
    tableCategories: value.tableCategories.map((category) => ({
      sourceName: category.sourceName,
      name: category.name.trim(),
      tableCount: Number(category.tableCount)
    })),
    capabilities: value.capabilities
  });
}


function comparableTableDetails(tables: BusinessLayoutTableDraft[]): string {
  return JSON.stringify(tables.map((table) => ({
    id: table.id,
    capacity: table.capacity,
    description: table.description.trim(),
    features: normalizeTablePublicFeatures(table.features),
    smokingPolicy: normalizeTableSmokingPolicy(table.smokingPolicy)
  })));
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AndroidPermissionGroups } from "@yardimci-asistan/sync-core";
import type { DesktopAndroidDevice, DesktopAndroidPermissionGroupsUpdate } from "../../electron/database";
import type { SettingsOperationResult } from "./settings-save";

type PermissionDraft = Record<string, AndroidPermissionGroups>;

export function useAndroidDevicePermissionSettings(options: {
  devices: DesktopAndroidDevice[];
  enabled: boolean;
  onDashboardRefresh?: () => Promise<unknown>;
}) {
  const { devices, enabled, onDashboardRefresh } = options;
  const canonical = useMemo(() => permissionDraftFromDevices(devices), [devices]);
  const canonicalKey = comparablePermissionDraft(canonical);
  const [draft, setDraftState] = useState<PermissionDraft>(() => clonePermissionDraft(canonical));
  const draftRef = useRef(draft);
  const baselineRef = useRef(clonePermissionDraft(canonical));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [state, setState] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const nextCanonical = permissionDraftFromDevices(devices);
    const previousBaseline = baselineRef.current;
    const currentDraft = draftRef.current;
    const nextDraft: PermissionDraft = {};

    for (const [deviceId, groups] of Object.entries(nextCanonical)) {
      const previous = previousBaseline[deviceId];
      nextDraft[deviceId] = previous && samePermissionGroups(previous, groups)
        ? clonePermissionGroups(currentDraft[deviceId] ?? groups)
        : clonePermissionGroups(groups);
    }

    baselineRef.current = clonePermissionDraft(nextCanonical);
    draftRef.current = nextDraft;
    setDraftState(nextDraft);
  }, [canonicalKey, devices]);

  const dirty = comparablePermissionDraft(draft) !== comparablePermissionDraft(baselineRef.current);

  const update = useCallback((deviceId: string, groups: AndroidPermissionGroups) => {
    const id = String(deviceId ?? "").trim();
    if (!id || !(id in baselineRef.current) || busyRef.current) return;
    const next = {
      ...draftRef.current,
      [id]: clonePermissionGroups(groups)
    };
    draftRef.current = next;
    setDraftState(next);
    setState("idle");
    setMessage("");
  }, []);

  const discard = useCallback(() => {
    if (busyRef.current) return;
    const next = clonePermissionDraft(baselineRef.current);
    draftRef.current = next;
    setDraftState(next);
    setState("idle");
    setMessage("");
  }, []);

  const save = useCallback(async (): Promise<SettingsOperationResult> => {
    if (busyRef.current || !enabled) return { ok: true, changed: false };

    const updates: DesktopAndroidPermissionGroupsUpdate[] = Object.entries(draftRef.current)
      .filter(([deviceId, groups]) => {
        const baseline = baselineRef.current[deviceId];
        return baseline && !samePermissionGroups(groups, baseline);
      })
      .map(([deviceId, groups]) => ({ deviceId, groups: clonePermissionGroups(groups) }));

    if (updates.length === 0) return { ok: true, changed: false };

    const bridge = window.yardimciDesktop;
    if (!bridge?.setAndroidDevicePermissionGroupsBatch) {
      const errorMessage = "Telefon görev alanları kaydedilemiyor. Uygulamayı yeniden başlatın.";
      setState("error");
      setMessage(errorMessage);
      return { ok: false, message: errorMessage };
    }

    busyRef.current = true;
    setBusy(true);
    setState("idle");
    setMessage("Telefon görev alanları kaydediliyor…");
    try {
      const result = await bridge.setAndroidDevicePermissionGroupsBatch(updates);
      if (!result.ok) {
        setState("error");
        setMessage(result.message);
        return { ok: false, message: result.message };
      }

      const next = permissionDraftFromDevices(result.devices);
      baselineRef.current = clonePermissionDraft(next);
      draftRef.current = clonePermissionDraft(next);
      setDraftState(clonePermissionDraft(next));
      await onDashboardRefresh?.();
      setState("success");
      setMessage(result.message);
      return { ok: true, changed: true, message: result.message };
    } catch (error) {
      const errorMessage = error instanceof Error && error.message
        ? error.message
        : "Telefon görev alanları kaydedilemedi.";
      setState("error");
      setMessage(errorMessage);
      return { ok: false, message: errorMessage };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [enabled, onDashboardRefresh]);

  return { draft, dirty, busy, state, message, update, save, discard };
}

function permissionDraftFromDevices(devices: DesktopAndroidDevice[]): PermissionDraft {
  return Object.fromEntries(
    devices
      .filter((device) => !device.revokedAt && device.role === "staff")
      .map((device) => [device.deviceId, clonePermissionGroups(device.permissionGroups)])
  );
}

function clonePermissionDraft(value: PermissionDraft): PermissionDraft {
  return Object.fromEntries(
    Object.entries(value).map(([deviceId, groups]) => [deviceId, clonePermissionGroups(groups)])
  );
}

function clonePermissionGroups(groups: AndroidPermissionGroups): AndroidPermissionGroups {
  return { ...groups };
}

function comparablePermissionDraft(value: PermissionDraft): string {
  return JSON.stringify(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([deviceId, groups]) => [deviceId, groups])
  );
}

function samePermissionGroups(left: AndroidPermissionGroups, right: AndroidPermissionGroups): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

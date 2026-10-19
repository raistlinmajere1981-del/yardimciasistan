import { pushAiCatalog, pushRoomCatalog, pushTableCatalog, pushAvailability } from "@yardimci-asistan/sync-core";
import type { BusinessAiCatalog, BusinessCapability, RoomPublicCatalog, TablePublicCatalog } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "./database";
import { desktopLog } from "./desktop-logger";
import { safeWebTarget } from "./web-diagnostics";
import { createPublicRoomAvailabilityPublication } from "./public-room-availability-publication";
import { publishDesktopProjection } from "./desktop-publication-service";
import { createSyncFetchWithTimeout } from "./sync-network-policy";

export interface SyncCatalogSources {
  createAiCatalog?: () => BusinessAiCatalog;
  createRoomCatalog?: () => RoomPublicCatalog;
  prepareRoomCatalog?: (config: { baseUrl: string; syncSecret: string }, clientId: string) => Promise<{ ok: boolean; message: string; uploaded?: number; status?: number }>;
  createTableCatalog?: () => TablePublicCatalog;
  prepareTableCatalog?: (config: { baseUrl: string; syncSecret: string }, clientId: string) => Promise<{ ok: boolean; message: string; uploaded?: number; status?: number }>;
}

/** Reconstructable catalog/availability producers; all writes use the durable publication service. */
export class SyncCatalogPublisher {
  private availabilityHeartbeatSupported: boolean | null = null;
  private aiCatalogSupported: boolean | null = null;
  private roomCatalogSupported: boolean | null = null;
  private tableCatalogSupported: boolean | null = null;
  constructor(private readonly options: SyncCatalogSources & { database: DesktopDatabase },
    private readonly operationId: () => string,
    private readonly logSyncFailure: (stage: string, failure: { status?: number; message?: string; error?: string }, meta?: Record<string, unknown>) => void) {}

  resetCatalogSupport() { this.aiCatalogSupported = null; this.roomCatalogSupported = null; this.tableCatalogSupported = null; }
  resetAvailabilitySupport() { this.availabilityHeartbeatSupported = null; }

  async publishAvailabilityHeartbeat(
    config: { baseUrl: string; syncSecret: string },
    enabledCapabilities: readonly BusinessCapability[]
  ): Promise<string> {
    if (this.availabilityHeartbeatSupported === false) {
      return "";
    }

    const runtimeFetch = globalThis.fetch;
    if (!runtimeFetch) {
      const message = "Canlı müsaitlik yayını için ağ istemcisi kullanılamıyor.";
      this.logSyncFailure("availability", { message, error: "fetch_unavailable" });
      return message;
    }

    const availability = createPublicRoomAvailabilityPublication(
      this.options.database.getPublicRoomAvailabilityInput(),
      enabledCapabilities
    );

    try {
      const boundedConfig = { ...config, fetchImpl: createSyncFetchWithTimeout(runtimeFetch) };
      const result = await publishDesktopProjection(this.options.database, boundedConfig, "public_room_availability_publish", availability,
        (identity, frozen) => pushAvailability({ ...boundedConfig, ...identity, availability: frozen }), { refresh: true });
      if (!result) return "";

      if (!result.ok && result.status === 404) {
        // Older hosting packages do not have the availability endpoint. Keep
        // existing sync healthy until the web module is upgraded.
        this.availabilityHeartbeatSupported = false;
        desktopLog.info({
          scope: "sync",
          event: "sync.availability.unsupported",
          message: "Canlı müsaitlik endpoint'i bu hosting sürümünde yok.",
          operationId: this.operationId(),
          meta: { target: safeWebTarget(config.baseUrl), status: 404 }
        });
        return "";
      }

      if (!result.ok) {
        const message = result.message;
        this.logSyncFailure("availability", result);
        return message;
      }

      this.availabilityHeartbeatSupported = true;
      return "";
    } catch (error) {
      const message = "Canlı müsaitlik yayını sırasında web modülüne ulaşılamadı.";
      this.logSyncFailure("availability", {
        message,
        error: error instanceof Error ? error.message : String(error)
      }, {
        endpoint: safeWebTarget(config.baseUrl)
      });
      return message;
    }
  }

  async publishRoomCatalogIfChanged(
    config: { baseUrl: string; syncSecret: string },
    clientId: string
  ): Promise<string> {
    if (this.roomCatalogSupported === false) return "";

    let catalog = this.options.createRoomCatalog?.() ?? { version: 1, enabled: false, updatedAt: "", rooms: [] };
    if (catalog.enabled) {
      const preparation = await this.options.prepareRoomCatalog?.(config, clientId);
      if (preparation && !preparation.ok) {
        this.logSyncFailure("room-catalog-prepare", {
          message: preparation.message,
          ...(preparation.status === undefined ? {} : { status: preparation.status })
        });
        if ([400, 404, 405].includes(preparation.status ?? 0)) {
          this.roomCatalogSupported = false;
          return "";
        }
        return preparation.message;
      }
      if (preparation?.uploaded) {
        catalog = this.options.createRoomCatalog?.() ?? catalog;
      }
    }


    const runtimeFetch = globalThis.fetch;
    const boundedConfig = { ...config, ...(runtimeFetch ? { fetchImpl: createSyncFetchWithTimeout(runtimeFetch) } : {}) };
    const result = await publishDesktopProjection(this.options.database, boundedConfig, "room_catalog_publish", catalog,
      (identity, frozen) => pushRoomCatalog({ ...boundedConfig, ...identity, catalog: frozen }));
    if (!result) return "";

    if (result.ok) {
      this.roomCatalogSupported = true;
      this.options.database.recordSyncEvent({
        direction: "push",
        entityType: "room_catalog",
        ok: true,
        recordCount: result.room_count,
        message: result.message
      });
      return "";
    }

    if ([400, 404, 405].includes(result.status ?? 0)) {
      this.logSyncFailure("room-catalog", result);
      this.roomCatalogSupported = false;
      return "";
    }

    this.logSyncFailure("room-catalog", result);
    this.options.database.recordSyncEvent({
      direction: "push",
      entityType: "room_catalog",
      ok: false,
      recordCount: 0,
      message: result.message,
      ...(result.status === undefined ? {} : { status: result.status })
    });
    return result.message;
  }

  async publishTableCatalogIfChanged(
    config: { baseUrl: string; syncSecret: string },
    clientId: string
  ): Promise<string> {
    if (this.tableCatalogSupported === false) return "";

    let catalog = this.options.createTableCatalog?.() ?? { version: 1, enabled: false, updatedAt: "", tables: [] };
    if (catalog.enabled) {
      const preparation = await this.options.prepareTableCatalog?.(config, clientId);
      if (preparation && !preparation.ok) {
        this.logSyncFailure("table-catalog-prepare", {
          message: preparation.message,
          ...(preparation.status === undefined ? {} : { status: preparation.status })
        });
        if ([400, 404, 405].includes(preparation.status ?? 0)) {
          this.tableCatalogSupported = false;
          return "";
        }
        return preparation.message;
      }
      if (preparation?.uploaded) {
        catalog = this.options.createTableCatalog?.() ?? catalog;
      }
    }


    const runtimeFetch = globalThis.fetch;
    const boundedConfig = { ...config, ...(runtimeFetch ? { fetchImpl: createSyncFetchWithTimeout(runtimeFetch) } : {}) };
    const result = await publishDesktopProjection(this.options.database, boundedConfig, "table_catalog_publish", catalog,
      (identity, frozen) => pushTableCatalog({ ...boundedConfig, ...identity, catalog: frozen }));
    if (!result) return "";

    if (result.ok) {
      this.tableCatalogSupported = true;
      this.options.database.recordSyncEvent({
        direction: "push",
        entityType: "table_catalog",
        ok: true,
        recordCount: result.table_count,
        message: result.message
      });
      return "";
    }

    if ([400, 404, 405].includes(result.status ?? 0)) {
      this.logSyncFailure("table-catalog", result);
      this.tableCatalogSupported = false;
      return "";
    }

    this.logSyncFailure("table-catalog", result);
    this.options.database.recordSyncEvent({
      direction: "push",
      entityType: "table_catalog",
      ok: false,
      recordCount: 0,
      message: result.message,
      ...(result.status === undefined ? {} : { status: result.status })
    });
    return result.message;
  }

  async publishAiCatalogIfChanged(config: { baseUrl: string; syncSecret: string }): Promise<string> {
    if (this.aiCatalogSupported === false) return "";

    const catalog = this.options.createAiCatalog?.() ?? { version: 1, updatedAt: "", items: [] };

    const runtimeFetch = globalThis.fetch;
    const boundedConfig = { ...config, ...(runtimeFetch ? { fetchImpl: createSyncFetchWithTimeout(runtimeFetch) } : {}) };
    const result = await publishDesktopProjection(this.options.database, boundedConfig, "ai_catalog_publish", catalog,
      (identity, frozen) => pushAiCatalog({ ...boundedConfig, ...identity, catalog: frozen }));
    if (!result) return "";

    if (result.ok) {
      this.aiCatalogSupported = true;
      this.options.database.recordSyncEvent({
        direction: "push",
        entityType: "ai_catalog",
        ok: true,
        recordCount: result.item_count,
        message: result.message
      });
      return "";
    }

    if ([400, 404, 405].includes(result.status ?? 0)) {
      this.logSyncFailure("ai-catalog", result);
      this.aiCatalogSupported = false;
      return "";
    }

    this.logSyncFailure("ai-catalog", result);
    this.options.database.recordSyncEvent({
      direction: "push",
      entityType: "ai_catalog",
      ok: false,
      recordCount: 0,
      message: result.message,
      ...(result.status === undefined ? {} : { status: result.status })
    });
    return result.message;
  }
}

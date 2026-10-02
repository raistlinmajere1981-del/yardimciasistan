import { app, dialog, session } from "electron";
import path from "node:path";
import { resolveProjectBackupPath } from "./data-maintenance";
import {
  CLEAN_START_SESSION_CLEAR_TIMEOUT_MS,
  archiveLocalDataForCleanStart,
  cleanupTransientStateForCleanStart,
  settleCleanStartOperation
} from "./clean-start.js";
import { inspectDesktopDatabaseCompatibility } from "./desktop-database-compatibility.js";
import { resolveDataRoot, resolveDatabasePath } from "./data-paths.js";
import { desktopLog } from "./desktop-logger";

type StartupDataOptions = {
  whatsappPartition: string;
  kbsPartition: string;
};

export function resolveRuntimeDataRoot(): string {
  return resolveDataRoot({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    defaultUserDataPath: app.getPath("userData")
  });
}

export async function prepareRuntimeDataForStartup(
  dataRoot: string,
  options: StartupDataOptions
): Promise<boolean> {
  const forcedCleanStart = process.argv.includes("--clean-start");
  const compatibility = inspectDesktopDatabaseCompatibility(
    resolveDatabasePath(dataRoot),
    path.join(app.getAppPath(), "db", "schema.sql")
  );

  if (
    !forcedCleanStart
    && (compatibility.state === "fresh" || compatibility.state === "current")
  ) {
    return true;
  }

  const automaticReason =
    compatibility.state === "incompatible"
      ? "Bu sürüm, bilgisayardaki eski Yardımcı Asistan veritabanı şemasıyla çalışamıyor."
      : compatibility.state === "unreadable"
        ? "Bilgisayardaki Yardımcı Asistan veritabanı güvenli biçimde okunamadı."
        : "Teknik temiz başlangıç istendi.";

  desktopLog.warn({
    scope: "startup",
    event: "startup.clean-start.required",
    message: automaticReason,
    meta: {
      forced: forcedCleanStart,
      compatibility: compatibility.state,
      reason: compatibility.reason
    }
  });

  const response = dialog.showMessageBoxSync({
    type: "warning",
    title: "Yardımcı Asistan — Temiz Başlangıç",
    message: automaticReason,
    detail: [
      "Temiz Başlat seçilirse mevcut yerel veriler, görseller, bakım kayıtları ve eski yedekler silinmek yerine kurtarma amacıyla legacy-data klasörüne taşınır.",
      "Oturumlar ve geçici güncelleme dosyaları güvenli biçimde temizlenmeye çalışılır; tanılama logları korunur. Yeni sürüm sıfır veritabanıyla açılır.",
      "",
      `Tanılama: ${compatibility.reason}`
    ].join("\n"),
    buttons: ["Temiz Başlat", "Uygulamayı Kapat"],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });

  if (response !== 0) {
    desktopLog.info({
      scope: "startup",
      event: "startup.clean-start.cancelled",
      message: "Temiz başlangıç kullanıcı tarafından iptal edildi.",
      meta: { compatibility: compatibility.state }
    });
    return false;
  }

  try {
    const transientCleanup = cleanupTransientStateForCleanStart(dataRoot);
    if (transientCleanup.failedEntries.length > 0) {
      desktopLog.warn({
        scope: "startup",
        event: "startup.clean-start.transient-cleanup.incomplete",
        message:
          "Bazı geçici güncelleme dosyaları Windows dosya kilidi veya izin nedeniyle temizlenemedi; temiz başlangıç devam ediyor.",
        meta: { failedEntries: transientCleanup.failedEntries }
      });
    }

    const archived = archiveLocalDataForCleanStart(
      dataRoot,
      new Date(),
      resolveCleanStartBackupRoot(dataRoot)
    );

    const cleanStartSessions = [
      { name: "default", persistentSession: session.defaultSession },
      {
        name: "whatsapp",
        persistentSession: session.fromPartition(options.whatsappPartition)
      },
      {
        name: "kbs",
        persistentSession: session.fromPartition(options.kbsPartition)
      }
    ];

    const sessionCleanupOperations = cleanStartSessions.flatMap(
      ({ name, persistentSession }) => [
        {
          name: `${name}.storage`,
          operation: persistentSession.clearStorageData()
        },
        {
          name: `${name}.cache`,
          operation: persistentSession.clearCache()
        }
      ]
    );

    const sessionCleanupResults = await Promise.all(
      sessionCleanupOperations.map(({ name, operation }) =>
        settleCleanStartOperation(
          name,
          operation,
          CLEAN_START_SESSION_CLEAR_TIMEOUT_MS
        )
      )
    );

    const incompleteSessionCleanup = sessionCleanupResults.filter(
      (result) => result.status !== "completed"
    );
    if (incompleteSessionCleanup.length > 0) {
      desktopLog.warn({
        scope: "startup",
        event: "startup.clean-start.session-data-clear.failed",
        message:
          "Kalıcı oturum veya önbellek temizliğinin bir bölümü hata verdi ya da zaman aşımına uğradı; temiz başlangıç devam ediyor.",
        meta: {
          timeoutMs: CLEAN_START_SESSION_CLEAR_TIMEOUT_MS,
          operations: incompleteSessionCleanup
        }
      });
    }

    desktopLog.info({
      scope: "startup",
      event: "startup.clean-start.completed",
      message:
        "Eski çalışma verileri arşivlendi; uygulama temiz başlangıçla devam ediyor.",
      meta: {
        forced: forcedCleanStart,
        compatibility: compatibility.state,
        archived: archived.archived,
        archiveDirectory: archived.archiveDirectory,
        movedEntries: archived.movedEntries,
        removedTransientEntries: transientCleanup.removedEntries,
        failedTransientEntries: transientCleanup.failedEntries,
        preservedEntries: transientCleanup.preservedEntries,
        sessionCleanupResults
      }
    });
    return true;
  } catch (error) {
    desktopLog.error({
      scope: "startup",
      event: "startup.clean-start.failed",
      message:
        "Temiz başlangıç için yerel veriler güvenli biçimde arşivlenemedi.",
      error
    });
    dialog.showMessageBoxSync({
      type: "error",
      title: "Temiz Başlangıç Tamamlanamadı",
      message:
        "Yerel veriler güvenli biçimde hazırlanamadığı için uygulama açılmadı.",
      detail:
        "Hiçbir yeni veritabanı oluşturulmadan uygulama kapatılacak. Mevcut verileri kontrol edip tekrar deneyebilirsiniz.",
      buttons: ["Kapat"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    return false;
  }
}

function resolveCleanStartBackupRoot(dataRoot: string): string {
  if (app.isPackaged) {
    return resolveProjectBackupPath(dataRoot);
  }
  const explicit = String(process.env.YA_DESKTOP_BACKUP_DIR ?? "").trim();
  return explicit ? path.resolve(explicit) : path.join(dataRoot, "backups");
}

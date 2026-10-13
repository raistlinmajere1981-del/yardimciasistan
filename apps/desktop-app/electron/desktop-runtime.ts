import { app, BrowserWindow, session, shell, systemPreferences } from "electron";
import path from "node:path";
import { installDesktopContextMenu } from "./desktop-context-menu";
import { desktopLog } from "./desktop-logger";

type DesktopMainWindowOptions = {
  isDev: boolean;
  devServerUrl?: string;
  allowExternalUrl: (url: string) => boolean;
  onClosed?: () => void;
};

type DesktopSessionRuntimeOptions = {
  whatsappPartition: string;
  kbsPartition: string;
  isTrustedRendererUrl: (value: string) => boolean;
  canCaptureAudio?: () => boolean;
};

export function createDesktopMainWindow(options: DesktopMainWindowOptions) {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: "Yardımcı Asistan",
    icon: getAppIconPath(),
    backgroundColor: "#fff8ee",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  window.removeMenu();
  installDesktopContextMenu(window);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && options.allowExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("unresponsive", () => {
    desktopLog.warn({
      scope: "renderer",
      event: "renderer.unresponsive",
      message: "Renderer geçici olarak yanıt vermiyor."
    });
  });
  window.webContents.on("responsive", () => {
    desktopLog.info({
      scope: "renderer",
      event: "renderer.responsive",
      message: "Renderer yeniden yanıt vermeye başladı."
    });
  });
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame) return;
      desktopLog.error({
        scope: "renderer",
        event: "renderer.load.failed",
        message: "Ana renderer yüzeyi yüklenemedi.",
        meta: {
          errorCode,
          errorDescription,
          url: validatedUrl
        }
      });
    }
  );

  let mainWindowShown = false;
  const showMainWindow = () => {
    if (mainWindowShown || window.isDestroyed()) return;
    mainWindowShown = true;
    window.maximize();
    window.show();
    window.focus();
  };

  window.once("ready-to-show", showMainWindow);
  window.webContents.once("did-finish-load", showMainWindow);
  const showFallback = setTimeout(showMainWindow, 3000);
  showFallback.unref();
  window.once("closed", () => {
    clearTimeout(showFallback);
    options.onClosed?.();
  });

  if (options.isDev && options.devServerUrl) {
    void window.loadURL(options.devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }

  return window;
}

export function configureDesktopSessionRuntime(
  options: DesktopSessionRuntimeOptions
) {
  const userAgent = createChromeUserAgent();
  const acceptLanguage = "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7";

  session
    .fromPartition(options.whatsappPartition)
    .setUserAgent(userAgent, acceptLanguage);
  session
    .fromPartition(options.kbsPartition)
    .setUserAgent(userAgent, acceptLanguage);

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, _origin, details) => {
      const trustedRenderer = webContents?.getType() === "window"
        && options.isTrustedRendererUrl(webContents.getURL());

      if (permission === "media") {
        const mediaType = details.mediaType;
        if (mediaType === "audio") {
          // Opt-in dictation's native request still needs current saved authority.
          // Audio permissions/payloads never enter the camera diagnostic stream.
          return Boolean(trustedRenderer && options.canCaptureAudio?.());
        }
        // Keep the existing camera check for omitted/unknown mediaType.
        const granted = Boolean(
          trustedRenderer
        );
        const log = granted ? desktopLog.info : desktopLog.warn;
        log({
          scope: "camera",
          event: granted
            ? "camera.permission.check.granted"
            : "camera.permission.check.denied",
          message: granted
            ? "Kamera medya izin denetimi geçti."
            : "Kamera medya izin denetimi reddedildi.",
          meta: {
            trustedRenderer,
            mediaType: mediaType ?? "",
            rendererType: webContents?.getType() ?? "none",
            osCameraAccessStatus: getCameraMediaAccessStatus()
          }
        });
        return granted;
      }

      return Boolean(
        trustedRenderer && permission === "clipboard-sanitized-write"
      );
    }
  );

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const mediaTypes = "mediaTypes" in details && Array.isArray(details.mediaTypes)
        ? details.mediaTypes
        : undefined;
      const trustedRenderer = webContents.getType() === "window"
        && options.isTrustedRendererUrl(webContents.getURL());

      if (trustedRenderer && permission === "clipboard-sanitized-write") {
        callback(true);
        return;
      }

      if (permission === "media") {
        if (mediaTypes?.includes("audio")) {
          callback(Boolean(trustedRenderer && !mediaTypes.includes("video") && options.canCaptureAudio?.()));
          return;
        }
        // Electron documents mediaTypes as optional. A trusted local renderer
        // must not lose camera access merely because Chromium omitted that field.
        // Preserve camera behavior; explicit audio requests use the separate gate above.
        const mediaTypesMissing = !mediaTypes || mediaTypes.length === 0;
        const videoOnlyRequest = Boolean(
          mediaTypes?.includes("video") && !mediaTypes.includes("audio")
        );
        const granted = Boolean(
          trustedRenderer && (mediaTypesMissing || videoOnlyRequest)
        );

        const log = granted ? desktopLog.info : desktopLog.warn;
        log({
          scope: "camera",
          event: granted
            ? "camera.permission.granted"
            : "camera.permission.denied",
          message: granted
            ? "Kamera medya izni yerel renderer için verildi."
            : "Kamera medya izni reddedildi.",
          meta: {
            trustedRenderer,
            mediaTypes: mediaTypes ?? [],
            mediaTypesMissing,
            rendererType: webContents.getType(),
            osCameraAccessStatus: getCameraMediaAccessStatus()
          }
        });

        callback(granted);
        return;
      }

      callback(false);
    }
  );
}

export function createTrustedDesktopRendererUrlPredicate(
  isDev: boolean,
  devServerUrl?: string
) {
  return (value: string): boolean => {
    try {
      const candidate = new URL(value);
      if (candidate.protocol === "file:") {
        return true;
      }
      if (!isDev || !devServerUrl) {
        return false;
      }
      return candidate.origin === new URL(devServerUrl).origin;
    } catch {
      return false;
    }
  };
}

function getCameraMediaAccessStatus(): string {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    return "unsupported";
  }
  try {
    return systemPreferences.getMediaAccessStatus("camera");
  } catch {
    return "unknown";
  }
}

function createChromeUserAgent() {
  const chromeMajorVersion = process.versions.chrome.split(".")[0] || "144";
  const platform =
    process.platform === "win32"
      ? "Windows NT 10.0; Win64; x64"
      : process.platform === "darwin"
        ? "Macintosh; Intel Mac OS X 10_15_7"
        : "X11; Linux x86_64";

  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajorVersion}.0.0.0 Safari/537.36`;
}

function getAppIconPath() {
  const iconFile = process.platform === "win32" ? "app-icon.ico" : "app-icon.png";
  return path.join(app.getAppPath(), "assets", iconFile);
}

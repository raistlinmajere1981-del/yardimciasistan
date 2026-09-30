import { BaseWindow, WebContentsView } from "electron";
import { EgmKbsWebviewDriver, type EgmKbsSessionResult } from "./egm-kbs-webview-driver.js";
import { EGM_KBS_PARTITION, EGM_KBS_PORTAL_URL } from "./kbs-settings.js";

export class EgmKbsBackgroundSession {
  private host: BaseWindow | null = null;
  private view: WebContentsView | null = null;
  private initializing: Promise<void> | null = null;

  constructor(private readonly driver: EgmKbsWebviewDriver) {}

  async inspect(): Promise<EgmKbsSessionResult> {
    await this.ensure();
    if (!this.driver.isAvailable()) {
      return {
        ok: false,
        state: "unavailable",
        message: "EGM KBS arka plan oturumu hazırlanamadı.",
        url: ""
      };
    }
    return this.driver.inspect();
  }

  async refresh(): Promise<EgmKbsSessionResult> {
    await this.ensure();
    const contents = this.view?.webContents;
    if (!contents || contents.isDestroyed()) {
      return {
        ok: false,
        state: "unavailable",
        message: "EGM KBS arka plan oturumu kullanılamıyor.",
        url: ""
      };
    }

    try {
      await contents.loadURL(EGM_KBS_PORTAL_URL);
    } catch {
      return {
        ok: false,
        state: "unavailable",
        message: "EGM KBS arka plan oturumu yenilenemedi.",
        url: contents.getURL()
      };
    }
    return this.driver.inspect();
  }

  destroy() {
    const view = this.view;
    const host = this.host;
    this.view = null;
    this.host = null;
    this.driver.detach();

    const contents = view?.webContents;
    if (contents && !contents.isDestroyed()) {
      contents.close({ waitForBeforeUnload: false });
    }
    if (host && !host.isDestroyed()) {
      host.destroy();
    }
  }

  private async ensure() {
    if (this.view?.webContents && !this.view.webContents.isDestroyed()) return;
    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this.create();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async create() {
    const host = new BaseWindow({
      show: false,
      width: 1280,
      height: 900,
      frame: false,
      focusable: false,
      skipTaskbar: true
    });
    const view = new WebContentsView({
      webPreferences: {
        partition: EGM_KBS_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: false,
        backgroundThrottling: false
      }
    });

    host.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 1280, height: 900 });
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    this.host = host;
    this.view = view;
    this.driver.attachWebContents(view.webContents);

    view.webContents.once("destroyed", () => {
      if (this.view !== view) return;
      this.view = null;
      this.host = null;
      this.driver.detach();
      if (!host.isDestroyed()) host.destroy();
    });

    try {
      await view.webContents.loadURL(EGM_KBS_PORTAL_URL);
    } catch {
      // inspect()/refresh() reports the actionable state; do not fabricate success.
    }
  }
}

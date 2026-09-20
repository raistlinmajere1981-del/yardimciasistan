import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { createAndroidBootstrapTicket } from "./android-bootstrap-ticket.js";

const PACKAGE_NAME = "com.yardimciasistan.android";
const ACTIVITY_NAME = ".MainActivity";

export type DesktopAndroidInstallAction =
  | "install"
  | "update"
  | "current"
  | "newer"
  | "authorize"
  | "offline";

export interface DesktopAndroidInstallDevice {
  serial: string;
  state: string;
  model: string;
  appInstalled: boolean;
  installedVersionName: string;
  installedVersionCode: number;
  bundledVersionName: string;
  bundledVersionCode: number;
  action: DesktopAndroidInstallAction;
  message: string;
}

export interface DesktopAndroidInstallationSnapshot {
  ok: boolean;
  adbAvailable: boolean;
  apkAvailable: boolean;
  bundledVersionName: string;
  bundledVersionCode: number;
  devices: DesktopAndroidInstallDevice[];
  message: string;
}

export interface DesktopAndroidInstallResult {
  ok: boolean;
  message: string;
  device?: DesktopAndroidInstallDevice;
}

export interface AndroidInstallationServiceOptions {
  getConnection: () => { baseUrl: string; syncSecret: string };
  getDesktopId: () => string;
}

interface BundledAndroidPackage {
  apkPath: string;
  versionName: string;
  versionCode: number;
  variant: "debug" | "release";
}

interface AdbDevice {
  serial: string;
  state: string;
  model: string;
}

export class AndroidInstallationService {
  constructor(private readonly options: AndroidInstallationServiceOptions) {}

  listDevices(): DesktopAndroidInstallationSnapshot {
    const androidPackage = this.resolveAndroidPackage();
    const adb = this.resolveAdbExecutable();
    const adbResult = this.runAdb(adb, ["devices", "-l"], true);

    if (adbResult.errorCode === "ENOENT") {
      return {
        ok: false,
        adbAvailable: false,
        apkAvailable: Boolean(androidPackage?.apkPath && existsSync(androidPackage.apkPath)),
        bundledVersionName: androidPackage?.versionName ?? "",
        bundledVersionCode: androidPackage?.versionCode ?? 0,
        devices: [],
        message: "Android kurulum aracı bulunamadı. Desktop paketindeki Platform-Tools kaynağını kontrol edin."
      };
    }
    if (adbResult.status !== 0) {
      return {
        ok: false,
        adbAvailable: true,
        apkAvailable: Boolean(androidPackage?.apkPath && existsSync(androidPackage.apkPath)),
        bundledVersionName: androidPackage?.versionName ?? "",
        bundledVersionCode: androidPackage?.versionCode ?? 0,
        devices: [],
        message: adbResult.output || "ADB cihaz listesi alınamadı."
      };
    }

    const devices = this.parseDevices(adbResult.stdout).map((device) =>
      this.inspectDevice(adb, device, androidPackage)
    );
    const apkAvailable = Boolean(androidPackage?.apkPath && existsSync(androidPackage.apkPath));

    return {
      ok: true,
      adbAvailable: true,
      apkAvailable,
      bundledVersionName: androidPackage?.versionName ?? "",
      bundledVersionCode: androidPackage?.versionCode ?? 0,
      devices,
      message: devices.length === 0
        ? "USB hata ayıklaması açık bir Android cihaz bağlandığında burada görünür."
        : apkAvailable
          ? `${devices.length} USB Android cihazı bulundu.`
          : "Android cihaz bulundu ancak kurulum APK'sı hazır değil."
    };
  }

  install(serial: string): DesktopAndroidInstallResult {
    const normalizedSerial = String(serial ?? "").trim();
    if (!normalizedSerial) {
      return { ok: false, message: "Kurulum için Android cihaz seri numarası gerekli." };
    }

    const androidPackage = this.resolveAndroidPackage();
    if (!androidPackage || !existsSync(androidPackage.apkPath)) {
      return {
        ok: false,
        message: "Android kurulum APK'sı bulunamadı. Desktop paketini Android kaynağıyla yeniden hazırlayın."
      };
    }

    const adb = this.resolveAdbExecutable();
    const devicesResult = this.runAdb(adb, ["devices", "-l"], true);
    if (devicesResult.errorCode === "ENOENT") {
      return { ok: false, message: "ADB bulunamadı. Desktop Android Platform-Tools kaynağını kontrol edin." };
    }
    const device = this.parseDevices(devicesResult.stdout).find((item) => item.serial === normalizedSerial);
    if (!device) {
      return { ok: false, message: "Seçilen Android cihaz artık USB üzerinden görünmüyor." };
    }
    if (device.state === "unauthorized") {
      return {
        ok: false,
        message: "Telefon USB hata ayıklama onayı bekliyor. Telefonun kilidini açıp bu bilgisayara izin verin."
      };
    }
    if (device.state !== "device") {
      return { ok: false, message: `Android cihazı kurulum için hazır değil: ${device.state}.` };
    }

    const alreadyInstalled = this.isPackageInstalled(adb, normalizedSerial);
    const installResult = this.runAdb(
      adb,
      ["-s", normalizedSerial, "install", "-r", androidPackage.apkPath],
      true
    );
    if (installResult.status !== 0 || /\bFailure\s*\[/.test(installResult.output)) {
      return { ok: false, message: this.installFailureMessage(installResult.output) };
    }
    if (!this.isPackageInstalled(adb, normalizedSerial)) {
      return { ok: false, message: "ADB başarı bildirdi ancak Android uygulaması telefonda doğrulanamadı." };
    }

    const launchArgs = [
      "-s",
      normalizedSerial,
      "shell",
      "am",
      "start",
      "-n",
      `${PACKAGE_NAME}/${ACTIVITY_NAME}`
    ];

    if (!alreadyInstalled) {
      const connection = this.options.getConnection();
      const baseUrl = String(connection.baseUrl ?? "").trim().replace(/\/+$/, "");
      const syncSecret = String(connection.syncSecret ?? "").trim();
      if (!/^https?:\/\//i.test(baseUrl) || syncSecret.length < 12) {
        return {
          ok: false,
          message: "APK kuruldu ancak işletme bağlantısı hazırlanamadı. Önce Web bağlantı ayarlarını kaydedin."
        };
      }

      let ticket: string;
      try {
        ticket = createAndroidBootstrapTicket({
          syncSecret,
          desktopId: this.options.getDesktopId()
        });
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Android kurulum bileti oluşturulamadı."
        };
      }
      launchArgs.push("--es", "ya_provision_url", baseUrl, "--es", "ya_provision_ticket", ticket);
    }

    const launchResult = this.runAdb(adb, launchArgs, true);
    if (launchResult.status !== 0) {
      return {
        ok: false,
        message: "Uygulama kuruldu ancak telefonda otomatik açılamadı. Uygulamayı telefondan bir kez açın."
      };
    }

    const refreshed = this.inspectDevice(adb, device, androidPackage);
    return {
      ok: true,
      message: alreadyInstalled
        ? `Yardımcı Asistan ${androidPackage.versionName} telefonda güncellendi ve açıldı.`
        : "Yardımcı Asistan telefona kuruldu; işletme bağlantısı otomatik hazırlanıyor.",
      device: refreshed
    };
  }

  private inspectDevice(
    adb: string,
    device: AdbDevice,
    androidPackage: BundledAndroidPackage | null
  ): DesktopAndroidInstallDevice {
    const bundledVersionName = androidPackage?.versionName ?? "";
    const bundledVersionCode = androidPackage?.versionCode ?? 0;

    if (device.state === "unauthorized") {
      return {
        ...device,
        appInstalled: false,
        installedVersionName: "",
        installedVersionCode: 0,
        bundledVersionName,
        bundledVersionCode,
        action: "authorize",
        message: "Telefon USB hata ayıklama onayı bekliyor."
      };
    }
    if (device.state !== "device") {
      return {
        ...device,
        appInstalled: false,
        installedVersionName: "",
        installedVersionCode: 0,
        bundledVersionName,
        bundledVersionCode,
        action: "offline",
        message: `Cihaz ADB durumunda hazır değil: ${device.state}.`
      };
    }

    const installed = this.installedPackageInfo(adb, device.serial);
    if (!installed.installed) {
      return {
        ...device,
        appInstalled: false,
        installedVersionName: "",
        installedVersionCode: 0,
        bundledVersionName,
        bundledVersionCode,
        action: "install",
        message: "Yardımcı Asistan kurulu değil."
      };
    }

    let action: DesktopAndroidInstallAction = "current";
    let message = `Yardımcı Asistan ${installed.versionName || "sürümü bilinmiyor"} kurulu.`;
    if (bundledVersionCode > 0 && installed.versionCode > 0) {
      if (installed.versionCode < bundledVersionCode) {
        action = "update";
        message = `${installed.versionName || installed.versionCode} kurulu; ${bundledVersionName || bundledVersionCode} güncellemesi hazır.`;
      } else if (installed.versionCode > bundledVersionCode) {
        action = "newer";
        message = "Telefonda desktop paketindekinden daha yeni bir Android sürümü kurulu.";
      } else {
        message = `Yardımcı Asistan ${installed.versionName || bundledVersionName} güncel.`;
      }
    }

    return {
      ...device,
      appInstalled: true,
      installedVersionName: installed.versionName,
      installedVersionCode: installed.versionCode,
      bundledVersionName,
      bundledVersionCode,
      action,
      message
    };
  }

  private installedPackageInfo(adb: string, serial: string) {
    const pathResult = this.runAdb(adb, ["-s", serial, "shell", "pm", "path", PACKAGE_NAME], true);
    const installed = pathResult.status === 0 && pathResult.stdout
      .split(/\r?\n/)
      .some((line) => line.trim().startsWith("package:"));
    if (!installed) {
      return { installed: false, versionName: "", versionCode: 0 };
    }

    const dump = this.runAdb(adb, ["-s", serial, "shell", "dumpsys", "package", PACKAGE_NAME], true).stdout;
    const versionName = dump.match(/\bversionName=([^\s]+)/)?.[1]?.trim() ?? "";
    const versionCode = Number(dump.match(/\bversionCode=(\d+)/)?.[1] ?? 0);
    return {
      installed: true,
      versionName,
      versionCode: Number.isFinite(versionCode) ? versionCode : 0
    };
  }

  private isPackageInstalled(adb: string, serial: string) {
    return this.installedPackageInfo(adb, serial).installed;
  }

  private resolveAndroidPackage(): BundledAndroidPackage | null {
    if (app.isPackaged) {
      const metadataPath = join(process.resourcesPath, "android", "version.json");
      const apkPath = join(process.resourcesPath, "android", "yardimci-asistan-release.apk");
      const metadata = this.readVersionMetadata(metadataPath);
      return {
        apkPath,
        versionName: metadata.versionName,
        versionCode: metadata.versionCode,
        variant: "release"
      };
    }

    const repoRoot = this.developmentRepoRoot();
    const debugPath = join(
      repoRoot,
      "apps",
      "android-app",
      "build",
      "outputs",
      "apk",
      "debug",
      "yardimci-asistan-debug.apk"
    );
    const releasePath = join(
      repoRoot,
      "apps",
      "android-app",
      "build",
      "outputs",
      "apk",
      "release",
      "yardimci-asistan-release.apk"
    );
    const properties = this.readVersionProperties(join(repoRoot, "apps", "android-app", "version.properties"));
    if (existsSync(debugPath)) {
      return {
        apkPath: debugPath,
        versionName: properties.versionName ? `${properties.versionName}-debug` : "",
        versionCode: properties.versionCode,
        variant: "debug"
      };
    }
    return {
      apkPath: releasePath,
      versionName: properties.versionName,
      versionCode: properties.versionCode,
      variant: "release"
    };
  }

  private resolveAdbExecutable(): string {
    const executableName = process.platform === "win32" ? "adb.exe" : "adb";
    if (app.isPackaged) {
      const bundled = join(process.resourcesPath, "android", "platform-tools", executableName);
      if (existsSync(bundled)) {
        return bundled;
      }
    }

    if (process.env.ADB?.trim()) {
      return process.env.ADB.trim();
    }

    const sdkRoots = [
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT,
      process.platform === "win32" && process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, "Android", "Sdk")
        : "",
      process.platform !== "win32" ? join(homedir(), "Android", "Sdk") : ""
    ].filter((value): value is string => Boolean(value));

    const sdkAdb = sdkRoots
      .map((sdkRoot) => join(sdkRoot, "platform-tools", executableName))
      .find((candidate) => existsSync(candidate));
    return sdkAdb ?? executableName;
  }

  private developmentRepoRoot(): string {
    const moduleDirectory = dirname(fileURLToPath(import.meta.url));
    return resolve(moduleDirectory, "../../..");
  }

  private readVersionProperties(path: string) {
    if (!existsSync(path)) {
      return { versionName: "", versionCode: 0 };
    }
    const text = readFileSync(path, "utf8");
    const versionName = text.match(/^VERSION_NAME=(.+)$/m)?.[1]?.trim() ?? "";
    const versionCode = Number(text.match(/^VERSION_CODE=(\d+)$/m)?.[1] ?? 0);
    return {
      versionName,
      versionCode: Number.isFinite(versionCode) ? versionCode : 0
    };
  }

  private readVersionMetadata(path: string) {
    if (!existsSync(path)) {
      return { versionName: "", versionCode: 0 };
    }
    try {
      const value = JSON.parse(readFileSync(path, "utf8")) as {
        versionName?: unknown;
        versionCode?: unknown;
      };
      const versionCode = Number(value.versionCode ?? 0);
      return {
        versionName: String(value.versionName ?? "").trim(),
        versionCode: Number.isFinite(versionCode) ? versionCode : 0
      };
    } catch {
      return { versionName: "", versionCode: 0 };
    }
  }

  private parseDevices(output: string): AdbDevice[] {
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("List of devices attached") && !line.startsWith("*"))
      .map((line) => {
        const fields = line.split(/\s+/);
        const attributes = Object.fromEntries(
          fields.slice(2).flatMap((field) => {
            const separator = field.indexOf(":");
            return separator > 0 ? [[field.slice(0, separator), field.slice(separator + 1)]] : [];
          })
        );
        return {
          serial: fields[0] ?? "",
          state: fields[1] ?? "unknown",
          model: String(attributes.model ?? "").replaceAll("_", " ")
        };
      })
      .filter((device) => Boolean(device.serial));
  }

  private runAdb(adb: string, args: string[], allowFailure: boolean) {
    const result = spawnSync(adb, args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (result.error && !allowFailure) {
      throw result.error;
    }
    return {
      status: result.status ?? (result.error ? 1 : 0),
      stdout: String(result.stdout ?? ""),
      output,
      errorCode: (result.error as NodeJS.ErrnoException | undefined)?.code ?? ""
    };
  }

  private installFailureMessage(output: string): string {
    const detail = output || "ADB kurulum ayrıntısı döndürmedi.";
    if (detail.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) {
      return "Telefondaki uygulama farklı bir imzalama anahtarı kullanıyor. Veriyi korumak için otomatik kaldırma yapılmadı.";
    }
    if (detail.includes("INSTALL_FAILED_VERSION_DOWNGRADE")) {
      return "Desktop paketindeki Android sürümü telefondaki sürümden daha eski olduğu için kurulum durduruldu.";
    }
    if (detail.includes("INSTALL_FAILED_USER_RESTRICTED")) {
      return "Telefon kurulumu engelledi. Telefon ekranındaki USB/kurulum onayını kontrol edin.";
    }
    return `Android APK kurulamadı. ${detail}`;
  }
}

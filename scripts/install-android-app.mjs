import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "com.yardimciasistan.android";
const activityName = ".MainActivity";
const adbExecutable = findAdbExecutable();

try {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
  } else {
    installOnDevice(options);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function installOnDevice(options) {
  const variantLabel = options.variant === "release" ? "Release" : "Debug";
  const apkPath = join(
    repoRoot,
    "apps",
    "android-app",
    "build",
    "outputs",
    "apk",
    options.variant,
    `yardimci-asistan-${options.variant}.apk`
  );

  const device = selectDevice(options.serial);
  console.log(`ADB cihazı: ${device.serial}${device.model ? ` (${device.model})` : ""}`);

  if (!options.noBuild) {
    console.log(`${variantLabel} APK derleniyor...`);
    runCommand(
      process.execPath,
      [resolve(repoRoot, "scripts", "run-android-gradle.mjs"), `assemble${variantLabel}`],
      "Android derlemesi"
    );
  }

  if (!existsSync(apkPath)) {
    throw new Error(
      `APK bulunamadı: ${apkPath}\n` +
      `Önce derleme yapın veya --no-build seçeneğini kaldırın.`
    );
  }

  const alreadyInstalled = isPackageInstalled(device.serial);
  console.log(`Uygulama ${alreadyInstalled ? "güncelleniyor" : "kuruluyor"}: ${apkPath}`);

  const installResult = runAdb(["-s", device.serial, "install", "-r", apkPath], {
    allowFailure: true
  });
  const installOutput = formatOutput(installResult);

  if (installResult.status !== 0 || /\bFailure\s*\[/.test(installOutput)) {
    throw createInstallError(installOutput);
  }

  if (!isPackageInstalled(device.serial)) {
    throw new Error("ADB başarı bildirdi ancak uygulama telefonda doğrulanamadı.");
  }

  if (options.launch) {
    runAdb([
      "-s",
      device.serial,
      "shell",
      "am",
      "start",
      "-n",
      `${packageName}/${activityName}`
    ]);
  }

  console.log(
    `Android ${alreadyInstalled ? "güncellemesi" : "kurulumu"} tamamlandı` +
    `${options.launch ? " ve uygulama açıldı" : ""}.`
  );
}

function parseArgs(args) {
  const options = {
    variant: "debug",
    serial: process.env.ANDROID_SERIAL?.trim() ?? "",
    noBuild: false,
    launch: false,
    help: false
  };
  let explicitVariant = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--debug" || arg === "--release") {
      const variant = arg.slice(2);
      if (explicitVariant && explicitVariant !== variant) {
        throw new Error("--debug ve --release birlikte kullanılamaz.");
      }
      options.variant = variant;
      explicitVariant = variant;
    } else if (arg === "--serial" || arg === "-s") {
      const serial = args[index + 1]?.trim();
      if (!serial || serial.startsWith("-")) {
        throw new Error(`${arg} için bir cihaz seri numarası verilmeli.`);
      }
      options.serial = serial;
      index += 1;
    } else if (arg.startsWith("--serial=")) {
      options.serial = arg.slice("--serial=".length).trim();
      if (!options.serial) {
        throw new Error("--serial için bir cihaz seri numarası verilmeli.");
      }
    } else if (arg === "--no-build") {
      options.noBuild = true;
    } else if (arg === "--launch") {
      options.launch = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Bilinmeyen seçenek: ${arg}\nYardım için --help kullanın.`);
    }
  }

  return options;
}

function selectDevice(requestedSerial) {
  const result = runAdb(["devices", "-l"], { allowFailure: true });
  if (result.status !== 0) {
    throw new Error(`adb devices çalıştırılamadı.\n${formatOutput(result)}`.trim());
  }

  const devices = parseDevices(result.stdout);
  if (requestedSerial) {
    const requestedDevice = devices.find((device) => device.serial === requestedSerial);
    if (!requestedDevice) {
      throw new Error(
        `ADB cihazı bulunamadı: ${requestedSerial}\n` +
        "Bağlı cihazları görmek için `adb devices -l` çalıştırın."
      );
    }
    ensureDeviceReady(requestedDevice);
    return requestedDevice;
  }

  const readyDevices = devices.filter((device) => device.state === "device");
  if (readyDevices.length === 1) {
    return readyDevices[0];
  }

  if (readyDevices.length > 1) {
    const serials = readyDevices.map((device) => `  - ${device.serial}`).join("\n");
    throw new Error(
      `Birden fazla ADB cihazı bağlı:\n${serials}\n` +
      "Cihazı --serial <seri> ile veya ANDROID_SERIAL ortam değişkeniyle seçin."
    );
  }

  const unauthorizedDevice = devices.find((device) => device.state === "unauthorized");
  if (unauthorizedDevice) {
    throw new Error(
      `Cihaz ADB yetkisi bekliyor: ${unauthorizedDevice.serial}\n` +
      "Telefonun kilidini açıp USB hata ayıklama onayını kabul edin."
    );
  }

  const unavailableDevice = devices[0];
  if (unavailableDevice) {
    ensureDeviceReady(unavailableDevice);
  }

  throw new Error(
    "ADB cihazı bulunamadı. Telefonu bağlayın, geliştirici seçeneklerinden USB hata ayıklamayı açın " +
    "ve telefondaki bağlantı onayını kabul edin."
  );
}

function parseDevices(output) {
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
        serial: fields[0],
        state: fields[1] ?? "unknown",
        model: attributes.model?.replaceAll("_", " ") ?? ""
      };
    });
}

function ensureDeviceReady(device) {
  if (device.state === "device") {
    return;
  }

  if (device.state === "unauthorized") {
    throw new Error(
      `Cihaz ADB yetkisi bekliyor: ${device.serial}\n` +
      "Telefonun kilidini açıp USB hata ayıklama onayını kabul edin."
    );
  }

  throw new Error(
    `ADB cihazı kullanıma hazır değil: ${device.serial} (${device.state}).\n` +
    "USB bağlantısını ve telefon ekranındaki hata ayıklama durumunu kontrol edin."
  );
}

function isPackageInstalled(serial) {
  const result = runAdb(
    ["-s", serial, "shell", "pm", "path", packageName],
    { allowFailure: true }
  );
  return result.status === 0 && result.stdout.split(/\r?\n/).some((line) => line.startsWith("package:"));
}

function createInstallError(output) {
  const detail = output || "ADB kurulum ayrıntısı döndürmedi.";

  if (detail.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) {
    return new Error([
      "APK mevcut uygulamayla farklı bir anahtar kullanılarak imzalanmış.",
      "Telefon verisini korumak için uygulama otomatik kaldırılmadı.",
      "Aynı imzalama anahtarıyla yeniden derleyin veya veriyi kaybetmeyi kabul ediyorsanız uygulamayı telefondan elle kaldırın.",
      detail
    ].join("\n"));
  }

  if (detail.includes("INSTALL_FAILED_VERSION_DOWNGRADE")) {
    return new Error([
      "APK sürüm kodu telefondaki sürümden daha düşük.",
      "apps/android-app/version.properties içindeki VERSION_CODE değerini artırıp yeniden derleyin.",
      detail
    ].join("\n"));
  }

  if (detail.includes("INSTALL_FAILED_USER_RESTRICTED")) {
    return new Error([
      "Telefon kurulumu engelledi.",
      "Telefon ekranındaki kurulum/USB onayını ve cihaz güvenlik politikasını kontrol edin.",
      detail
    ].join("\n"));
  }

  return new Error(`APK kurulamadı.\n${detail}`);
}

function runAdb(args, options = {}) {
  const result = spawnSync(adbExecutable, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(
        "adb bulunamadı. Android SDK Platform-Tools'u kurup adb'yi PATH'e ekleyin veya " +
        "ANDROID_HOME/ANDROID_SDK_ROOT değişkenini ayarlayın."
      );
    }
    throw result.error;
  }

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`adb ${args.join(" ")} başarısız oldu.\n${formatOutput(result)}`.trim());
  }

  return result;
}

function runCommand(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} başarısız oldu.`);
  }
}

function findAdbExecutable() {
  if (process.env.ADB?.trim()) {
    return process.env.ADB.trim();
  }

  const executableName = process.platform === "win32" ? "adb.exe" : "adb";
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : "",
    process.platform !== "win32" ? join(homedir(), "Android", "Sdk") : ""
  ].filter(Boolean);
  const sdkAdb = sdkRoots
    .map((sdkRoot) => join(sdkRoot, "platform-tools", executableName))
    .find((candidate) => existsSync(candidate));

  return sdkAdb ?? executableName;
}

function formatOutput(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function printHelp() {
  console.log(`Bağlı Android telefona Yardımcı Asistan kurar veya mevcut kurulumu günceller.

Kullanım:
  npm run android:install
  npm run android:install -- --serial <cihaz-serisi>
  npm run android:install -- --release

Seçenekler:
  --debug             Debug APK derle ve kur (varsayılan).
  --release           İmzalı release APK derle ve kur.
  --serial, -s <id>   Birden fazla cihaz varsa hedef cihazı seç.
  --no-build          Mevcut APK'yı yeniden derlemeden kur.
  --launch            Kurulumdan sonra uygulamayı aç.
  --help, -h          Bu yardımı göster.

ANDROID_SERIAL ortam değişkeni de cihaz seçimi için kullanılabilir.
Güncelleme sırasında adb install -r kullanılır ve uygulama verisi korunur.`);
}

#!/usr/bin/env node
/**
 * One-time interactive setup for the central Meta Instagram Login broker.
 * The secret is read without terminal echo and sent via SSH stdin. Never
 * expose it in command arguments, stdout, source code or audit logs.
 */
import { spawn } from "node:child_process";
import { getInstallation } from "./lib/installation-registry.mjs";
const host = getInstallation("landing", process.cwd()).deploy.host;
if (!process.stdin.isTTY || !process.stdin.setRawMode) {
  console.error("Bu komutu kendi terminalinizde etkileşimli çalıştırın.");
  process.exit(1);
}
process.stdout.write("Meta Instagram App Secret (giriş gizlidir): ");
let value = "";
process.stdin.setEncoding("utf8");
process.stdin.setRawMode(true);
process.stdin.resume();
const secret = await new Promise((resolve, reject) => {
  process.stdin.on("data", chunk => {
    for (const char of chunk) {
      if (char === "\u0003") { process.stdin.setRawMode(false); reject(new Error("İptal edildi.")); return; }
      if (char === "\r" || char === "\n") {
        process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n");
        resolve(value.trim()); return;
      }
      if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
      else if (value.length < 300) value += char;
    }
  });
});
if (!secret || secret.length < 16 || secret.length > 300) {
  console.error("Geçersiz App Secret uzunluğu."); process.exit(1);
}
const script = `$secret=trim(stream_get_contents(STDIN));
if(strlen($secret)<16||strlen($secret)>300)exit(2);
$path="/home/yardimciasistan/.config/yardimci-asistan/instagram-oauth.json";
$result=file_put_contents($path,json_encode(["app_secret"=>$secret],JSON_THROW_ON_ERROR),LOCK_EX);
unset($secret);
if($result===false)exit(3);
chmod($path,0600);
echo "Sunucu Instagram OAuth yapılandırması hazır.\\n";`;
const command = `umask 077; mkdir -p /home/yardimciasistan/.config/yardimci-asistan; php -r '${script}'`;
const child = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, command], {
  stdio: ["pipe", "inherit", "inherit"]
});
child.stdin.end(secret + "\n");
const status = await new Promise(resolve => child.once("close", resolve));
if (status !== 0) {
  console.error("Sunucu yapılandırması tamamlanamadı."); process.exit(1);
}

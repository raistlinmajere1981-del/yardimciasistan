#!/usr/bin/env bash
set -Eeuo pipefail
case "${1:-}" in
  --dry-run) dry=true ;;
  --yes) dry=false ;;
  *) echo 'Kullanım: npm run deploy:gundogdu-web -- --dry-run | --yes' >&2; exit 2 ;;
esac
repo="$(cd -- "$(dirname -- "$0")/.." && pwd)"
get() { node "$repo/scripts/installation-config.mjs" get gundogdu "$1"; }
host="$(get deploy.host)"
root="$(get deploy.remoteRoot)"
backup="$(get deploy.backupDir)"
stage="$(get deploy.stageParent)"
url="$(get webModuleUrl)"
site="$(get siteUrl)"
ref="$(get credentialRef)"
expected='yardimciasistangunduodu'
[[ "$host" == "$expected@ssh-$expected.alwaysdata.net" ]] || exit 2
[[ "$root" == "/home/$expected/www/yardimci-asistan" ]] || exit 2
[[ "$backup" == "/home/$expected/backups" && "$stage" == "/home/$expected" ]] || exit 2
[[ "$site" == "https://$expected.alwaysdata.net" && "$url" == "$site/yardimci-asistan" ]] || exit 2
[[ "$ref" == 'alwaysdata-gundogdu' ]] || exit 2
for cmd in node npm php ssh rsync curl; do
  command -v "$cmd" >/dev/null || { echo "Eksik: $cmd" >&2; exit 1; }
done
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes)
echo "Gündoğdu web modülü SSH kontrolü: $host"
ssh "${ssh_opts[@]}" "$host" bash -s -- "/home/$expected/www" "$root" <<'CHECK'
set -Eeuo pipefail
www="$1"; root="$2"
[[ -d "$www" && ! -L "$www" && ! -L "$root" ]]
command -v php >/dev/null
command -v rsync >/dev/null
CHECK
state="$(ssh "${ssh_opts[@]}" "$host" bash -s -- "$root" <<'STATE'
set -Eeuo pipefail
root="$1"
if [[ -s "$root/api/version.php" ]]; then
  echo existing
elif [[ ! -e "$root" ]] || { [[ -d "$root" ]] && [[ -z "$(find "$root" -mindepth 1 -maxdepth 1 -print -quit)" ]]; }; then
  echo first
else
  echo blocked
fi
STATE
)"
[[ "$state" != blocked ]] || { echo 'Modül dizininde bilinmeyen içerik var, yayın durduruldu.' >&2; exit 1; }
echo "Modül durumu: $state"
if [[ "$dry" == true ]]; then
  echo 'Ön kontrol tamamlandı. Site köküne dokunulmayacak; sunucuda değişiklik yapılmadı.'
  exit 0
fi
cd "$repo"
if [[ "$state" == first ]]; then
  npm run prepare:web-install -- --url "$url" --name 'Gündoğdu Pansiyon Restoran' --no-print-secret
  mkdir -p artifacts/gundogdu
  cp -p artifacts/web-module-deploy/install-info.txt artifacts/gundogdu/install-info.txt
  chmod 600 artifacts/gundogdu/install-info.txt
else
  npm run pack:web-module
fi
ssh "${ssh_opts[@]}" "$host" bash -s -- "$root" "$backup" <<'BOOT'
set -Eeuo pipefail
root="$1"; backup="$2"
[[ ! -L "$root" && ! -L "$backup" ]]
mkdir -p "$root" "$backup"
BOOT
export YARDIMCI_ASISTAN_DEPLOY_HOST="$host"
export YARDIMCI_ASISTAN_DEPLOY_ROOT="$root"
export YARDIMCI_ASISTAN_DEPLOY_BACKUP_DIR="$backup"
export YARDIMCI_ASISTAN_DEPLOY_STAGE_PARENT="$stage"
export YARDIMCI_ASISTAN_PUBLIC_URL="$url"
if [[ "$state" == first ]]; then
  npm run deploy:web -- --yes --skip-pack --fresh
else
  npm run deploy:web -- --yes --skip-pack
fi
echo 'Yalnız Gündoğdu web modülü yayımlandı; tanıtım sitesine dokunulmadı.'
if [[ "$state" == first ]]; then
  echo 'Yerel kurulum anahtarı: artifacts/gundogdu/install-info.txt'
fi

#!/usr/bin/env bash
set -Eeuo pipefail
usage() {
  printf '%s\n' \
    'Teknikel Kombi Alwaysdata: yalnız mevcut Yardımcı Asistan web modülünü günceller.' \
    '  npm run deploy:teknikel-web -- --dry-run' \
    '  npm run deploy:teknikel-web -- --yes' \
    'Firma ayarları, sunucu verisi ve site kökü korunur. Temiz kurulum desteklenmez.'
}
if [[ $# != 1 ]]; then usage >&2; exit 2; fi
case "$1" in
  --dry-run|--yes) action="$1" ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac
repo_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
get() { node "$repo_root/scripts/installation-config.mjs" get teknikel "$1"; }
host="$(get deploy.host)"
root="$(get deploy.remoteRoot)"
backup="$(get deploy.backupDir)"
stage="$(get deploy.stageParent)"
url="$(get webModuleUrl)"
site="$(get siteUrl)"
credential_ref="$(get credentialRef)"
# Exact tenant guard prevents deployment into unrelated site/account.
[[ "$host" == 'yardimciasistantoptanci@ssh-yardimciasistantoptanci.alwaysdata.net' ]] || exit 2
[[ "$root" == '/home/yardimciasistantoptanci/www/yardimci-asistan' ]] || exit 2
[[ "$backup" == '/home/yardimciasistantoptanci/backups' ]] || exit 2
[[ "$stage" == '/home/yardimciasistantoptanci' ]] || exit 2
[[ "$site" == 'https://yardimciasistantoptanci.alwaysdata.net' ]] || exit 2
[[ "$url" == "$site/yardimci-asistan" ]] || exit 2
[[ "$credential_ref" == 'alwaysdata-teknikel' ]] || exit 2
for command_name in node npm ssh php rsync curl; do
  command -v "$command_name" >/dev/null || { echo "Eksik: $command_name" >&2; exit 1; }
done
echo 'Teknikel Alwaysdata: mevcut web modülü doğrulanıyor...'
ssh -o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes "$host" \
  bash -s -- "$root" "$backup" "$stage" <<'CHECK'
set -Eeuo pipefail
root="$1"; backup="$2"; stage="$3"
[[ -d "$root" && ! -L "$root" ]]
[[ -d "$backup" && ! -L "$backup" ]]
[[ -d "$stage" && ! -L "$stage" ]]
[[ -f "$root/api/version.php" && -f "$root/config/business.json" ]]
[[ -f "$root/data/yardimci-asistan.sqlite" ]]
[[ -f "$root/api/dealer/orders.php" && -f "$root/api/dealer/receipt.php" ]]
CHECK
export YARDIMCI_ASISTAN_DEPLOY_HOST="$host"
export YARDIMCI_ASISTAN_DEPLOY_ROOT="$root"
export YARDIMCI_ASISTAN_DEPLOY_BACKUP_DIR="$backup"
export YARDIMCI_ASISTAN_DEPLOY_STAGE_PARENT="$stage"
export YARDIMCI_ASISTAN_PUBLIC_URL="$url"
cd "$repo_root"
echo 'Kapsam: yalnız Teknikel www/yardimci-asistan; mevcut runtime/config korunur.'
npm run deploy:web -- "$action"
if [[ "$action" == '--yes' ]]; then
  echo 'Bayi uç noktalarının canlı PHP dosyaları doğrulanıyor...'
  ssh -o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes "$host" \
    bash -s -- "$root" <<'VERIFY'
set -Eeuo pipefail
root="$1"
for path in api/dealer/orders.php api/dealer/receipt.php api/dealer/catalog.php api/dealer/order.php; do
  test -s "$root/$path"
  php -l "$root/$path" >/dev/null
done
VERIFY
  echo 'Teknikel web modülü güncellendi. Teknikel site dosyalarına dokunulmadı.'
fi

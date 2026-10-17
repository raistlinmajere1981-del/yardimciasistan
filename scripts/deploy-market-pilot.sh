#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Market Pilot Alwaysdata sitesi ve Yardımcı Asistan web modülü.

Kullanım:
  npm run deploy:market-pilot -- --dry-run
  npm run deploy:market-pilot -- --yes

--dry-run : erişimi, yolları ve kaynakları kontrol eder; sunucuya yazmaz.
--yes     : yeni hesapta bir defalık temiz modül kurar; sonraki yayınlarda veriyi korur.
Web güvenlik anahtarı admin konsoluna yazılmaz. İlk kurulumun bilgileri
artifacts/market-pilot/install-info.txt dosyasında (yerel, Git dışı) saklanır.
EOF
}
if [[ "$#" -ne 1 ]]; then usage >&2; exit 2; fi
case "$1" in
  --help|-h) usage; exit 0 ;;
  --dry-run) dry_run=true ;;
  --yes) dry_run=false ;;
  *) usage >&2; exit 2 ;;
esac

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
site_source="$repo_root/test-site/market-pilot"
registry="$repo_root/scripts/installation-config.mjs"
get() { node "$registry" get market-pilot "$1"; }
host="$(get deploy.host)"
web_root="$(get deploy.remoteRoot)"
www_root="${web_root%/yardimci-asistan}"
home_root="${www_root%/www}"
backup_dir="$(get deploy.backupDir)"
web_url="$(get webModuleUrl)"
site_url="$(get siteUrl)"
expected_host='yardimciasistantest@ssh-yardimciasistantest.alwaysdata.net'
expected_home='/home/yardimciasistantest'

# Dedicated-tenant guard: never allow a registry mistake to target the live demo.
[[ "$host" == "$expected_host" && "$home_root" == "$expected_home" ]] || {
  echo 'HATA: Market Pilot ayrı Alwaysdata hesabının dışına yönlendirilemez.' >&2; exit 2;
}
[[ "$www_root" == "$expected_home/www" && "$web_root" == "$www_root/yardimci-asistan" ]] || exit 2
[[ "$backup_dir" == "$expected_home/backups" ]] || exit 2
[[ "$(get deploy.stageParent)" == "$expected_home" ]] || exit 2
[[ "$site_url" == 'https://yardimciasistantest.alwaysdata.net' ]] || exit 2
[[ "$web_url" == "$site_url/yardimci-asistan" ]] || exit 2

for executable in node npm php ssh rsync curl; do
  command -v "$executable" >/dev/null || { echo "Gerekli komut eksik: $executable" >&2; exit 1; }
done
php -l "$site_source/index.php" >/dev/null
[[ -s "$site_source/assets/market.css" ]] || { echo 'Market CSS bulunamadı.' >&2; exit 1; }

ssh_opts=(-o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes)
ssh_cmd="ssh -o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes"
printf 'Market Pilot: %s\n' "$site_url"
printf 'SSH erişimi kontrol ediliyor: %s\n' "$host"
ssh "${ssh_opts[@]}" "$host" bash -s -- "$www_root" "$web_root" <<'REMOTE_CHECK'
set -Eeuo pipefail
www="$1"
web="$2"
test -d "$www"
test ! -L "$web"
test ! -L "$www"
command -v php >/dev/null
command -v rsync >/dev/null
REMOTE_CHECK

module_state="$(ssh "${ssh_opts[@]}" "$host" bash -s -- "$web_root" <<'REMOTE_STATE'
set -Eeuo pipefail
root="$1"
if test -f "$root/api/version.php"; then
  echo existing
elif test ! -e "$root"; then
  echo first
elif test -d "$root" && test -z "$(find "$root" -mindepth 1 -maxdepth 1 -print -quit)"; then
  echo first
else
  echo blocked
fi
REMOTE_STATE
)"
[[ "$module_state" != blocked ]] || { echo 'Bilinmeyen içerik bulunan modül dizini korunuyor; yayın durduruldu.' >&2; exit 1; }
printf 'Web modülü durumu: %s\n' "$module_state"

# An unrelated index must never be silently replaced.
ssh "${ssh_opts[@]}" "$host" bash -s -- "$www_root" <<'REMOTE_SITE_CHECK'
set -Eeuo pipefail
www="$1"
if test -f "$www/index.php" && ! grep -q 'market-pilot-site' "$www/index.php"; then
  echo 'Market Pilot dışı index.php bulundu; yayın durduruldu.' >&2; exit 1
fi
if test -f "$www/index.html" && ! grep -qi 'alwaysdata' "$www/index.html"; then
  echo 'Varsayılan olmayan index.html bulundu; yayın durduruldu.' >&2; exit 1
fi
REMOTE_SITE_CHECK

if [[ "$dry_run" == true ]]; then
  echo 'Ön kontrol geçti. Site ve modül yayınlandığında yalnız Market Pilot hesabı değişecek.'
  echo 'Site: index.php + assets/market.css (diğer içerikler korunur).'
  if [[ "$module_state" == first ]]; then
    echo 'İlk kurulumda yeni ve bağımsız güvenlik anahtarı oluşturulacak.'
  else
    echo 'Güncellemede mevcut web bağlantısı ve runtime verileri korunacak.'
  fi
  exit 0
fi

cd "$repo_root"
if [[ "$module_state" == first ]]; then
  echo 'İlk web modülü paketi ve bağımsız secret hazırlanıyor...'
  npm run prepare:web-install -- --url "$web_url" --name 'Market Pilot' --no-print-secret
  mkdir -p "$repo_root/artifacts/market-pilot"
  cp -p "$repo_root/artifacts/web-module-deploy/install-info.txt" "$repo_root/artifacts/market-pilot/install-info.txt"
  chmod 600 "$repo_root/artifacts/market-pilot/install-info.txt"
else
  echo 'Mevcut veriyi koruyan modül güncelleme paketi hazırlanıyor...'
  npm run pack:web-module
fi

# Canonical module deploy needs its target and backup parent to exist.
ssh "${ssh_opts[@]}" "$host" bash -s -- "$web_root" "$backup_dir" <<'REMOTE_BOOTSTRAP'
set -Eeuo pipefail
web="$1"
backup="$2"
test ! -L "$web"
test ! -L "$backup"
mkdir -p "$web" "$backup"
REMOTE_BOOTSTRAP

export YARDIMCI_ASISTAN_DEPLOY_HOST="$host"
export YARDIMCI_ASISTAN_DEPLOY_ROOT="$web_root"
export YARDIMCI_ASISTAN_DEPLOY_BACKUP_DIR="$backup_dir"
export YARDIMCI_ASISTAN_DEPLOY_STAGE_PARENT="$home_root"
export YARDIMCI_ASISTAN_PUBLIC_URL="$web_url"
if [[ "$module_state" == first ]]; then
  npm run deploy:web -- --yes --skip-pack --fresh
else
  npm run deploy:web -- --yes --skip-pack
fi

echo 'Market ana sayfası hazırlanıyor...'
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
stage_index="$www_root/.market-pilot-index-$stamp.php"
rsync -az -e "$ssh_cmd" "$site_source/assets/" "$host:$www_root/assets/"
rsync -az -e "$ssh_cmd" "$site_source/index.php" "$host:$stage_index"
ssh "${ssh_opts[@]}" "$host" bash -s -- "$www_root" "$backup_dir" "$stage_index" "$stamp" <<'REMOTE_SITE_ACTIVATE'
set -Eeuo pipefail
www="$1"
backup="$2"
stage="$3"
stamp="$4"
test -f "$stage"
php -l "$stage" >/dev/null
mkdir -p "$backup/market-pilot-$stamp"
for index in index.php index.html; do
  if test -f "$www/$index"; then
    cp -p "$www/$index" "$backup/market-pilot-$stamp/$index"
  fi
done
mv "$stage" "$www/index.php"
# An unchanged Alwaysdata starter page would mask the new PHP index.
if test -f "$www/index.html"; then rm "$www/index.html"; fi
REMOTE_SITE_ACTIVATE

status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$site_url/")"
content="$(curl -fsS --max-time 20 "$site_url/")"
[[ "$status" == 200 && "$content" == *market-pilot-site* ]] || {
  echo "Market ana sayfası kontrol edilemedi: HTTP $status" >&2; exit 1;
}
echo "Market Pilot yayını tamamlandı: $site_url"
if [[ "$module_state" == first ]]; then
  echo 'Kurulum anahtarı: artifacts/market-pilot/install-info.txt (yalnız yerel)'
fi

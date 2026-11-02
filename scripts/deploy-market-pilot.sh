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
while IFS= read -r -d '' source_php; do
  php -l "$source_php" >/dev/null
done < <(find "$site_source" -name '*.php' -type f -print0)
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

# Permit only the owned Market Pilot site or the exact, site-domain-bound
# canonical staging adapter previously published in this same tenant.
ssh "${ssh_opts[@]}" "$host" bash -s -- "$www_root" <<'REMOTE_SITE_CHECK'
set -Eeuo pipefail
www="$1"
if test -f "$www/index.php" && ! grep -q 'market-pilot-site' "$www/index.php"; then
  if [[ "$(sha256sum "$www/index.php" | cut -d' ' -f1)" != 'a290a964d3399e51fdcf033c05bae7760bf8878396ee57a40bcd95375a856fea'       || ! -f "$www/site/config.php"       || ! -f "$www/.htaccess"       || "$(sha256sum "$www/.htaccess" | cut -d' ' -f1)" != '9fc4c75b0fd55205d5ce7a34dc5d803bfd5ed92aa4eeb8730758d3c977c0a0b0' ]]       || ! grep -Fq 'https://yardimciasistantest.alwaysdata.net' "$www/site/config.php"; then
    echo 'Market Pilot dışı index.php bulundu; yayın durduruldu.' >&2; exit 1
  fi
  echo 'Market Pilot ortak site adaptöründen güvenli geçiş doğrulandı.'
fi
if test -f "$www/.htaccess" && ! grep -q '# market-pilot-site' "$www/.htaccess"; then
  if [[ "$(sha256sum "$www/.htaccess" | cut -d' ' -f1)" != '9fc4c75b0fd55205d5ce7a34dc5d803bfd5ed92aa4eeb8730758d3c977c0a0b0' ]]; then
    echo 'Bilinmeyen kök htaccess dosyası bulundu; yayın durduruldu.' >&2; exit 1
  fi
fi
if test -f "$www/index.html" && ! grep -qi 'alwaysdata' "$www/index.html"; then
  echo 'Varsayılan olmayan index.html bulundu; yayın durduruldu.' >&2; exit 1
fi
REMOTE_SITE_CHECK

if [[ "$dry_run" == true ]]; then
  echo 'Ön kontrol geçti. Site ve modül yayınlandığında yalnız Market Pilot hesabı değişecek.'
  echo 'Site: index.php + .htaccess + assets/ + inc/ + magaza/ (diğer içerikler korunur).'
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
for site_directory in assets inc magaza; do
  rsync -az -e "$ssh_cmd" "$site_source/$site_directory/" "$host:$www_root/$site_directory/"
done
rsync -az -e "$ssh_cmd" "$site_source/index.php" "$host:$stage_index"
rsync -az -e "$ssh_cmd" "$site_source/.htaccess" "$host:$stage_index.htaccess"
ssh "${ssh_opts[@]}" "$host" bash -s -- "$www_root" "$backup_dir" "$stage_index" "$stamp" <<'REMOTE_SITE_ACTIVATE'
set -Eeuo pipefail
www="$1"
backup="$2"
stage="$3"
stamp="$4"
test -f "$stage"
test -f "$stage.htaccess"
grep -Fq '# market-pilot-site' "$stage.htaccess"
php -l "$stage" >/dev/null
mkdir -p "$backup/market-pilot-$stamp"
for index in index.php index.html .htaccess; do
  if test -f "$www/$index"; then
    cp -p "$www/$index" "$backup/market-pilot-$stamp/$index"
  fi
done
mv "$stage.htaccess" "$www/.htaccess"
mv "$stage" "$www/index.php"
# An unchanged Alwaysdata starter page would mask the new PHP index.
if test -f "$www/index.html"; then rm "$www/index.html"; fi
REMOTE_SITE_ACTIVATE

status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$site_url/")"
content="$(curl -fsS --max-time 20 "$site_url/")"
[[ "$status" == 200 && "$content" == *market-pilot-site* ]] || {
  echo "Market ana sayfası kontrol edilemedi: HTTP $status" >&2; exit 1;
}
for path in /assets/market.css /magaza/ /magaza/urun/; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$site_url$path")"
  [[ "$code" == 200 ]] || { echo "Market sayfası kontrolü başarısız: HTTP $code ($path)" >&2; exit 1; }
done
# Prune only this site's automatically produced rollback folders after HTTP
# acceptance. Keep the single latest site entry backup; the web module has its
# own independently managed one-backup retention.
ssh "${ssh_opts[@]}" "$host" bash -s -- "$backup_dir" <<'REMOTE_SITE_BACKUP_PRUNE'
set -Eeuo pipefail
backup="$1"
[[ -d "$backup" && ! -L "$backup" ]]
find "$backup" -mindepth 1 -maxdepth 1 -type d -name 'market-pilot-20*' -printf '%f\n' | LC_ALL=C sort -r | tail -n +2 | while IFS= read -r name; do
  [[ "$name" =~ ^market-pilot-20[0-9]{6}T[0-9]{6}Z-[0-9]+$ ]] || exit 2
  [[ ! -L "$backup/$name" ]] || exit 2
  rm -rf -- "$backup/$name"
done
REMOTE_SITE_BACKUP_PRUNE
echo "Market Pilot yayını tamamlandı: $site_url"
if [[ "$module_state" == first ]]; then
  echo 'Kurulum anahtarı: artifacts/market-pilot/install-info.txt (yalnız yerel)'
fi

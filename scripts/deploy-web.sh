#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Yardimci Asistan web modülünü Alwaysdata sunucusuna güvenli biçimde yayınlar.

Kullanım:
  npm run deploy:web -- [seçenekler]

Seçenekler:
  --dry-run      Sunucuda değişiklik yapmadan yayın farklarını gösterir.
  --skip-pack    Mevcut artifacts/web-module-deploy çıktısını kullanır.
  --fresh        Eski runtime/config verilerini taşımadan temiz kurulum yapar.
  --yes          Etkileşimli onay istemeden yayınlar.
  --help         Bu yardımı gösterir.

Ortam değişkenleri:
  YARDIMCI_ASISTAN_DEPLOY_HOST          SSH hedefi
  YARDIMCI_ASISTAN_DEPLOY_ROOT          Uzak web modülü dizini
  YARDIMCI_ASISTAN_DEPLOY_BACKUP_DIR    Uzak yedek dizini
  YARDIMCI_ASISTAN_DEPLOY_STAGE_PARENT  Uzak geçici dizin üst yolu
  YARDIMCI_ASISTAN_PUBLIC_URL           Canlı web modülü adresi

Normal yayında script canlı data/, config/business.json, config/*.local.*,
knowledge/, assets/, media/ ve kökteki .env* dosyalarını korur. --fresh kullanıldığında
bu veriler yeni sürüme taşınmaz; eski kurulum yine sunucudaki yedek dizinine alınır.
EOF
}

dry_run=false
skip_pack=false
fresh_install=false
assume_yes=false

while (($# > 0)); do
  case "$1" in
    --dry-run) dry_run=true ;;
    --skip-pack) skip_pack=true ;;
    --fresh) fresh_install=true ;;
    --yes) assume_yes=true ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Bilinmeyen seçenek: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "$script_dir/.." && pwd)"
package_dir="$project_root/artifacts/web-module-deploy/yardimci-asistan"

registry_get() {
  node "$project_root/scripts/installation-config.mjs" get "$1" "$2"
}

deploy_host="${YARDIMCI_ASISTAN_DEPLOY_HOST:-$(registry_get ya deploy.host)}"
remote_root="${YARDIMCI_ASISTAN_DEPLOY_ROOT:-$(registry_get ya deploy.remoteRoot)}"
remote_root="${remote_root%/}"
remote_parent="${remote_root%/*}"
backup_dir="${YARDIMCI_ASISTAN_DEPLOY_BACKUP_DIR:-$(registry_get ya deploy.backupDir)}"
backup_dir="${backup_dir%/}"
backup_parent="${backup_dir%/*}"
stage_parent="${YARDIMCI_ASISTAN_DEPLOY_STAGE_PARENT:-$(registry_get ya deploy.stageParent)}"
stage_parent="${stage_parent%/}"
public_url="${YARDIMCI_ASISTAN_PUBLIC_URL:-$(registry_get ya webModuleUrl)}"

if [[ ! "$deploy_host" =~ ^[A-Za-z0-9._@-]+$ ]]; then
  printf 'Geçersiz SSH hedefi: %s\n' "$deploy_host" >&2
  exit 2
fi

for remote_path in "$remote_root" "$backup_dir" "$stage_parent"; do
  if [[ ! "$remote_path" =~ ^/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$ ]]; then
    printf 'Güvenli olmayan uzak yol: %s\n' "$remote_path" >&2
    exit 2
  fi
done

remote_basename="${remote_root##*/}"
if [[ "$remote_basename" == "home" || "$remote_basename" == "www" || "$remote_basename" == "public_html" ]]; then
  printf 'Uzak hedef bir web kökü kadar geniş olamaz: %s\n' "$remote_root" >&2
  exit 2
fi
if [[ "$backup_dir/" == "$remote_root/"* || "$stage_parent/" == "$remote_root/"* ]]; then
  printf 'Yedek ve geçici yayın yolları canlı modülün dışında olmalıdır.\n' >&2
  exit 2
fi

if [[ ! "$public_url" =~ ^https?://[^[:space:]]+$ ]]; then
  printf 'Geçersiz canlı adres: %s\n' "$public_url" >&2
  exit 2
fi

required_commands=(node npm ssh rsync php mktemp)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Gerekli komut bulunamadı: %s\n' "$command_name" >&2
    exit 1
  fi
done

ssh_options=(-o BatchMode=yes -o ConnectTimeout=15)
rsync_ssh="ssh -o BatchMode=yes -o ConnectTimeout=15"
protected_paths=()
if [[ "$fresh_install" == false ]]; then
  protected_paths=(
    '--exclude=/data/***'
    '--exclude=/config/business.json'
    '--exclude=/config/*.local.php'
    '--exclude=/config/*.local.json'
    '--exclude=/knowledge/***'
    '--exclude=/assets/***'
    '--exclude=/media/***'
    '--exclude=/.env'
    '--exclude=/.env.*'
  )
fi

filter_rsync_changes() {
  awk '$1 !~ /^\.[fdLDS]$/'
}

cd -- "$project_root"

if [[ "$skip_pack" == false ]]; then
  printf 'Web modülü paketi hazırlanıyor...\n'
  (
    template_widget="$project_root/firm-template/web-module/widget.js"
    widget_snapshot_dir="$(mktemp -d)"
    cp -p "$template_widget" "$widget_snapshot_dir/widget.js"

    restore_template_widget() {
      cp -p "$widget_snapshot_dir/widget.js" "$template_widget"
      find "$widget_snapshot_dir" -depth -delete
    }
    trap restore_template_widget EXIT

    npm run pack:web-module
  )
fi

required_package_files=(
  magaza/index.php
  magaza/storefront.js
  magaza/storefront.css
  widget.js
  api/business.php
  api/chat.php
  api/menu.php
  api/catalog.php
  api/order.php
  lib/online-catalog.php
  lib/online-order.php
  api/rooms.php
  api/room-media.php
  api/tables.php
  api/table-media.php
  api/sync.php
  api/version.php
  config/business.json
  config/version.json
  data/.htaccess
  knowledge/.htaccess
)
for package_file in "${required_package_files[@]}"; do
  if [[ ! -f "$package_dir/$package_file" ]]; then
    printf 'Paket dosyası eksik: %s\n' "$package_dir/$package_file" >&2
    printf 'Paketi yeniden üretmek için npm run pack:web-module çalıştırın.\n' >&2
    exit 1
  fi
done

if [[ "$fresh_install" == true ]]; then
  package_sync_secret="$(php -r '$c=json_decode(file_get_contents($argv[1]), true); echo trim((string)($c["sync_secret"] ?? ""));' "$package_dir/config/business.json")"
  if [[ -z "$package_sync_secret" ]]; then
    printf 'Temiz kurulum paketinde sync secret yok. Önce şu komutu çalıştırın:\n' >&2
    printf '  npm run prepare:web-install -- --url %s\n' "$public_url" >&2
    exit 1
  fi
fi

printf 'Paket içindeki PHP dosyaları doğrulanıyor...\n'
while IFS= read -r -d '' php_file; do
  php -l "$php_file" >/dev/null
done < <(find "$package_dir" -type f -name '*.php' -print0)

printf 'SSH bağlantısı ve canlı modül doğrulanıyor...\n'
ssh "${ssh_options[@]}" "$deploy_host" bash -s -- \
  "$remote_root" "$remote_parent" "$backup_parent" "$stage_parent" <<'REMOTE_CHECK'
set -Eeuo pipefail
remote_root="$1"
remote_parent="$2"
backup_parent="$3"
stage_parent="$4"

test -d "$remote_root"
test -d "$remote_parent"
test -d "$backup_parent"
test -d "$stage_parent"
for command_name in rsync php find mv cp stat; do
  command -v "$command_name" >/dev/null
done

root_device="$(stat -c %d "$remote_parent")"
test "$root_device" = "$(stat -c %d "$backup_parent")"
test "$root_device" = "$(stat -c %d "$stage_parent")"
REMOTE_CHECK

printf '\nHedef: %s:%s\n' "$deploy_host" "$remote_root"
if [[ "$fresh_install" == true ]]; then
  printf 'Mod: temiz kurulum; eski runtime/config yeni sürüme taşınmayacak.\n\n'
else
  printf 'Korunan: data/, firma ve yerel config, knowledge/, assets/, media/, .env*\n\n'
fi

show_dry_run() {
  printf 'Kod ve güvenlik dosyalarındaki değişiklikler:\n'
  rsync -aznci --delete --omit-dir-times --itemize-changes \
    "${protected_paths[@]}" \
    -e "$rsync_ssh" \
    "$package_dir/" "$deploy_host:$remote_root/" \
    | filter_rsync_changes

  printf '\nCanlıda yoksa eklenecek asset dosyaları:\n'
  rsync -aznci --ignore-existing --omit-dir-times --itemize-changes \
    -e "$rsync_ssh" \
    "$package_dir/assets/" "$deploy_host:$remote_root/assets/" \
    | filter_rsync_changes

  printf '\nCanlıda yoksa eklenecek knowledge dosyaları:\n'
  rsync -aznci --ignore-existing --exclude='/.htaccess' --omit-dir-times --itemize-changes \
    -e "$rsync_ssh" \
    "$package_dir/knowledge/" "$deploy_host:$remote_root/knowledge/" \
    | filter_rsync_changes

  printf '\nKorumalı klasörlerin erişim kuralları:\n'
  rsync -aznci --omit-dir-times --itemize-changes \
    -e "$rsync_ssh" \
    "$package_dir/data/.htaccess" "$deploy_host:$remote_root/data/.htaccess" \
    | filter_rsync_changes
  rsync -aznci --omit-dir-times --itemize-changes \
    -e "$rsync_ssh" \
    "$package_dir/knowledge/.htaccess" "$deploy_host:$remote_root/knowledge/.htaccess" \
    | filter_rsync_changes
  rsync -aznci --omit-dir-times --itemize-changes \
    -e "$rsync_ssh" \
    "$package_dir/media/.htaccess" "$deploy_host:$remote_root/media/.htaccess" \
    | filter_rsync_changes
}

if [[ "$dry_run" == true ]]; then
  show_dry_run
  printf '\nDry-run tamamlandı; sunucuda değişiklik yapılmadı.\n'
  exit 0
fi

if [[ "$assume_yes" == false ]]; then
  if [[ ! -t 0 ]]; then
    printf 'Etkileşimsiz yayın için --yes kullanın.\n' >&2
    exit 2
  fi
  if [[ "$fresh_install" == true ]]; then
    printf 'UYARI: --fresh eski runtime/config verilerini yeni sürüme TAŞIMAZ. Eski kurulum yedeklenecektir.\n'
  fi
  read -r -p 'Bu paket canlı web modülüne yayınlansın mı? [e/H] ' answer
  if [[ ! "$answer" =~ ^[eEyY]$ ]]; then
    printf 'Yayın iptal edildi.\n'
    exit 0
  fi
fi

deploy_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
remote_stage="$stage_parent/.yardimci-asistan-deploy-stage-${deploy_stamp}-$$"
remote_backup="$backup_dir/yardimci-asistan-${deploy_stamp}"
stage_created=false

cleanup_stage() {
  if [[ "$stage_created" != true ]]; then
    return
  fi
  ssh "${ssh_options[@]}" "$deploy_host" bash -s -- "$remote_stage" <<'REMOTE_CLEANUP' \
    >/dev/null 2>&1 || printf 'Uyarı: geçici uzak dizin temizlenemedi: %s\n' "$remote_stage" >&2
set -Eeuo pipefail
remote_stage="$1"
if [[ -d "$remote_stage" ]]; then
  find "$remote_stage" -depth -delete
fi
REMOTE_CLEANUP
}
trap cleanup_stage EXIT

printf 'Geçici yayın alanı hazırlanıyor...\n'
ssh "${ssh_options[@]}" "$deploy_host" bash -s -- \
  "$remote_stage" "$backup_dir" "$remote_backup" <<'REMOTE_PREPARE'
set -Eeuo pipefail
remote_stage="$1"
backup_dir="$2"
remote_backup="$3"

test ! -e "$remote_stage"
test ! -e "$remote_backup"
mkdir -p "$remote_stage" "$backup_dir"
REMOTE_PREPARE
stage_created=true

rsync -az --delete --omit-dir-times \
  -e "$rsync_ssh" \
  "$package_dir/" "$deploy_host:$remote_stage/"

printf 'Sunucudaki geçici paketin PHP dosyaları doğrulanıyor...\n'
ssh "${ssh_options[@]}" "$deploy_host" \
  "find '$remote_stage' -type f -name '*.php' -exec php -l {} \\; >/dev/null"

if [[ "$fresh_install" == true ]]; then
  printf 'Temiz web modülü kurulumu etkinleştiriliyor...\n'
else
  printf 'Canlı veriler korunarak yeni sürüm etkinleştiriliyor...\n'
fi
ssh "${ssh_options[@]}" "$deploy_host" bash -s -- \
  "$remote_root" "$remote_stage" "$remote_backup" "$fresh_install" <<'REMOTE_ACTIVATE'
set -Eeuo pipefail
remote_root="$1"
remote_stage="$2"
remote_backup="$3"
fresh_install="$4"
old_moved=false

restore_old_release() {
  if [[ "$old_moved" == true && ! -e "$remote_root" && -d "$remote_backup" ]]; then
    mv "$remote_backup" "$remote_root"
  fi
}
trap restore_old_release EXIT
trap 'exit 130' HUP INT TERM

mv "$remote_root" "$remote_backup"
old_moved=true

if [[ "$fresh_install" != true ]]; then
if [[ -d "$remote_backup/data" ]]; then
  data_guard="$remote_stage/.deploy-data-htaccess"
  if [[ -f "$remote_stage/data/.htaccess" ]]; then
    cp -p "$remote_stage/data/.htaccess" "$data_guard"
  fi
  if [[ -d "$remote_stage/data" ]]; then
    find "$remote_stage/data" -depth -delete
  fi
  cp -a "$remote_backup/data" "$remote_stage/data"
  if [[ -f "$data_guard" ]]; then
    cp -p "$data_guard" "$remote_stage/data/.htaccess"
    find "$data_guard" -delete
  fi
fi

if [[ -f "$remote_backup/config/business.json" ]]; then
  cp -p "$remote_backup/config/business.json" "$remote_stage/config/business.json"
fi
for preserved_file in \
  "$remote_backup"/config/*.local.php \
  "$remote_backup"/config/*.local.json; do
  [[ -f "$preserved_file" ]] || continue
  cp -p "$preserved_file" "$remote_stage/config/"
done

if [[ -d "$remote_backup/knowledge" ]]; then
  mkdir -p "$remote_stage/knowledge"
  rsync -a --exclude='/.htaccess' \
    "$remote_backup/knowledge/" "$remote_stage/knowledge/"
fi
if [[ -d "$remote_backup/assets" ]]; then
  mkdir -p "$remote_stage/assets"
  rsync -a "$remote_backup/assets/" "$remote_stage/assets/"
fi
if [[ -d "$remote_backup/media" ]]; then
  mkdir -p "$remote_stage/media"
  rsync -a --exclude='/.htaccess' \
    "$remote_backup/media/" "$remote_stage/media/"
fi

for preserved_file in "$remote_backup"/.env "$remote_backup"/.env.*; do
  [[ -f "$preserved_file" ]] || continue
  cp -p "$preserved_file" "$remote_stage/"
done
fi

find "$remote_stage" -type f -name '*.php' -exec php -l {} \; >/dev/null
mv "$remote_stage" "$remote_root"
old_moved=false
trap - EXIT HUP INT TERM
REMOTE_ACTIVATE
stage_created=false

printf 'Yayınlanan kod dosyaları karşılaştırılıyor...\n'
verification="$(
  rsync -aznci --delete --omit-dir-times --itemize-changes \
    "${protected_paths[@]}" \
    -e "$rsync_ssh" \
    "$package_dir/" "$deploy_host:$remote_root/" 2>&1 \
    | filter_rsync_changes
)"
if [[ -n "$verification" ]]; then
  printf 'Yayın doğrulaması fark buldu:\n%s\n' "$verification" >&2
  printf 'Önceki sürüm: %s\n' "$remote_backup" >&2
  exit 1
fi

printf 'Korumalı klasörlerin erişim dosyaları karşılaştırılıyor...\n'
for protected_file in data/.htaccess knowledge/.htaccess media/.htaccess; do
  protected_verification="$(
    rsync -aznci --omit-dir-times --itemize-changes \
      -e "$rsync_ssh" \
      "$package_dir/$protected_file" "$deploy_host:$remote_root/$protected_file" 2>&1 \
      | filter_rsync_changes
  )"
  if [[ -n "$protected_verification" ]]; then
    printf 'Yayın doğrulaması %s için fark buldu:\n%s\n' \
      "$protected_file" "$protected_verification" >&2
    printf 'Önceki sürüm: %s\n' "$remote_backup" >&2
    exit 1
  fi
done

if command -v curl >/dev/null 2>&1; then
  printf 'Canlı web modülü sağlık kontrolü yapılıyor...\n'
  expected_web_version="$(node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(value.webModuleVersion ?? ""));' "$project_root/product-version.json")"
  version_json="$(curl --fail --silent --show-error --max-time 20 "${public_url%/}/api/version.php" || true)"
  live_web_version="$(php -r '$v=json_decode($argv[1] ?? "", true); echo trim((string)($v["web_module_version"] ?? ""));' "$version_json")"
  if [[ -z "$expected_web_version" || "$live_web_version" != "$expected_web_version" ]]; then
    printf 'Canlı web modülü sürümü uyuşmuyor: beklenen=%s canlı=%s\n' "$expected_web_version" "${live_web_version:-yok}" >&2
    printf 'Önceki sürüm: %s\n' "$remote_backup" >&2
    exit 1
  fi
  menu_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 20 \
    "${public_url%/}/api/menu.php" || true)"
  if [[ "$menu_status" != "200" && "$menu_status" != "404" ]] \
    || ! curl --fail --silent --show-error --max-time 20 \
      "${public_url%/}/widget.js" >/dev/null \
    || ! curl --fail --silent --show-error --max-time 20 \
      "${public_url%/}/api/business.php" >/dev/null \
    || ! curl --fail --silent --show-error --max-time 20 \
      "${public_url%/}/api/rooms.php" >/dev/null \
    || ! curl --fail --silent --show-error --max-time 20 \
      "${public_url%/}/api/tables.php" >/dev/null \
    || ! curl --fail --silent --show-error --max-time 20 \
      -X OPTIONS "${public_url%/}/api/chat.php" >/dev/null; then
    printf 'Yayın uygulandı ancak canlı HTTP kontrolü başarısız oldu.\n' >&2
    printf 'Önceki sürüm: %s\n' "$remote_backup" >&2
    exit 1
  fi
  storefront_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 20 \
    "${public_url%/}/magaza/" || true)"
  order_get_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 20 \
    "${public_url%/}/api/order.php" || true)"
  if [[ "$storefront_status" != "200" || "$order_get_status" != "405" ]]; then
    printf 'Yayın uygulandı ancak mağaza/order GET sağlık kontrolü başarısız oldu: mağaza=%s order=%s\n' "$storefront_status" "$order_get_status" >&2
    printf 'Önceki sürüm: %s\n' "$remote_backup" >&2
    exit 1
  fi
  if ! catalog_json="$(curl --fail --silent --show-error --max-time 20 \
    "${public_url%/}/api/catalog.php")" \
    || ! php -r '
      $catalog = json_decode($argv[1] ?? "", true);
      exit(json_last_error() === JSON_ERROR_NONE
        && is_array($catalog)
        && ($catalog["ok"] ?? false) === true
        && is_bool($catalog["enabled"] ?? null)
        && is_array($catalog["products"] ?? null) ? 0 : 1);
    ' "$catalog_json"; then
    printf 'Yayın uygulandı ancak public ürün kataloğu HTTP/JSON kontrolü başarısız oldu.\n' >&2
    printf 'Önceki sürüm: %s\n' "$remote_backup" >&2
    exit 1
  fi
fi

printf '\nYayın tamamlandı.\n'
printf 'Canlı adres: %s\n' "$public_url"
printf 'Önceki sürüm ve veri yedeği: %s\n' "$remote_backup"
if [[ "$fresh_install" == true ]]; then
  printf 'Temiz kurulum tamamlandı; eski runtime/config yalnız yedekte tutuluyor.\n'
else
  printf 'Canlı runtime verileri, firma ayarları, bilgi dosyaları, assetler ve medya korundu.\n'
fi

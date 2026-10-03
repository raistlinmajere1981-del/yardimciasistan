#!/usr/bin/env bash
set -Eeuo pipefail

dry_run=false
assume_yes=false
while (($# > 0)); do
  case "$1" in
    --dry-run) dry_run=true ;;
    --yes) assume_yes=true ;;
    --help|-h)
      cat <<'EOF'
Yardımcı Asistan merkezi destek raporu endpoint'ini Alwaysdata'ya yayınlar.

Kullanım:
  npm run deploy:support -- [--dry-run] [--yes]

Ortam değişkenleri:
  YARDIMCI_ASISTAN_DEPLOY_HOST
  YARDIMCI_ASISTAN_SUPPORT_WEB_ROOT
  YARDIMCI_ASISTAN_SUPPORT_STORAGE_ROOT
  YARDIMCI_ASISTAN_SUPPORT_PUBLIC_URL
EOF
      exit 0
      ;;
    *) printf 'Bilinmeyen seçenek: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "$script_dir/.." && pwd)"
source_dir="$project_root/infrastructure/support"

registry_get() {
  node "$project_root/scripts/installation-config.mjs" get "$1" "$2"
}

deploy_host="${YARDIMCI_ASISTAN_DEPLOY_HOST:-$(registry_get support deploy.host)}"
remote_web_root="${YARDIMCI_ASISTAN_SUPPORT_WEB_ROOT:-$(registry_get support deploy.remoteRoot)}"
storage_root="${YARDIMCI_ASISTAN_SUPPORT_STORAGE_ROOT:-$(registry_get support deploy.storageRoot)}"
public_url="${YARDIMCI_ASISTAN_SUPPORT_PUBLIC_URL:-$(registry_get support publicUrl)}"

for command_name in ssh rsync php curl; do
  command -v "$command_name" >/dev/null 2>&1 || { printf 'Eksik komut: %s\n' "$command_name" >&2; exit 1; }
done

if [[ ! -f "$source_dir/report.php" ]]; then
  printf 'Destek endpoint dosyası bulunamadı: %s\n' "$source_dir/report.php" >&2
  exit 1
fi
php -l "$source_dir/report.php" >/dev/null

for remote_path in "$remote_web_root" "$storage_root"; do
  if [[ ! "$remote_path" =~ ^/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$ ]]; then
    printf 'Güvenli olmayan uzak yol: %s\n' "$remote_path" >&2
    exit 2
  fi
done

ssh_options=(-o BatchMode=yes -o ConnectTimeout=15)
rsync_ssh="ssh -o BatchMode=yes -o ConnectTimeout=15"

printf 'Hedef: %s:%s\n' "$deploy_host" "$remote_web_root"
printf 'Özel rapor dizini: %s\n' "$storage_root"

ssh "${ssh_options[@]}" "$deploy_host" bash -s -- "$remote_web_root" "$storage_root" <<'REMOTE_PREP'
set -Eeuo pipefail
web_root="$1"
storage_root="$2"
mkdir -p "$web_root" "$storage_root"
chmod 700 "$storage_root"
test -w "$web_root"
test -w "$storage_root"
REMOTE_PREP

if [[ "$dry_run" == true ]]; then
  rsync -aznci --delete --omit-dir-times -e "$rsync_ssh" "$source_dir/" "$deploy_host:$remote_web_root/"
  printf '\nDry-run tamamlandı; sunucuda endpoint değiştirilmedi.\n'
  exit 0
fi

if [[ "$assume_yes" != true ]]; then
  if [[ ! -t 0 ]]; then
    printf 'Etkileşimsiz yayın için --yes kullanın.\n' >&2
    exit 2
  fi
  read -r -p 'Merkezi destek endpointi güncellensin mi? [e/H] ' answer
  [[ "$answer" =~ ^[eEyY]$ ]] || { printf 'Yayın iptal edildi.\n'; exit 0; }
fi

rsync -az --delete --omit-dir-times -e "$rsync_ssh" "$source_dir/" "$deploy_host:$remote_web_root/"
ssh "${ssh_options[@]}" "$deploy_host" bash -s -- "$remote_web_root" "$storage_root" <<'REMOTE_VERIFY'
set -Eeuo pipefail
web_root="$1"
storage_root="$2"
php -l "$web_root/report.php" >/dev/null
chmod 700 "$storage_root"
find "$web_root" -type f -name '*.php' -exec chmod 600 {} \;
REMOTE_VERIFY

status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 20 "$public_url")"
if [[ "$status" != "405" ]]; then
  printf 'Canlı destek endpoint kontrolü beklenmeyen HTTP kodu döndürdü: %s\n' "$status" >&2
  exit 1
fi

printf 'Destek endpointi yayınlandı: %s\n' "$public_url"

#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Canlı Yardımcı Asistan tanıtım web modülünün runtime verisini temizler ve
showcase business config dosyasını etkinleştirir.

Kullanım:
  npm run showcase:web:reset -- [--dry-run] [--yes]

Bu komut yalnız tanıtım hostingi içindir. data/ altındaki canlı runtime kayıtlarını
silerek web modülünü boş başlangıca döndürür. Ardından showcase masaüstü uygulaması
menü ve Android snapshot verisini normal sync hattından yeniden yayınlar.
EOF
}

dry_run=false
assume_yes=false
while (($# > 0)); do
  case "$1" in
    --dry-run) dry_run=true ;;
    --yes) assume_yes=true ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Bilinmeyen seçenek: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "$script_dir/.." && pwd)"
showcase_config="$project_root/firm-template/web-module/config/business.json"
deploy_host="${YARDIMCI_ASISTAN_DEPLOY_HOST:-yardimciasistan@ssh-yardimciasistan.alwaysdata.net}"
remote_root="${YARDIMCI_ASISTAN_DEPLOY_ROOT:-/home/yardimciasistan/www/yardimci-asistan}"
public_url="${YARDIMCI_ASISTAN_PUBLIC_URL:-https://yardimciasistan.alwaysdata.net/yardimci-asistan}"

if [[ ! -f "$showcase_config" ]]; then
  printf 'Showcase config bulunamadı: %s\n' "$showcase_config" >&2
  exit 1
fi
if [[ ! "$remote_root" =~ ^/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$ ]]; then
  printf 'Güvenli olmayan uzak yol: %s\n' "$remote_root" >&2
  exit 2
fi
if [[ ! "$deploy_host" =~ ^[A-Za-z0-9._@-]+$ ]]; then
  printf 'Geçersiz SSH hedefi: %s\n' "$deploy_host" >&2
  exit 2
fi
for command_name in ssh rsync; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Gerekli komut bulunamadı: %s\n' "$command_name" >&2
    exit 1
  }
done

printf 'Tanıtım web modülü: %s:%s\n' "$deploy_host" "$remote_root"
printf 'Silinecek: %s/data altındaki runtime kayıtları (.htaccess hariç)\n' "$remote_root"
printf 'Yüklenecek config: %s\n' "$showcase_config"

if [[ "$dry_run" == true ]]; then
  printf '\nDry-run: sunucuda değişiklik yapılmadı.\n'
  exit 0
fi

if [[ "$assume_yes" == false ]]; then
  if [[ ! -t 0 ]]; then
    printf 'Etkileşimsiz kullanım için --yes gerekli.\n' >&2
    exit 2
  fi
  read -r -p 'Tanıtım web verisi sıfırlansın mı? [e/H] ' answer
  [[ "$answer" =~ ^[eEyY]$ ]] || { printf 'İptal edildi.\n'; exit 0; }
fi

remote_config_temp="${remote_root%/*}/.yardimci-asistan-showcase-business-$$.json"
rsync -az -e 'ssh -o BatchMode=yes -o ConnectTimeout=15' \
  "$showcase_config" "$deploy_host:$remote_config_temp"

ssh -o BatchMode=yes -o ConnectTimeout=15 "$deploy_host" bash -s -- \
  "$remote_root" "$remote_config_temp" <<'REMOTE'
set -Eeuo pipefail
remote_root="$1"
remote_config_temp="$2"
data_dir="$remote_root/data"
config_dir="$remote_root/config"

test -d "$remote_root"
test -d "$config_dir"
test -f "$remote_config_temp"
mkdir -p "$data_dir"

# Bu hosting yalnız ürün tanıtımı için kullanılıyor. Runtime verisini tamamen
# temizlerken erişim korumasını taşıyan .htaccess dosyasını bırakıyoruz.
find "$data_dir" -mindepth 1 -depth ! -path "$data_dir/.htaccess" -delete
cp -p "$remote_config_temp" "$config_dir/business.json"
rm -f "$remote_config_temp"
REMOTE

printf '\nShowcase web runtime temizlendi.\n'
printf 'Şimdi tanıtım veritabanıyla Desktop uygulamasını açın; otomatik sync menü ve snapshot verisini yeniden yayınlayacak.\n'
printf 'Canlı modül: %s\n' "$public_url"

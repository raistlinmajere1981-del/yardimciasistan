# Yardımcı Asistan — Landing Deployment Source

Test landing sayfasının (`https://yardimciasistan.alwaysdata.net/`) kalıcı,
tekrar üretilebilir deploy kaynağıdır.

Bu repo **ana `YardimciAsistan` monoreposundan ayrıdır** ve yalnızca
landing yüzeyi (`www/` kökü) ile ilgilenir. Web modülüne dokunmaz.

## Landing vs web modülü ayrımı

| Katman | Canlı path | Kaynak |
|---|---|---|
| Landing (bu repo) | `/home/yardimciasistan/www/index.php` + `/home/yardimciasistan/www/assets/` + `/home/yardimciasistan/www/favicon.png` | Bu repo (`index.php`, `assets/`, `favicon.png`) |
| Web modülü (ayrı) | `/home/yardimciasistan/www/yardimci-asistan/` | Ana `YardimciAsistan` repo + `scripts/deploy-web.sh` |

Bu repo **asla** `www/yardimci-asistan/` altına yazmaz.

## Sync key'in tek kaynağı

Tek otoritatif kaynak, canlı web modülü configidir:

```
yardimci-asistan/config/business.json  ->  sync_secret
```

- `index.php` her istekte bu dosyayı **server-side** okur
  (`__DIR__ . '/yardimci-asistan/config/business.json'`).
- Değer varsa `meta[name="ya-sync-key"]` (HTML-escaped) ve
  `window.__YA_SYNC_KEY__` (JSON-encoded) üzerinden runtime'a verir.
- Dosya okunamazsa UI kırılmaz: ekranda `—` gösterilir, kullanıcıya
  stack trace gösterilmez.
- Bu test sitesinde anahtarın sayfada açık görünmesi bilinçli ve kabul
  edilmiştir.

## Secret kuralı

- `assets/index-*.js` içinde ne eski hardcoded test değeri
  ne de gerçek secret bulunmalıdır.
- Frontend anahtarı yalnızca `window.__YA_SYNC_KEY__`
  (fallback: `meta[name="ya-sync-key"]`) üzerinden okur.
- `index.php` içindeki inline `fetch` + DOM yaması **geçici compatibility
  katmanıdır**: orijinal React/Vite landing kaynağı bulunamadığı için
  (bkz. aşağısı) mevcut built bundle dosyasına dokunmadan, runtime'da
  doğru anahtarın kullanılmasını sağlar. Bundle yeniden üretilebilir
  hale geldiğinde bu katman kaldırılmalıdır.

## Orijinal kaynak durumu

Arama sonucu (Eylül 2026): orijinal landing React/Vite kaynağı ne lokal
makinede ne de sunucuda (`package.json`, `vite.config.*`, `*.tsx/jsx/ts`,
`.map`, `sourceMappingURL`, manifest) bulunamadı. Sunucuda ve staging /
backup'lerde yalnızca built statik asset'ler var.

Bu yüzden bu repo **B planıdır**: minified bundle'ı reverse-engineer
etmez; mevcut built `assets/` dosyalarını vendor artifact olarak aynen
taşır, düzeltmeyi `index.php`/source tarafında tutar.

## Yerel doğrulama

Repo kökünde (repo dışı paket indirmeden, sistem binary'leriyle):

```bash
php -l index.php
node --check scripts/deploy.mjs
```

Eski hardcoded test değeri ve canlı secret için repo genelinde arama
yapın; sonuç boş olmalı. `node scripts/deploy.mjs --dry-run` bu
taramaları otomatik yapar (çıktıda secret yazdırmaz).

Gerçek secret'ın repo içine gömülmediğini kontrol etmek için
(canlı secret'ı ekrana yazdırmadan):

```bash
LIVE_SECRET="$(ssh -o BatchMode=yes -o ConnectTimeout=15 \
  yardimciasistan@ssh-yardimciasistan.alwaysdata.net \
  'php -r '\''$c=json_decode(file_get_contents("www/yardimci-asistan/config/business.json"), true); echo trim((string)($c["sync_secret"] ?? ""));'\'')"
rg -n --fixed-strings -- "$LIVE_SECRET" index.php assets/ && echo "SECRET_LEAK" || echo "SECRET_CLEAN"
unset LIVE_SECRET
```

## Deploy

```bash
node scripts/deploy.mjs --dry-run   # değişiklik yapmadan farkı göster
node scripts/deploy.mjs --yes       # backup + atomic deploy + HTTP smoke
```

Deploy sırası:

1. Canlı landing dosyalarının timestamped yedeğini alır
   (`~/backups/landing-<stamp>/`: `index.php`, varsa `index.html`, `assets/`, `favicon.png`).
2. `index.php` + `favicon.png` dosyalarını geçici isimle yükler.
3. Sunucuda `php -l` / syntax kontrolü yapar.
4. Atomic `mv` ile devreye alır.
5. `assets/` içeriğini **ekleme/güncelleme** olarak eşitler (`--delete` yok;
   eski hash'li bundle'lar silinmez).
6. HTTP smoke yapar: `/` 200, `ya-sync-key` / `window.__YA_SYNC_KEY__`
   canlı config ile aynı, hardcoded yok, `business.php` / `menu.php` /
   `sync capabilities` / `operations (gerçek secret → ok:true,
   yanlış secret → 401)` kontrolü.

Deploy **asla** şunlara dokunmaz:

- `www/yardimci-asistan/config/business.json`
- `www/yardimci-asistan/data/` (SQLite dahil)
- `config/*.local.*`, AI local config
- web modülü kodu

## Backup / rollback

Her deploy sunucuda timestamped yedek bırakır:

```
~/backups/landing-YYYYMMDDTHHMMSSZ/
```

Geri alma (örnek):

```bash
ssh -o BatchMode=yes yardimciasistan@ssh-yardimciasistan.alwaysdata.net
cp -p backups/landing-<stamp>/index.php www/index.php
# gerekirse: cp -p backups/landing-<stamp>/assets/<dosya> www/assets/<dosya>
php -l www/index.php
curl -sL https://yardimciasistan.alwaysdata.net/ | head -n 20
```

## Deploy geçmişi

- `20260918T203012Z`: önceki canlı `index.html` + patch öncesi bundle'lar
  (`backups/landing-sync-key-20260918T203012Z/`).

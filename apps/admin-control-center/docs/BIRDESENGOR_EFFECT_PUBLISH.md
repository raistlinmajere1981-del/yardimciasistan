# BirDeSenGör V2 — Admin Efekt Atölyesi canlı yayın

## Kullanım

Efekt Atölyesi → BirDeSenGör → BirDeSenGör V2 kaynak sahnesi.

- Kaydet, sadece .studio-drafts yerel taslağını günceller.
- Site dosyasına hazırla, yalnızca doğrulanan efekt JSON dosyasını yerel web kaynaklarına aktarır.
- Siteye yayınla, son değişiklikleri kaydeder/hazırlar ve Natro clean-dry-run ön kontrolünü çalıştırır. Başarılı olursa birdesengorgizlievren.com için açık kullanıcı onayı ister.
- Onay verilirse mevcut birdesengor-natro clean-deploy aracı çalışır. Ardından npm run verify:live, HTTPS/JavaScript SHA-256 ve API doğrulamasını yapar. Hatalı doğrulama başarı sayılmaz.
- Vazgeç, ön kontrol hatası, kaynak/taslak değişikliği, geçersiz veya süresi dolmuş token canlı deploy'u engeller.

## Güvenlik ve kapsam

Sabit site hedefi: birdesengor:scene_v2. Dağıtım hedefi: birdesengor-effects-v2.
Sadece yetkili Linux geliştirme makinesinde, ~/.local/bin/birdesengor-natro ve
~/.config/channel-foundry/birdesengor-natro.env mevcutken kullanılabilir.
Özel test registries'leri veya başka site projeleri bu hakkı edinmez.

Yayın onayı sadece bir kere ve en çok on dakika geçerlidir. Onay bellekte tutulur.
İptalde veya kullanımda iptal edilir. Kaynak veya taslak değiştiğinde yeni ön kontrol gerekir.
Eşzamanlı doğrulama/release/deploy işlemleri varken başlamaz.

Canlı aktarım tek bir efekt dosyası değil, mevcut korumalı statik site deploy'udur:
yönetilen assets/, scene-assets/ ve eski scene/ eşitlenir.
content/, Studio yayınları, topluluk kayıtları, PHP API ve sunucu ayarları korunur.
Parolalar renderer'a gönderilmez ve loglanmaz.

## Uygulama

- Arayüz: src/EffectStudio.tsx
- IPC: electron/main.ts, electron/preload.ts, shared/contracts.ts
- İki aşamalı yayın: electron/services/birdesengor-effect-release-service.ts
- Dağıtım ilerlemesi ve durumları: electron/services/deployment-runner.ts
- Kanonik kaynak doğrulaması: EfektAtolyesi/scripts/admin-studio.mjs ve birdesengor-site.mjs
- Korumalı Natro aktarımı: ChannelFoundry/channels/birdesengor/web/scripts/deploy-natro.mjs

## Doğrulama

Admin klasöründe npm run typecheck, npm run build, ardından
node --test tests/birdesengor-effect-release-service.test.mjs
tests/effect-publication-service.test.mjs
tests/effect-studio-admin-scene-ui.test.mjs çalıştırılır.

Testler sahte deploy yöneticisi kullanır; canlıya dosya göndermez.

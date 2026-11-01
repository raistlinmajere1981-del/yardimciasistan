# Admin · Efekt Atölyesi

Kaynak efekt motoru: `../../../../EfektAtolyesi` (Yardımcı Asistan deposunun kardeşi).
Admin paneli yalnız düzenleme köprüsünü sağlar; efekt çizim motoru kopyalanarak build paketine alınır.

- Sol navigasyondaki **Efekt Atölyesi** tek sayfadır. Proje ve görsel listeleri
  `EfektAtolyesi/config/projects.json` üzerinden gelir.
- `npm run dev`, `npm run build` ve `npm run build:check` öncesinde
  `scripts/sync-effect-studio.mjs` otomatik çalışır; editör `public/effect-studio/`
  altına kopyalanır. Bu klasör build çıktısı gibi Git dışındadır.
- Renderer `src/EffectStudio.tsx` iframe mesajlarıyla kaynak editörle konuşur.
  Electron preload yalnız dört işlem verir: proje listele, sahne aç, yerel taslak
  kaydet, yalnız o sahneye ait hedefli yayın yap.
- Sunucu ve taslak işleri `EfektAtolyesi/scripts/admin-studio.mjs` sahibindedir;
  Admin Electron servisinde ikinci dosya parser'ı veya efekt doğrulaması yoktur.
- Yayın BlackSea için Admin'in mevcut `blacksea-natro` credentials kaydını okur,
  FTP üzerinden yalnız sahne dosyasını gönderir ve HTTPS'den JSON'u doğrular.
  Gündoğdu yeni şablonunda henüz efekt hedefi bağlanmadığından yayın kapalıdır.
- Aynı anda başka Admin deploy, release veya doğrulama çalışıyorsa efekt yayını
  başlatılmaz. Taslak oluşturmak canlı yayını değiştirmez.
- Site/runtime tarafına yeni efekt eklenirse önce canonical site motorunu güncelleyin,
  sonra yeni efektli sahne yayınlayın.

Kontroller: `npm run typecheck`, `npm run build`.
Efekt Atölyesi içinde `bash scripts/check.sh`, isteğe bağlı gerçek Electron
testi: `.test-artifacts/admin-effects-smoke.cjs` (Xvfb/Playwright).

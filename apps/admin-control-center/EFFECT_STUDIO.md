# Yardımcı Asistan — Efekt Atölyesi V2

Kaynak sahibi: packages/effect-engine/src/ (model, registry, runtime ve editor).
Bu kaynak Yardımcı Asistan reposuna aittir. ChannelFoundry ve BirDeSenGör
ayrı projelerdir: Admin bu projelerin kaynak kodunu okumaz veya değiştirmez.

Admin: src/EffectStudio.tsx + src/EffectPhotoEditorView.tsx. Editör React
ağacında tek çalışma alanı olarak monte edilir. Her montaj kendi önizlemesini,
tarihçesini, pointer, ResizeObserver ve klavye aboneliklerini tutar; ayrılırken
hepsini kapatır. iframe ve postMessage kullanılmaz.

Yayın sahibi: effects-source/scripts/admin-studio.mjs ve Admin
electron/services/effect-* hizmetleri. Yalnız izinli site fotoğrafı ve
v1 fotoğraf sahnesi düzenlenir; v2 nesne sahnesi ChannelFoundry kapsamındadır.
İlk etkinleştirme için tam site deploy ön kontrolü, sonraki yayınlarda yalnız
sahne güncellemesi korunur. Yayın açık kullanıcı onayı gerektirir.
Kaynak fotoğraf hash'i, sahne doğrulaması, otomatik yerel taslak kaydı
ve site yayın manifestleri aynı güvenlik sınırındadır.

Motoru eşitleme (açık işlem):
node web-site-template/tools/sync-effect-engine.mjs

Salt okunur doğrulama:
node web-site-template/tools/sync-effect-engine.mjs --check

Admin predev/prebuild yalnız kontrol çalıştırır; başka repo veya editör
snapshot kopyalama yolu yoktur. Gerçek sitelere deploy bu çalışmanın dışındadır.

Kabul: Admin typecheck/build, test-effect-ownership.mjs,
test-effect-engine-sync.mjs, effect-studio-ui.test.mjs.

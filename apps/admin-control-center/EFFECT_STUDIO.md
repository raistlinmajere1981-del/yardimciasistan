# Yardımcı Asistan Site Efekt Atölyesi

Admin yalnız kendi web sitelerinin fotoğraf efektlerini düzenler ve yönetir. BirDeSenGör nesne sahnesi ve yayın yetkisi Channel Foundry Sahne Atölyesi'ne devredildi.

Kanonik motor ve editör kaynağı: ChannelFoundry/packages/effect-engine/src. Admin site fotoğraf bağlama ve yayın servisi apps/admin-control-center/effects-source altındadır.

Fotoğraf editörü HTML/CSS, görseller ve örnekleri Admin effects-source içindedir. Ortak model, registry, runtime ve editör JavaScript'i her zaman Channel Foundry'den snapshot alınır.

Motor snapshot: node web-site-template/tools/sync-effect-engine.mjs
Admin snapshot: node apps/admin-control-center/scripts/sync-effect-studio.mjs
Salt okunur doğrulama: aynı komutlar --check ile.

Siteyi aktifleştirmek ve yayınlamak yalnız ilgili Admin deployment yetkisiyle mümkündür. Fotoğrafın nasıl gösterileceği siteye özeldir. Eski bağımsız EfektAtolyesi deposu çalışma zincirinde kullanılmaz ve yerel checkout kaldırılmıştır.


Temiz checkout sırasında predev/prebuild, Admin'in ignored public/effect-studio kopyasını sürümlü kaynaktan otomatik kurar. Genel site şablon motoru ise açık senkron adımıyla sabitlenir. Yayın doğrulamasında --check komutu hiçbir dosya yazmaz.

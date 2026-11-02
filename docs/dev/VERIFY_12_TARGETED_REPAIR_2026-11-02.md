# Verify kalan 12 kontrol — hedefli kapanış, 2 Kasım 2026

Başlangıç: `artifacts/verify/2026-11-02T16-03-47-129Z.json` — 287 PASS / 12 FAIL / 0 SKIP.

**Bu kayıt tam 299 kontrolün yeniden çalıştırıldığını söylemez.** İlk rapordaki başarısız 12 kontrol, güncel kodla ve aynı çalışma ağacında, doğrulama registry komutlarının bire bir karşılığı çalıştırılarak **12/12 PASS** verdi. Tam `npm run verify:pre-main` ve `npm run verify:release` yeniden çalıştırılmadı.

## Kök nedenler ve düzeltmeler

- Demo canonical şablonu Site Trafiği yeteneğiyle güncellenmişti; Demo fork kopyası ve manifest gerideydi. `scripts/sync-demo-template.mjs --write` ile sadece paylaşılan Demo core dosyaları ve yeni `traffic.mjs` eşitlendi. `showcase-website`, `release-tooling-tests` dry-run ve integrity PASS. Herhangi bir gerçek deploy yok.
- Özel bayi katalogları artık yalnız **doğrulanmış hesapla bağlanmış** müşterilere yayımlanıyor. İki commerce fixture, bağlantısız bayi için sıfır katalog ve sentetik bağlı bayi için özel katalog/görsel akışını doğrulayacak şekilde güncellendi. Üretimdeki güvenli kısıt kaldırılmadı.
- Site Trafiği yeteneği `traffic_analytics_v1` senkron sözleşmesine eklendi; pazarlama analitiği testleri güncel Dashboard rapor yönlendirmesiyle eşitlendi.
- Site Trafiği kartında strict lint için bilinmeyen JSON yanıtı typed `unknown`; React effect referansı güvenli yakalandı. Tasarım denetiminde baseline yükseltilmeden grafik barları CSS token renkli SVG rect olarak çizildi; piksel köşe yarıçapı kaldırıldı.
- Admin efekt-stüdyo UI testi, projede var olan `@playwright/test` paketinden `chromium` alıyor; Knip yeni dependency gerektirmeden temiz.
- Bayi Android Gradle/lint, `desktop-ui-family` ve `web-dealer-portal` ilk raporda FAIL iken **herhangi üretim düzeltmesi olmadan** hedefli tekrar koşuda PASS. Ortam / test sırası geçiciliği olasılığı korunuyor; kesin kök neden kanıtlanmadı.

## Başarısız 12 kontrolün hedefli tekrar sonuçları

| Check ID | Durum | Süre |
|---|---|---:|
| `automatic-sync` | PASS | 20.2 sn |
| `commerce-dealer-access` | PASS | 1.0 sn |
| `commerce-product-media-publication` | PASS | 2.2 sn |
| `dealer-android-build` | PASS | 39.8 sn |
| `design-audit-strict` | PASS | 1.5 sn |
| `desktop-ui-family` | PASS | 8.2 sn |
| `knip-strict` | PASS | 8.7 sn |
| `lint-strict` | PASS | 6.2 sn |
| `marketing-analytics-ui` | PASS | 20.6 sn |
| `release-tooling-tests` | PASS | 11.1 sn |
| `showcase-website` | PASS | 42.3 sn |
| `web-dealer-portal` | PASS | 12.9 sn |

## Sonraki kabul sınırı

- Kullanıcının tam pre-main/release paketini yeniden çalıştırması; ayrıca imzalı Bayi APK sürüm artışı (code > 22), canlı Teknikel TTL girişi, fiziksel Companion–masaüstü gerçek bağlantı kesintisi ve Windows testleri önceki handoff kapsamında açık.
- Bu çalışma yalnız **kaynak/test düzeltmesi ve Demo yerel şablon eşitlemesi** yaptı: canlı sunucuya SSH/rsync/deploy, APK kurulumu veya Git push yapılmadı.

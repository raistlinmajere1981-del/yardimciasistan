# Yardımcı Asistan — Güncel Görev Planı

> Güncellik: 2026-09-03

Bu belge Yardımcı Asistan'ın güncel çalışma sırasını tanımlar. Ayrıntılı capability/commerce kararları için `docs/MODULAR_BUSINESS_FOUNDATION.md` esas alınır.

## Değiştirilmeyecek ürün sözleşmesi

- Masaüstü local-first çalışır; internet temel operasyonları durdurmaz.
- Hosting mini API, Web/Android ile Desktop arasında değişim noktasıdır; PC'ye dışarıdan port açılmaz.
- AI ve WhatsApp yardımcı/opsiyonel servislerdir.
- Android doğrudan Desktop SQLite'a bağlanmaz; action/snapshot sözleşmesini kullanır.
- İşletme profili yalnız ilk preset'tir.
- **Persisted business capabilities runtime source of truth'tur.**
- Yeni feature gate'leri `businessType === ...` üzerinden yazılmaz.
- Hibrit işletmeler yeni business type kombinasyonlarıyla değil capability ekleme/çıkarma ile oluşur.
- Renderer SQLite/store import etmez; Electron erişimi preload/IPC üzerinden yapılır.
- Sandboxed preload dependency-light kalır.

---

# Aşama 0 — Modüler altyapı checkpoint'i

Bu aşama Market UI başlamadan önce tamamlanmış kabul edilir.

Tam kontrol:

```bash
node scripts/check-modular-foundation.mjs
```

Beklenen son satır:

```text
modular-foundation-check-ok
```

Runner şunları kapsar:

```text
build:packages
desktop build
quality:strict
business capabilities smoke
capability runtime v2 smoke
setup capability contract smoke
commerce foundation smoke
commerce runtime smoke
```

Aşağıdaki eski alanlar bazı backend compatibility yollarında fiziksel olarak kalabilir ancak yeni kod tarafından source of truth olarak kullanılmaz:

```text
business.modules_json
settings.rooms_enabled
settings.tables_enabled
settings.qr_menu_enabled
```

Bunların fiziksel silinmesi, büyük setup/database persistence kodu daha küçük repository/service katmanlarına ayrılırken yapılacak bakım işidir; Market mimarisini bloke etmez.

---

# Aşama 1 — Market / Perakende MVP

Yeni session'ın ana işi budur.

## M1.1 — Commerce repository tamamla

- kategori CRUD
- ürün liste/arama
- exact barkod lookup
- stok bakiye ve hareket geçmişi
- fiziksel sayım
- tedarikçi CRUD
- temel satın alma / stock-in servis sınırı
- gerekirse minimum purchase order servisleri

## M1.2 — Market IPC / preload contract

```text
Renderer Market Workspace
  ↓
preload bridge
  ↓
commerce IPC
  ↓
commerce-runtime
  ↓
commerce-store
  ↓
SQLite
```

Her mutation ilgili capability ile korunmalıdır.

## M1.3 — Market workspace

İlk ekran küçük işletmenin günlük hızına göre düzenlenir:

```text
Hızlı Satış
Ürünler
Stok
Tedarikçiler / Alım
Etiketler
```

Büyük ERP dashboard'u yapılmaz.

## M1.4 — Hızlı satış

Kabul kriterleri:

- barkod veya ürün arama,
- sepete ekleme,
- adet değiştirme,
- toplam hesaplama,
- basit ödeme yöntemi (nakit/kart),
- tek transaction ile paid sale,
- stok düşümü,
- yetersiz stok/başarısız işlemde tam rollback,
- duplicate sale üretmeme.

## M1.5 — Barkod abstraction

İlk sıra:

1. Simulator / elle barkod girişi
2. USB keyboard scanner
3. Android camera scanner (sonraki alt faz)

Market MVP gerçek scanner donanımına bağımlı olmamalıdır.

## M1.6 — Etiket MVP

İlk sürüm:

- Preview
- PDF/PNG

Gerçek saha yazıcısı belli olduğunda adapter:

- ZPL
- TSPL
- gerekirse Windows printer adapter

## M1.7 — Market profilini aç

Market workspace'in minimum günlük akışı ve smoke testleri tamamlandıktan sonra shared registry'de:

```text
market.availability = available
```

olur ve setup selector'a eklenir.

---

# Aşama 2 — Market saha testi

MVP tamamlandıktan sonra sahte ürün verisiyle en az şu akışlar test edilir:

- yeni ürün + barkod,
- ilk stok girişi,
- barkodla art arda satış,
- stok minimum uyarısı,
- fiziksel sayım farkı,
- fire/waste hareketi,
- tedarikçiden alım,
- restart sonrası stok/satış bütünlüğü,
- yanlış/tekrarlı barkod,
- yetersiz stok rollback,
- profil/capability kapatıldığında Market mutation'larının backend'de reddedilmesi.

---

# Aşama 3 — Ortak commerce entegrasyon kararları

Market sahası görüldükten sonra restoran ve retail commerce ortaklığı tekrar değerlendirilir.

Şimdilik:

- restoran `menu_items/table_orders` yapısı korunur,
- retail `catalog_products/commerce_sales/inventory_*` kullanır,
- iki domain birbirine zorla migrate edilmez,
- ortak kavramlar shared commerce tiplerinde tutulur.

Gerçek tekrar ve saha ihtiyacı görülmeden iki veri modelini birleştirme refaktörü yapılmaz.

---

# Paralel kalite kuralları

Her anlamlı paket sonunda:

```bash
npm run quality:strict
```

Market altyapı checkpoint'lerinde ayrıca:

```bash
node scripts/check-modular-foundation.mjs
```

Yeni testler mevcut runner'a veya Market'e özel yeni smoke'a eklenmelidir.

Lint için yeni error kabul edilmez. Knip'te yeni unused file/dependency/unlisted dependency bırakılmaz. Design audit baseline borcu artırılmaz. Architecture audit kuralları gevşetilmez.

---

# Pilot / dağıtım backlog'u

Market geliştirmesinden bağımsız olarak mevcut ürünün gerçek saha doğrulamasında hâlâ değerlendirilecek başlıklar:

- hedef Windows bilgisayarda temiz installer testi,
- birkaç günlük pansiyon + restoran gerçekçi kullanım,
- restart + kalıcı sync kuyruğu,
- gerçek Android cihaz onay/token/pasifleştirme akışı,
- WhatsApp WebView ve gerçek hosting bağlantısı,
- veri/kimlik kullanımına göre KVKK ve at-rest encryption kararı.

Bunlar capability-first Market mimarisini eski sektör modeline geri çevirmek için gerekçe değildir.

---

# Bilinçli olarak ertelenenler

Gerçek ihtiyaç kanıtlanmadan eklenmez:

- resmî WhatsApp Business API,
- Android↔PC doğrudan LAN modu,
- merkezi Yardımcı Asistan cloud servisi,
- büyük ölçekli organizasyon/rol sistemi,
- ileri muhasebe/ERP,
- gelişmiş satın alma/lojistik sistemi,
- her yazıcı/scanner markasına özel doğrudan UI kodu.

---

# Yeni session başlangıç sırası

1. Repo `main` güncel head'i oku.
2. `docs/MODULAR_BUSINESS_FOUNDATION.md` dosyasını oku.
3. `node scripts/check-modular-foundation.mjs` çalıştır.
4. Yeşilse **M1.1 Commerce repository** işinden başla.
5. Market UI'ye geçmeden önce commerce IPC/runtime sözleşmesini tamamla.

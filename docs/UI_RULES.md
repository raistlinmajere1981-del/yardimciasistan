# Yardımcı Asistan — UI Kuralları

Bu belge güncel ürün arayüz kurallarını tanımlar. Masaüstü mimari kararlarında ayrıca
`docs/architecture/APPLICATION_ARCHITECTURE_CONSTITUTION_V1.md` ve
`docs/architecture/DOMAIN_DECISIONS_V1.md` yetkilidir.

## Genel ilke

Yardımcı Asistan küçük işletme sahibinin günlük işini hızlandırmalıdır. Arayüz:

- kısa ve anlaşılır Türkçe kullanır
- teknik terimi yalnız gerçekten gerekliyse gösterir
- günlük işi, bekleyen aksiyonu ve sonucu görünür kılar
- aynı varlık için birden fazla bağımsız editör üretmez
- aynı iş operasyonunu farklı ekranlarda yeniden uygulamaz
- görünürlük ile yetkiyi birbirine karıştırmaz

## Masaüstü uygulama grameri

Masaüstünde dört temel kavram vardır:

- **Page** — operasyon alanı; ör. Pansiyon, Restoran, Market, Mesajlar.
- **Entity Workspace** — tek varlığın canonical çalışma alanı; ör. Room, Customer, Table, Product, Menu Item.
- **Operation/Subflow** — gerçek iş eylemi; ör. ödeme, oda atama, sipariş kapatma.
- **Projection** — Dashboard/Calendar/kart/listeler gibi özet ve launcher yüzeyleri.

Bir projection bağımsız editöre dönüşmemelidir.

## Navigasyon

Global sidebar capability-projected navigation kullanır. Sektör adı doğrudan görünürlük
anahtarı değildir; persisted runtime capability snapshot belirleyicidir.

Feature içinde ikinci seviye görünüm gerekiyorsa page-local selector kullanılabilir.
Entity içindeki modlar `WorkspaceTabs` ile gösterilir. Page selector ile entity tab aynı
semantik değildir.

## Workspace kuralları

Canonical entity editörü `WorkspaceFrame`/Workspace platformu üzerinden açılır.

- centered veya full-canvas sunum aynı state'i korur
- presentation değişimi workspace'i remount etmemelidir
- kapatma focus'u launcher'a geri verir
- dirty/busy close guard korunur
- modal içinde ikinci modal açılmaz
- farklı entry point'ler aynı canonical workspace'i açabilir

Drawer yeni entity editörü için kullanılmaz. Supplemental drawer yalnız gerçekten
ikincil, non-canonical bir yüzey gerekirse düşünülebilir.

## Settings

Ayarlar dört sabit kategori kullanır:

- İşletme
- İşletme Düzeni
- Servisler
- Uygulama

Yalnız aktif kategori ana gövdede render edilir. Staged draft/save category-scoped'tur.
Appearance immediate preference'tır. Backup, update, password ve cihaz revoke gibi
işlemler staged field gibi davranmaz; açık action/resource lifecycle'ı kullanır.

Yeni staged Settings katkıları mevcut typed contribution seam'i ve field ownership
modelini kullanır. Yeni top-level Settings tabı varsayılan çözüm değildir.

## Appearance

Tek görünüm sistemi vardır:

- scheme: system / light / dark
- density: comfortable / compact
- scale
- accent preset
- font preset
- motion

`easy/pro`, `data-theme`, `data-mode` veya feature-specific tema dalları yoktur.

Renk, radius, spacing, tipografi, focus ve ortak control geometrisi design token/primitive
katmanından gelir. Feature CSS palette sahiplenmez.

## Eylemler ve geri bildirim

Bir eylemin etiketi sonucu açıklar: “Kaydet”, “Odaya Yaz”, “Çıkışı Tamamla” gibi.

Destructive işlemde hedef ve sonuç anlaşılır olmalıdır. Her küçük işlem için onay modalı
açılmaz; geri döndürülemez veya önemli sonuçlu işlemler açık onay/guard kullanır.

Feedback en yakın doğru seviyede gösterilir:

- field validation → field
- section operasyonu → section
- workspace yükleme/mutation hatası → workspace
- global bağlantı/sistem sorunu → global status

Finans, stok ve satış mutasyonlarında backend onayı gelmeden başarı gösterilmez.

## Dashboard ve Calendar

Dashboard hızlı karar projection'ıdır; rapor veya ikinci editör değildir.

Calendar zaman projection'ı ve launcher'dır; reservation/task editör sahipliği almaz.
Launcher canonical workspace/page/operation'a yönlendirir.

## Mesajlar ve AI

WhatsApp Web kullanıcı kontrolündedir. Uygulama mesaj içeriğini hazırlayabilir; otomatik
gönderim yapmaz.

WhatsApp login oturumu `persist:yardimci-whatsapp` partition tarafından korunur.
Hazır Mesajlar, Müşteri İşleri içinde embedded bir yüzeydir; Müşteri İşleri dışına
çıkıldığında renderer surface unmount olabilir. Otomatik doğum günü gönderimi
renderer sekmesinden bağımsız Electron otomasyon lifecycle'ına aittir.

AI sonucu kullanıcı tarafından gözden geçirilebilir ve düzenlenebilir olmalıdır. AI kesin
rezervasyon/müsaitlik/fiyat yetkilisi gibi davranmaz.

## Android Companion

Android masaüstünün kopyası değildir. Hızlı görüntüleme ve izin verilmiş hızlı aksiyonları
sunmalıdır.

Gerçek yetki masaüstü SQLite/capability/permission katmanındadır. UI'da bir düğmenin
gizlenmesi güvenlik sınırı değildir.

## Web widget

Widget sade, mobil öncelikli ve mevcut siteyi bozmayan bir müşteri giriş yüzeyidir.
Sektör/capability'ye göre uygun talep veya rezervasyon seçenekleri gösterilir.

Telefon formatı ülkeye kilitlenmez. Tarih/saat gösterimi kullanıcı diline uygun olmalıdır.

## Erişilebilirlik ve responsive davranış

- yalnız renkle durum anlatılmaz
- form label'ları gerçek control ile bağlıdır
- keyboard focus görünürdür
- modal/workspace focus davranışı test edilir
- dar viewportta page document taşması yaratılmaz
- aktif workspace/page gövdesi kendi scroll alanını sahiplenir
- reduced-motion tercihi desteklenir

## Kapanış kuralı

Yeni bir UI yüzeyi eklemeden önce şu sorular cevaplanır:

1. Bu bir Page, Entity Workspace, Operation, Setting veya Projection mı?
2. Canonical owner kim?
3. Hangi capability gerekli?
4. State ne kadar süre yaşamalı?
5. Mevcut workspace/operation tekrar kullanılabilir mi?
6. Hangi davranış testi bunu koruyacak?

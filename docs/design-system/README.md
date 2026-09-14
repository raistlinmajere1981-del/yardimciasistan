# Desktop design system migration

Başlangıç: `main`, `febf582a0a9ce935c3f525b0fef80b5bd54eaf4a`; çalışma ağacı temizdi. Refactor doğrudan `main` üzerinde hazırlandı; yeni branch oluşturulmadı. Bu çalışma renderer sunumunu, stylesheet organizasyonunu ve UI test sözleşmesini değiştirir. Database, IPC implementasyonu, sync, AI, availability ve uygulama tercihlerinin saklanması değiştirilmez.

## Stil ağacı

```text
apps/desktop-app/src/styles/
  index.css
  tokens/
    primitives.css
    semantic.css
    typography.css
    dimensions.css
  themes/
    light.css
    dark.css
    easy.css
  foundation/
    reset.css
    base.css
    typography.css
    focus.css
  components/
    buttons.css
    forms.css
    panels.css
    badges.css
    disclosures.css
    dialogs.css
    feedback.css
    metrics.css
    motion.css
    operations.css
    records.css
    resources.css
    segmented-control.css
  layout/
    app-shell.css
    page.css
    responsive.css
  pages/
    settings.css
    setup.css
    ai.css
    calendar.css
    customers.css
    dashboard.css
    devices.css
    finance.css
    lock.css
    market.css
    menu.css
    menu-preview.css
    messages.css
    pension.css
    reports.css
    requests.css
    restaurant.css
    room-folio.css
  utilities.css
```

Haritanın tile/pin geometrisi component yanında `components/settings/business-location-map-picker.css` içinde kalır; ana girişten `pages` katmanıyla yüklenir. IBM Plex Sans paket importu korunur. `main.tsx` uygulama için yalnız `styles/index.css` yükler.

```css
@layer reset, tokens, foundation, components, layout, pages, utilities;
@layer components.legacy, components.primitives;
```

Eski ortak operasyon bileşenleri `components.legacy` içindedir. Yeni form/button/panel kuralları `components.primitives` ile bunların üzerinde tanımlıdır. Feature dosyaları alan düzenlerini sahiplenir; yeni global kontrol kurallarını içermez. Tema dosyaları yalnız token değerlerini değiştirir. Yerel CSS de katmansız import edilmez.

## Başlangıç auditi ve taşıma haritası

Dosya başına üretilen ölçümler ve tekrar eden selector listeleri yerel `artifacts/design-system/css-audit.json` çıktısında saklanır ve commit kapsamına alınmaz. Kalıcı audit özeti aşağıdaki tablo ve bulgulardadır. Selector tekrar sayıları medya/state varyantlarını da içerir; her tekrar otomatik olarak hata değildir.

| Eski dosya | Satır | Taşınan sorumluluk |
| --- | ---: | --- |
| styles.css | 10.113 | tokens, themes, foundation, components, layout ve feature sayfaları |
| friendly-overrides.css | 586 | restaurant ve finance; global disabled kuralı foundation |
| friendly-workflow-ux.css | 574 | app-shell, pension, restaurant, requests |
| room-folio.css / room-folio-ux.css | 556 / 199 | pages/room-folio.css |
| finance-ux.css / cash-page-ux.css | 327 / 85 | pages/finance.css; reports ayrıntıları kendi sayfası |
| dashboard-simple-ux.css / system-health-ux.css | 115 / 155 | pages/dashboard.css |
| restaurant-room-transfer-ux.css | 102 | pages/restaurant.css |
| customer-work-ux.css / customer-credit-ux.css | 209 / 164 | pages/customers.css |
| room-card-ux.css | 67 | components/resources.css, pension |
| room-management-ux.css | 274 | settings oda editörü; ilgili dialog/folio kuralları kendi dosyası |
| secondary-pages-ux.css | 216 | menu ve messages |
| menu-image-preview-ux.css | 91 | pages/menu.css |
| backup-manager-ux.css | 205 | pages/settings.css ve ortak button/badge kuralları |
| market-workspace-ux.css / market-quick-sale-ux.css / market-label-ux.css | 556 / 347 / 168 | pages/market.css |
| operation-calendar.css | 301 | pages/calendar.css |
| setup-capabilities.css | 173 | tek sayfa settings düzeni; eski genişlik yamaları kaldırıldı |
| business-public-profile.css | 176 | settings düzeni ve forms primitive |

Bu tablodaki eski dosyaların tamamı silindi. Harita stylesheet'i sadeleştirildi ve katmanlı import edildi.

Belirlenen çakışmalar:

- `styles.css` içinde token, tema, reset, genel kontrol ve feature kuralları karışıktı. 97 selector grubu birden çok kez tanımlanıyordu.
- `.setup-grid input`, `.setup-shell.is-embedded .setup-grid input` ve `:root[data-mode="easy"] .setup-grid input` aynı boyutları farklı noktalarda belirliyordu. Component stylesheet'i ve `setup-capabilities.css` son yüklenme sırasına bağlıydı.
- `.setup-ai-actions.is-inline .setup-secondary`, `.setup-ai-studio-help .setup-secondary` ve `.password-settings-actions > button` kontrolleri konteyner genişliğine yayıyordu. Son commit bu sonucu daha yüksek specificity ve `nth-child` kurallarıyla telafi ediyordu.
- Easy mode 4px spacing ölçeğini 6/10/14/18/30px değerleriyle yeniden tanımlıyordu. Bu nedenle feature'daki bir `calc()` hem font hem spacing hem override token ekseninde değişiyordu.
- Aynı anlam için `--ink-muted`, `--muted`, `--text-muted`; `--border`, `--line`, `--line-soft`; `--paper`, `--surface`, `--surface-elevated` gibi paralel isimler vardı. Kullanımlar doğrudan yeni semantik adlara geçirildi; alias katmanı eklenmedi.
- Genel setup label/input kuralları checkbox düzenini etkilediğinden `display: flex !important` kullanılıyordu. Checkbox ile metin alanı ayrı primitive sözleşmelerine ayrıldı.
- `backup-manager-ux.css` ve bazı health/transfer kuralları açık temada da koyu temanın ham renklerini kullanıyordu. Bakım ve ortak health renkleri semantik yüzey/status tokenlarına taşındı.

Ölçülen değişim: `!important` **37 → 0**, `var(--override-...)` kullanımları **292 → 0**, CSS ham renk literal sayısı **357 → 187**, px/rem literal sayısı **2411 → 1645**. Son iki sayı primitive değerleri, breakpoint, border ve gerçek feature geometrisini de içerir; bütünüyle tasarım borcu sayılmaz. Başlangıçtaki ara ilerleme mesajında override kullanım sayısı fazla verilmişti; dosya bazlı auditin kesin toplamı 292'dir.

## Token sözleşmesi

- Primitive: sıcak nötr ve koyu slate palet, mercan accent, success/warning/danger/info paletleri; değişmeyen 4px spacing, radius, shadow ve z-index ölçekleri.
- Semantic: `--color-bg-app/surface/panel/field/hover`, `--color-text`, `--color-text-muted`, border/focus/accent ve status adları. Hafif status yüzeyleri `color-mix()` ile temaya bağlıdır.
- Radius: control 8px, panel 12px, dialog 16px, pill. Büyük gölgeler varsayılan panel stilinden çıkarıldı.
- Kontroller: pro `32/36/44px`, easy `36/40/48px`. Easy, spacing ölçeğini yeniden yazmaz.
- Alan genişlikleri: xs `6rem`, short `12rem`, medium `20rem`, long `36rem`; fluid kapsayıcıya uyar.
- İçerik: page max `1200px`, reading max `72ch`, sidebar `208px`, header `64px`.
- IBM Plex Sans ve mevcut UI ölçeği uygulama/saklama mantığı korunur.

## Form, button ve panel primitive kullanımı

```tsx
<div className="form-row">
  <label className="form-field form-field--short">
    Telefon
    <input value={phone} onChange={onPhoneChange} />
  </label>
  <label className="form-field form-field--medium">
    E-posta
    <input value={email} onChange={onEmailChange} />
  </label>
</div>
<div className="form-actions">
  <ActionButton variant="primary" size="md">Kaydet</ActionButton>
  <ActionButton variant="secondary">Bağlantıyı Dene</ActionButton>
</div>
```

- `.form-grid`: iki esnek kolon; `.form-row`: içerik genişliğine göre sarılan satır.
- `.form-field--xs/short/medium/long/fluid`: kontrolün genişliğini belirler; label hücresi büyüse de kontrol gereksiz büyümez.
- `.form-field--span`: grid boyunca alan; `.field-control-group`: şifre/input ve yan aksiyon; `.form-check`: checkbox/radio label.
- `<=760px`: bütün form alanları tek kolon ve full-width olur. Buton full-width davranışı otomatik değildir.
- `.form-actions`: sarılabilen toolbar. `ActionButton`: primary, secondary, ghost, danger, mevcut whatsapp varyantı; sm/md/lg; açık `fullWidth` tercihi.
- `.panel` / `.setup-section`: ortak 20px padding, panel radius, border ve yüzey. `.panel-heading` / `.setup-section-title`: başlık/açıklama/aksiyon ritmi. Compact Panel 12px padding kullanabilir.
- Yeni React form wrapper'ı eklenmedi; native label/input ilişkisi ve mevcut event handler'lar korunur.

## Settings referans uygulaması

Tek sayfa korunur: İşletmem → Müşteri bilgileri → İşletme düzeni → Bağlantılar → Uygulama → Bakım. DOM ve klavye sırası da bu sırayı izler; CSS `order` veya `display: contents` üzerinden sayfa sıralama yapılmaz.

İşletme adı/sektör aynı satırda; telefon/WhatsApp/e-posta ilişkili ikinci satırda; adres uzun alan olarak üçüncü satırdadır. Saatler dört kısa kontrol, koordinatlar kısa, diller medium, notlar/textarea fluid alanlardır. Özellik checkboxları 4/2 kolonlu grid kullanır. Harita 240px yüksekliğindedir; tile/pin koordinat hesapları değiştirilmez.

Servis seçimleri compact; URL/endpoint ve anahtar alanları içerik türüne göre boyutlanır. Bağlantı testi ve şifre butonları content width kalır. Görünüm kartları sınırlı okuma genişliğinde; ölçek short; şifreler medium. Bakım toolbar ve yedek listesinden oluşur; filesystem path'leri normal Settings görünümünde gösterilmez.

## Görsel kontrol

`npm run smoke:desktop-design-system` gerçek Vite renderer'ını Playwright Chromium ile açar. Gerçek kullanıcı verisi yerine yerel bridge fixture'ları ve deterministik harita tile yanıtları kullanır. Bu nedenle test canlı servis veya gerçek harita sağlayıcısının entegrasyon testi değildir.

İlk screenshot turundan sonra ikinci polish turu yapıldı: işletme alanlarının arasındaki aşırı kolon boşluğu kaldırıldı, 900px saat satırı düzeltildi, harita 240px'e indirildi ve sticky header arka planı opak yapıldı.

| Viewport | Overflow | Telefon | Saatler | Harita | Kaydet butonu |
| --- | --- | --- | --- | --- | --- |
| 1440×1000 | Yok | 192px | Tek satır, 192px | 240px | 131px |
| 1366×768 | Yok | 192px | Tek satır, 192px | 240px | 131px |
| 1024×768 | Yok | 192px | Tek satır, ~170px | 240px | 131px |
| 900×768 | Yok | 192px | Tek satır, ~139px | 240px | 131px |

760 ve 600px ek kontrollerinde alanlar full-width stack olur. Altı bölüm bağlantısı her viewportta kontrol edilir; desktop'ta bölüm başlığı sticky nav altında kalmaz. Açık/koyu pro temaları, easy modu, label ilişkisi, klavye focus, açıklama/koordinat kaydetme payload'ı ve şifre form etkileşimi de doğrulanır. Screenshot'lar `artifacts/design-system/`, ölçümler `artifacts/design-system/viewports.json` içinde üretilir.

## Kalan borç ve audit politikası

Foundation ve Settings taşındı; diğer feature'ların tüm markup/layout'ı yeniden tasarlanmadı. Özellikle menu, restaurant, market, pension dosyaları hâlâ büyük feature stylesheet'leridir. Menü önizlemesi ve lock ekranında eski ham renk/gölge/gradient kararları, diğer operasyon sayfalarında feature'a özel px geometrisi ve bazı çapraz selector specificity ilişkileri kalır. Bunlar merkezi override dosyasında saklanmaz; ait oldukları dosyalardadır.

Token/tema dışında **157 ham renk literal'i** ve **1598 px/rem literal'i** kalır; border, breakpoint ve harita geometrisi bu sayılara dahildir. Yeni forms/buttons/panels/settings dosyaları ham renk içermez. Haritanın 256px tile ölçüsü ve pin geometrisi protokol/görsel geometridir; bunlardan yeni tasarım tokenları türetilmedi.

`design-system-audit.mjs` yeni token sözleşmesini, tanımsız tokenları, tek ana importu, explicit layer sırasını ve override yasağını doğrular. Eski auditin tüm `styles.css` dosyasını token dosyası sayarak borcu gizleme davranışı kaldırıldı. Radius/shadow regex'inin `var()` değerlerini yanlışlıkla ham değer sayması düzeltildi. Baseline yeni dosya yolları ve doğru ölçüm yöntemiyle yenilendi; bundan sonraki borç artışları strict audit ile engellenir.

## Son doğrulama

- Desktop build: geçti (Vite'ın mevcut >500kB JavaScript chunk uyarısı devam ediyor).
- Workspace typecheck: geçti.
- Desktop renderer smoke: geçti. Eski piksel/geometri sabitlemeleri çıkarıldı; mevcut kullanıcı etkileşimleri ve navigation kontrolleri korundu.
- Desktop design-system smoke: geçti; altı viewport, tema, focus, form payload ve şifre etkileşimleri.
- Desktop easy-mode smoke: geçti; native radio klavye davranışı, tercihler ve light/easy tema bağımsızlığı korunur.
- Değişen renderer/test dosyaları ESLint: sıfır hata ve uyarı.
- Design audit strict: geçti; yeni token/import sözleşmesi doğrulandı.
- Pilot check: **36 geçti, 0 hata, 0 atlandı**. Rapor: `artifacts/pilot-check/2026-09-13T19-54-50-458Z.json`.
- `git diff --check`: temiz.

Pilot build sırasında yeniden üretilen `firm-template/web-module/widget.js` başlangıç hâline geri alındı; nihai değişiklik kapsamında değildir. Commit kapsamı design-system kaynakları, gerekli renderer değişiklikleri, smoke/audit scriptleri, sürüm kontrollü audit baseline ve bu README ile sınırlıdır. Artifact, screenshot ve üretilmiş raporlar kapsam dışıdır.

## Yeni feature nasıl stil yazmalı? (Aşama 1)

Güncel envanter ve migration sırası: [Desktop UI Migration](DESKTOP_UI_MIGRATION.md). Yukarıdaki sayısal sonuçlar ilk foundation/Settings refactoruna aittir; Aşama 1'in güncel ölçümleri envanter belgesindedir.

1. Mevcut AppShell/PageHeader'ı kullanın. Feature CSS'inde sidebar, topbar, content viewport veya page padding tanımlamayın. Sayfalar fluid; sınırlı okuma alanı için `page-content--bounded` / reading token tercih edin.
2. Bölümleri `page-section`, `page-section__header/body`; panelleri `Panel` / `panel`; yalnız dış kart yüzeyini `surface` ile kurun. Normal panel padding'i token, compact görünüm açık varyanttır.
3. Filtre/aksiyon satırları `page-toolbar`, `page-toolbar__start`, `page-toolbar__actions`; kısa aksiyon grupları `action-row` kullanır. Kontrolleri büyüterek boşluk doldurmayın.
4. Native label/input ve `form-field--xs/short/medium/long/fluid` kullanın. Butonlar ActionButton varyantlarını izler; full-width açık tercih olmalıdır.
5. Mesajlar `status-message` ve `--info/success/warning/danger`; empty-state başlık/açıklama/opsiyonel action; loading-state inline veya `--panel/--page`. Dinamik sonuçlarda uygun role=status/alert ekleyin; statik açıklamaları live region yapmayın.
6. Modal/drawer dış yüzeyi `overlay`, `dialog`/`drawer`, `overlay-header/body/footer/close` sözleşmesini kullanır. Feature yalnız gövdeyi biçimlendirir; focus ve kapatma davranışını mevcut component yönetir.
7. Global/shared CSS yalnız styles/index.css üzerinden açık layer ile import edilir. Gerçek feature kuralları feature stylesheet'inde kalır. Token/theme dışında ham renk, `--override-*`, `!important` ve primitive'i ezen global selector eklemeyin.
8. `npm run design:audit:strict` ve `npm run smoke:desktop-shell` çalıştırın. Yeni shell smoke renderer/pilot zincirine dahildir; screenshot ve raporlar artifacts altında kalır.


## Müşteri/Pansiyon referansı (Aşama 2A)

Müşteri İşleri ve Pansiyon, doğrudan kullandıkları oda hesabı/editörleriyle migrated durumundadır. Güncel audit ve test sonuçları [migration envanterinin Aşama 2A bölümündedir](DESKTOP_UI_MIGRATION.md#aşama-2a-başlangıç-auditi-ve-yapılan-migration); önceki bölümdeki sayılar tarihsel foundation sonuçlarıdır.

- Seçilebilir listelerde `DataListButton`, aksiyonlu kayıtlarda `DataListItem`; yerleşimde `record-workspace` / `record-stack`, detaylarda `data-list` kullanın. Legacy manager-row/operation selector’larını kopyalamayın.
- Kartlar `card` ve `card__header/meta/actions`; filtreler `form-row filter-row`, bölüm eylemleri `page-toolbar` / `action-row` kullanır.
- Editörler `drawer--form`, `overlay-form`, `form-grid`, açık `form-field--…` boyutları ve `overlay-footer` kullanır. 760px altı stack sözleşmesini feature’dan override etmeyin.
- Modal klavye odağı için `useDialogFocus(open)` ref’ini dialog yüzeyine bağlayın. Kapatma kontrolü `drawer-close-button`, `overlay-close` veya `data-dialog-close` ile tanımlanır; hook mevcut click handler ve disabled durumunu kullanır.
- `npm run smoke:desktop-customer-pension` kayıt payload’larını, erişilebilirliği ve beş viewportu test eder. Renderer/pilot zincirine dahildir; ekran çıktıları yalnız artifacts altında tutulur.

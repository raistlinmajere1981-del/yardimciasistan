# Yardımcı Asistan Desktop — UI Tasarım Sistemi ve Layout Revizyon Planı

---

## 1. Mevcut UI Sorun Analizi

Kaynak incelemesi: [`styles.css`](file:///home/raistlin/YardimciAsistan/apps/desktop-app/src/styles.css) (3272 satır) ve [`App.tsx`](file:///home/raistlin/YardimciAsistan/apps/desktop-app/src/App.tsx) (4770 satır).

### Alan Kullanımı
- **Sidebar 260px** — çok geniş. 7 nav item için 40–60px fazla yer harcanıyor.
- **`topbar`** net yükseklik tanımsız, h1 `2.05rem` kullanıyor → başlık bloğu yüksek.
- **`content` padding** `20px` (var(--space-xl)) → 1366px ekranda değerli alan gidiyor.
- **`dashboard-grid`** sağ kolon **330px sabit** → dar ekranda sol liste çok sıkışıyor.

### Kart Boyutları
- **`metric-card` min-height: 88px** — makul ama ikon 42px + padding ile gerçek yükseklik ~100px.
- **`compact-list-item` min-height: 82px** — satır tabanlı liste için fazla büyük. Hedef: 52–60px.
- **`dashboard-request-row` min-height: 68px** — kabul edilebilir ama aksiyon butonları satırı şişiriyor.
- **`operation-summary-grid article` min-height: 68px** → 4 kart yan yana, 1366px'de kısıtlı.

### Sidebar Genişliği
- Sabit 260px, yalnızca metin + 18px ikon. 200–210px yeterli.
- Brand alanı 44px logo + bold metin = 2 satır → gereksiz yükseklik.
- Nav item padding `10px 12px`, min-height 42px → 7 item × 42px ≈ 294px sadece nav.

### Sayfa Başlıkları
- `topbar h1` font-size `2.05rem` — büyük ve yer kaplıyor.
- Topbar'da sayfa açıklaması yok (sadece başlık + sync-pill).
- `sync-pill` max-width 560px → geniş, büyük metin alanı kullanıyor.

### Form Yoğunluğu
- Setup/Ayarlar formlarında `input min-height: 38px`, label `font-size: 0.9rem, font-weight: 800`.
- Grid gap 10px — makul.
- `setup-section` padding `14px 16px` — kabul edilebilir.

### Liste/Detail Ayrımı
- Müşteri İşleri: Tab tabanlı, tüm content tek alanda. **Master-detail yok** — seçilen kayıt için ayrı panel yok.
- Pansiyon: `pension-layout` grid `1.6fr 0.8fr` — rezervasyon + oda yan yana, iyi ama kolon oranı dar ekranda işe yaramıyor.
- Menü: `menu-management-grid` `300px 0.9fr 1.1fr` — 3 kolon, 1366px'de sıkışıyor.

### Buton Yoğunluğu
- `compact-action-bar` her satırda 2 buton (Ara + WhatsApp) → buton yoğunluğu yüksek.
- `request-actions` içinde 3 buton dikey dizili (Convert / AI / WhatsApp) → büyük.
- Ayarlar: birden fazla kaydet-test butonu dağınık.

### Tema ve Görsel Hiyerarşi
- Light tema renkleri: `--bg: #fff8ee` sıcak krem → çok açık ve klasik.
- Dark tema mevcut ama `data-theme="dark"` ile kontrollü, varsayılan light.
- `sidebar` arka plan `#172033` (hardcoded) → CSS var ile değil.
- `box-shadow: 0 12px 34px rgba(23,32,51,0.06)` — ince ve temiz ama koyu temada gözükmüyor.
- Tipografi Inter kullanılıyor ✓. Font ölçeği dağınık (0.77rem–2.05rem arası).

---

## 2. Yeni Tasarım Yönü

### Karakter Özeti
> **Ciddi bir operasyon merkezi.** Gece vardiyası ekibi kullanan kompakt kontrol ekranı hissi. Parlak değil, net. Oyun UI'ı değil, profesyonel SaaS.

### Temel İlkeler

| İlke | Açıklama |
|------|----------|
| **Koyu lacivert zemin** | `#0c1220` — saf siyah değil, derin gece mavisi |
| **Panel hiyerarşisi** | Her içerik bloğu hafif yükseltilmiş, iç içe depth hissi |
| **Yeşil-turkuaz vurgu** | `#3ecfa8` — parlak ama neon değil. Primary aksiyon rengi |
| **Amber uyarı** | `#e6a817` — gerçek dünya uyarı rengi |
| **Durum renkleri** | Yeşil boş, kırmızı dolu, amber bekliyor — tüm state'lerde tutarlı |
| **İnce border** | `1px solid rgba(255,255,255,0.08)` — koyu üstünde çok ince |
| **Düşük shadow** | `0 2px 8px rgba(0,0,0,0.32)` — koyu temada glow yerine depth |
| **Kompakt spacing** | Minimum 4px adımı, list satırları ≤56px |
| **Türkçe okunabilirlik** | Inter 400/600/700, letter-spacing: 0, line-height 1.4 |

---

## 3. Design Token Önerisi

### Renkler

```css
:root[data-theme="dark"] {

  /* === Arka Planlar === */
  --bg:               #0c1220;  /* Ana sayfa zemini */
  --surface-1:        #111927;  /* Sidebar, drawer arka planı */
  --surface-2:        #172236;  /* Panel, kart yüzeyi */
  --surface-3:        #1e2d42;  /* Input, hover yüzeyi */
  --surface-4:        #263347;  /* Seçili satır, track */

  /* === Metin === */
  --ink:              #e8edf4;  /* Ana metin */
  --ink-muted:        #8a9ab5;  /* İkincil metin, etiketler */
  --ink-dim:          #56677e;  /* Placeholder, disabled */

  /* === Sınır === */
  --border:           rgba(255,255,255,0.08);
  --border-strong:    rgba(255,255,255,0.14);
  --border-focus:     #3ecfa8;

  /* === Primary (Yeşil-Turkuaz) === */
  --primary:          #3ecfa8;  /* Ana vurgu, aktif link */
  --primary-dim:      #2aa882;  /* Hover state */
  --primary-bg:       rgba(62,207,168,0.10);
  --primary-border:   rgba(62,207,168,0.24);

  /* === Durum Renkleri === */
  --status-green:     #3ecfa8;  /* Boş / müsait / tamam */
  --status-green-bg:  rgba(62,207,168,0.10);
  --status-amber:     #e6a817;  /* Bekliyor / onay gerekli */
  --status-amber-bg:  rgba(230,168,23,0.12);
  --status-red:       #f26c5a;  /* Dolu / hata / iptal */
  --status-red-bg:    rgba(242,108,90,0.12);
  --status-blue:      #4fa3e8;  /* Bilgi / yeni talep */
  --status-blue-bg:   rgba(79,163,232,0.12);

  /* === Sidebar === */
  --sidebar-bg:       #0c1220;  /* Ana zemin ile aynı, border ile ayrışır */
  --sidebar-active-bg: rgba(62,207,168,0.12);
  --sidebar-active-border: rgba(62,207,168,0.32);
  --nav-text:         #8a9ab5;
  --nav-text-active:  #3ecfa8;
}
```

### Typography

```css
/* Font */
font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;

/* Ölçek */
--text-xs:    0.72rem;   /* 11.5px — etiket, meta */
--text-sm:    0.82rem;   /* 13px — yardımcı metin */
--text-base:  0.92rem;   /* 14.7px — gövde, form label */
--text-md:    1rem;      /* 16px — liste başlığı */
--text-lg:    1.12rem;   /* 18px — panel başlığı */
--text-xl:    1.35rem;   /* 21.6px — metrik değer */
--text-2xl:   1.65rem;   /* 26.4px — sayfa başlığı */

/* Ağırlık */
--weight-normal: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-bold: 700;
--weight-extrabold: 800;
```

### Spacing Ölçeği

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
```

### Border Radius

```css
--radius-sm:  4px;   /* Badge, chip */
--radius-md:  6px;   /* Button, input */
--radius-lg:  8px;   /* Kart, panel */
--radius-xl:  10px;  /* Dialog, büyük panel */
```

### Shadow (Koyu Tema)

```css
--shadow-sm:  0 1px 3px rgba(0,0,0,0.32);
--shadow-md:  0 2px 8px rgba(0,0,0,0.32);
--shadow-lg:  0 4px 16px rgba(0,0,0,0.40);
--shadow-xl:  0 8px 32px rgba(0,0,0,0.48);
```

### Anahtar Boyutlar

| Öğe | Mevcut | Yeni |
|-----|--------|------|
| **Sidebar genişliği** | 260px | **200px** |
| **Topbar yüksekliği** | ~60–70px (implicit) | **56px** |
| **Page padding** | 20px | **16px** |
| **Panel padding** | 16px | **12px** |
| **Liste satırı (normal)** | 82px | **52px** |
| **Liste satırı (geniş)** | 82px | **60px** |
| **Dashboard request row** | 68px | **56px** |
| **Kompakt kart** | — | **72–80px** |
| **Metrik kart** | 88px min-height | **80px** |
| **Operation summary** | 68px | **60px** |
| **Nav item** | 42px | **38px** |
| **Button (primary)** | 38px | **34px** |
| **Button (compact)** | 34px | **30px** |
| **Input** | 38px | **34px** |

### Status Colors (Badge)

| Durum | Renk | Arka Plan |
|-------|------|-----------|
| Yeni / Bilgi | `--status-blue` | `--status-blue-bg` |
| Bekliyor / Onay | `--status-amber` | `--status-amber-bg` |
| Boş / Tamam | `--status-green` | `--status-green-bg` |
| Dolu / Hata | `--status-red` | `--status-red-bg` |
| Nötr / Pasif | `--ink-dim` | `--surface-3` |

---

## 4. AppShell Layout Önerisi

### Yapı

```
┌─────────────────────────────────────────────────────────────┐
│  SIDEBAR (200px, sabit)  │  MAIN CONTENT AREA               │
│                          │  ┌────────────────────────────┐  │
│  [Logo — 40px]           │  │ PAGE HEADER (56px)          │  │
│  [Ayırıcı]               │  │ [Başlık] [Açıklama] [CTA]  │  │
│  [Nav item × 7]          │  └────────────────────────────┘  │
│  [Ayırıcı]               │  ┌────────────────────────────┐  │
│  [Firma adı — alt]       │  │ PAGE CONTENT               │  │
│                          │  │ (overflow-y: auto)          │  │
│                          │  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Sidebar Detayı

```
┌──────────────────────┐
│ ○ [Logo 36px]        │  ← Logo küçük, firma adı tek satır
│   Yardımcı Asistan   │
├──────────────────────┤  ← 1px border rgba(255,255,255,0.08)
│ ⌂ Ana Ekran    [●]   │  ← Aktif: yeşil left-border + bg
│   Müşteri İşleri     │
│   Pansiyon           │
│   Restoran           │
│   Menü               │
│   Mesajlar           │
├──────────────────────┤
│   Ayarlar            │  ← Ayarlar en alta, separator ile
└──────────────────────┘
```

**Sidebar CSS değişiklikleri:**
- `width: 200px` (260px → 200px)
- `padding: 16px 12px`
- Nav item: `min-height: 38px`, `padding: 8px 10px`, `font-size: var(--text-base)`
- Aktif nav item: sol 3px solid border `var(--primary)` + `background: var(--sidebar-active-bg)`
- Logo: 36px × 36px
- Firm adı: `font-size: var(--text-sm)`, tek satır

### PageHeader Detayı

```
┌────────────────────────────────────────────────────────┐
│  Ana Ekran                          [Web Taleplerini   │
│  Bugün ne var?                       Çek ↻]            │
└────────────────────────────────────────────────────────┘
```

- Yükseklik: `56px`
- Sol: `h1` (sayfa adı, `var(--text-lg)`) + `p` (kısa açıklama, `var(--text-sm) var(--ink-muted)`)
- Sağ: sayfaya özel CTA butonu (mevcut `sync-pill` yerini alır)
- Alt: `1px solid var(--border)` ile content'ten ayrılır
- `padding: 0 16px`

---

## 5. Sayfa Sayfa Yeni Layout Önerisi

### 5.1 Ana Ekran (Dashboard)

**Hedef:** 1366×768'de 3–5 talep + metrikler + işler aynı anda görünür.

```
┌──────────────────────────────────────────────────────────┐
│ PAGE HEADER (56px)                                       │
├──────────────────────────────────────────────────────────┤
│ [METRİK] [METRİK] [METRİK] [METRİK]  ← 80px ×4, 1 satır│
├──────────────────────┬───────────────────────────────────┤
│ SON TALEPLER         │ BUGÜNKÜ İŞLER                     │
│ (satır tabanlı,      │ Cevap bekleyenler                 │
│  56px/satır)         │ Yaklaşan rezervasyonlar           │
│                      │ Günlük görevler                   │
└──────────────────────┴───────────────────────────────────┘
```

**Detaylar:**
- Metrik grid: `repeat(4, 1fr)` → 1180px altında `repeat(2, 1fr)`
- Metrik kart: `min-height: 80px`, iç padding `10px 12px`
- Sol panel: `minmax(0, 1.5fr)` — talep listesi
- Sağ panel: `280px` sabit — işler ve özet
- Talep satırı: `min-height: 56px` (şu an 68px), butonlar ikon-only (Ara ☎ | WA)
- **Büyük kart yok.** Her talep tek satır: `[badge] İsim — Tarih — Tip [☎][WA]`

### 5.2 Müşteri İşleri (CustomerWork)

**Hedef:** Master-detail yapısı. 8–10 kayıt sol listede görünür.

**Şu an:** Tab tabanlı, tüm içerik tek alanda değişiyor. Master-detail yok.

**Yeni yapı:**
```
┌─────────────────────────────────────────────────────────┐
│ PAGE HEADER [Segmented: Talepler | Müşteriler | Bekleyen]│
├─────────────────┬───────────────────────────────────────┤
│ TALEP LİSTESİ   │ DETAY PANELİ                          │
│ (290px sabit)   │                                        │
│                 │ [Müşteri adı, tel, tarih]              │
│ [satır × 10]   │ [Talep mesajı]                         │
│ 52px/satır      │ [AI özet]                              │
│                 │ [Aksiyonlar: Ara / WA / Rezervasyona   │
│ Toplam: ~520px  │  Çevir / AI Taslak]                   │
│                 │                                        │
└─────────────────┴───────────────────────────────────────┘
```

**Detaylar:**
- Sol liste: `width: 290px`, sabit, overflow-y: auto
- Sağ detay: `minmax(0, 1fr)`, seçili talep bilgisi
- Segmented control topbar'da (tab style) — alt tab çubuğu yok
- Talep satırı: `52px`, sadece `[badge] İsim · Tarih`
- Seçili satır: `--surface-4` arka plan + sol 3px `--primary` border

### 5.3 Pansiyon

**Hedef:** Rezervasyon listesi ve oda durumu aynı ekranda.

```
┌─────────────────────────────────────────────────────────┐
│ PAGE HEADER                                              │
├──────────┬──────────┬──────────┬──────────────────────  │
│ [Girişler│ [Çıkışlar│ [Bekleyen│ [Boş Odalar]           │ ← 60px metric
├──────────┴──────────┴──────────┴───────────────────────┤
│ REZERVASYONLAR (65%)    │ ODA DURUMU (35%)               │
│                         │                                │
│ [Toolbar: Filtre/Yeni]  │ [Oda grid, 2 kolon]           │
│ [Rezervasyon listesi]   │ [Oda kart: 64px kompakt]      │
│  52px/satır             │  ● 101 — Boş                  │
│                         │  ● 102 — Demo Misafir         │
├─────────────────────────┴────────────────────────────── ┤
│ GÜNLÜK İŞLER (collapse panel, min-height: 120px)         │
└─────────────────────────────────────────────────────────┘
```

**Detaylar:**
- Grid: `grid-template-columns: 1fr 320px` (rezervasyon / oda)
- Oda kart: `min-height: 64px`, `border-left: 4px solid [durum rengi]`
- Boş: `--status-green`, Rezerve: `--status-amber`, Dolu: `--status-red`
- Günlük işler: collapse/expand toggle'lı section, açıkken `~180px`

### 5.4 Restoran

**Hedef:** Masa grid ve bekleyen işler aynı anda.

```
┌─────────────────────────────────────────────────────────┐
│ PAGE HEADER                                              │
├──────────┬──────────┬──────────┬──────────────────────  │
│ [Boş Masa│ [Rezerve │ [Hesap   │ [Bekleyen İş]          │ ← 60px metric
├──────────┴──────────┴──────────┴───────────────────────┤
│ MASA GRİDİ (70%)                 │ BEKLEYEN İŞLER (30%) │
│                                  │                       │
│ [Alan filtresi: Bahçe | Salon]   │ [Görev listesi]      │
│ [Masa kartları — grid 3 kolon]   │  44px/satır          │
│  Masa kart: 80px × 80px          │                       │
│  Renk: durum göstergeli          │                       │
└──────────────────────────────────┴───────────────────────┘
```

**Detaylar:**
- Masa kart: `min-height: 76px`, `border-top: 4px solid [durum]`
- Masa kart üstünde `[Alan] [Kapasite]` meta, ortada `Masa Adı`, altta `[Durum badge]`
- İleride kamera entegrasyonu için kart içinde placeholder alan bırakılacak (`data-slot="camera"`)
- Görev listesi: sağ `260px` sabit panel

### 5.5 Menü

**Hedef:** 3 panelli editör. 1366px'de sığacak.

```
┌─────────────────────────────────────────────────────────┐
│ PAGE HEADER [Yayınla | Önizle]                           │
├──────────────────────────────────────────────────────────┤
│ KATEGORİLER (200px) │ ÜRÜNLER (260px)   │ DÜZENLEME     │
│                     │                   │ PANELI (rest) │
│ [+ Yeni Kategori]   │ [+ Yeni Ürün]     │               │
│                     │                   │ [Form]        │
│ • Kahvaltı ✓        │ Serpme Kahvaltı   │ kompakt grid  │
│   İçecekler         │ Menemen           │               │
│   Lezzetler         │ ...               │               │
└─────────────────────┴───────────────────┴───────────────┘
```

**Detaylar:**
- `grid-template-columns: 200px 260px minmax(0, 1fr)`
- Kategori listesi: satır `44px`, seçili → left border + bg
- Ürün listesi: satır `48px`, fiyat sağda
- Düzenleme paneli: form inputlar `34px`, label `var(--text-sm)`, grid 2 kolon
- Gelişmiş alanlar (allerjen, tag) `<details>` ile collapse

### 5.6 Mesajlar

**Hedef:** Güvenli mod öncelikli, WhatsApp Web isteğe bağlı.

```
┌─────────────────────────────────────────────────────────┐
│ PAGE HEADER                                              │
│ [● Güvenli Mod] [○ WhatsApp Web Modu]  ← segmented top │
├─────────────────────────────────────────────────────────┤
│ GÜVENLI MOD GÖRÜNÜMÜ:                                    │
│                                                          │
│ MÜŞTERİ/TALEP LİSTESİ (280px) │ HAZIR MESAJ + AI       │
│                                │                         │
│ [satır × 8–10]                 │ [Mesaj önizleme]       │
│ 52px/satır                     │ [Kopyala | WA Aç]      │
│                                │ [AI Düzenleme araçları] │
│                                │ (messagesAiOpen ise)    │
└────────────────────────────────┴─────────────────────────┘
```

**Detaylar:**
- Mode switch: topbar'da, büyük tab değil; kompakt segmented control (36px)
- Güvenli mod: sol liste + sağ mesaj paneli — default view
- WhatsApp Web modu: tıklandığında lazy yüklenen tam alan webview
- AI araçları: güvenli mod görünümünde alt/sağ panel olarak açılır

### 5.7 Ayarlar

**Hedef:** Kompakt form, iki seviye, tek kaydet butonu.

```
┌─────────────────────────────────────────────────────────┐
│ PAGE HEADER [Ayarları Kaydet →]                          │
├─────────────────────────────────────────────────────────┤
│ [● Temel Ayarlar] [○ Gelişmiş Ayarlar]  ← tab bar      │
├─────────────────────────────────────────────────────────┤
│ [İşletme Bilgileri]   [Bağlantı]   [Modüller]          │
│ form grid 2-3 kolon                                      │
│ input min-height: 34px                                   │
│ section gap: 16px                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Component Mimarisi

### Layout Components

```
src/components/layout/
  AppShell.tsx        → desktop-shell grid wrapper, tema provider
  Sidebar.tsx         → nav items, logo, firma adı, capability visibility
  PageHeader.tsx      → h1 + description + right CTA slot (props)
```

**AppShell.tsx:** `desktop-shell` CSS grid (200px | 1fr). Tema class'ını (`data-theme`) yönetir. `uiPreferences` prop alır.

**Sidebar.tsx:** `navigationItems` prop'u ile render. `activeId` ve `onNavigate` callback. Persisted `businessCapabilities` ile koşullu item'lar. Logo + firma adı alt blok.

**PageHeader.tsx:** `title`, `description`, `action?: ReactNode` prop. 56px yükseklik. Sağda `action` slot → sync pill yerini alır.

### UI Components

```
src/components/ui/
  MetricCard.tsx        → Tek metrik kart (icon, label, value, detail, tone)
  StatusBadge.tsx       → Status chip (type: ok/wait/danger/info/neutral)
  CompactList.tsx       → Kaydırılabilir liste wrapper (max-height prop)
  CompactListItem.tsx   → Tek satır (left-section, right-section, onClick, isSelected)
  ActionButton.tsx      → Standart buton (variant: primary/secondary/ghost/danger, size: sm/md)
  Panel.tsx             → Card wrapper (padding, border, shadow)
  Toolbar.tsx           → Flex araç çubuğu (left/right slot)
  SegmentedControl.tsx  → Tab-like switcher (options[], activeId, onChange) — page tab yerine
  DrawerPanel.tsx       → Sağdan veya alttan açılan overlay panel (AI araçları, detay)
```

**MetricCard.tsx:** `tone` prop → border-left rengi ve icon arka planı. `min-height: 80px`. Icon 36px, değer `var(--text-xl)`.

**StatusBadge.tsx:** `status` → renk mapping. `size: sm | md`. Mevcut `.status-badge` yerine.

**CompactListItem.tsx:** `isSelected` prop → left 3px solid `--primary` border + `--surface-4` bg. `onClick` handler. İki slot: `leading` (badge/avatar) ve `trailing` (badge/action).

**Panel.tsx:** `padding: 12px | 16px` prop. `--surface-2` arka plan, `1px solid --border`. Mevcut `.panel` yerine.

**SegmentedControl.tsx:** `options: {id, label, icon?}[]`, `value`, `onChange`. Yatay inline, `background: --surface-1`, active item `--surface-3` + `--primary` text.

**DrawerPanel.tsx:** `isOpen`, `onClose`, `side: bottom | right`. AI araçları ve manuel talep formu için.

### Page Components

```
src/pages/
  DashboardPage.tsx       → Metrikler + talep listesi + side column
  CustomerWorkPage.tsx    → SegmentedControl + master-detail layout (refactor)
  PensionPage.tsx         → Metrikler + iki kolon + günlük işler (refactor)
  RestaurantPage.tsx      → Metrikler + masa grid + işler (refactor)
  MenuPage.tsx            → 3 kolon editör (yeni, App.tsx'den extract)
  MessagesPage.tsx        → SegmentedControl + master-detail (refactor)
  SettingsPage.tsx        → SegmentedControl + form grid (yeni, App.tsx'den extract)
```

> [!NOTE]
> `MenuPage.tsx` ve `SettingsPage.tsx` şu an tamamen `App.tsx` içinde inline render ediliyor (~2000 satır). Bunları extract etmek hem okunabilirliği artırır hem de bileşen testini kolaylaştırır.

---

## 7. Uygulama Sırası

### Aşama 1 — Design Tokens + Dark Theme CSS Altyapısı

**Etki:** Sadece `styles.css`

**Ne değişir:**
- `:root` ve `:root[data-theme="dark"]` token'ları yukarıda tanımlanan değerlerle güncellenir
- `body` min-width korunur (900px)
- `.desktop-shell` grid: `260px → 200px`
- Sidebar token'ları CSS var'a taşınır (hardcoded `#172033` kaldırılır)
- Spacing, radius, shadow token'ları eklenir

**Riskler:** Sıfır fonksiyon riski. Sadece görsel. Önce dark tema default yapılabilir.

---

### Aşama 2 — AppShell / Sidebar / PageHeader

**Etki:** `App.tsx` (sidebar ve topbar JSX), yeni component dosyaları, `styles.css`

**Ne değişir:**
- `Sidebar.tsx` extract edilir (`<aside className="sidebar">` bloğu)
- `PageHeader.tsx` extract edilir (`<header className="topbar">` bloğu)
- `AppShell.tsx` oluşturulur (şu an `<div className="desktop-shell">`)
- `App.tsx`'teki ilgili JSX bu componentlere taşınır
- CSS: `.sidebar`, `.nav-item`, `.brand`, `.topbar`, `.sync-pill` güncellenir

**Dikkat:** `navigationItems`, `activePage`, `pageMeta`, sync-pill state'leri prop olarak geçmeli.

---

### Aşama 3 — Ortak Compact UI Bileşenleri

**Etki:** Yeni `src/components/ui/` dosyaları, `styles.css`

**Ne değişir:**
- `MetricCard.tsx`, `StatusBadge.tsx`, `CompactListItem.tsx`, `Panel.tsx`, `ActionButton.tsx`, `SegmentedControl.tsx`, `Toolbar.tsx` oluşturulur
- Her bileşen için ilgili CSS class'ları güncellenir/eklenir
- Mevcut CSS class'ları (`.metric-card`, `.status-badge`, `.compact-list-item`) yeni token değerleriyle güncellenir

**Dikkat:** Mevcut className'ler korunabilir (wrapper component içinde), böylece App.tsx'teki inline kullanımlar kırılmaz.

---

### Aşama 4 — Ana Ekran (DashboardPage)

**Etki:** `App.tsx` (dashboard JSX bloğu → `DashboardPage.tsx`)

**Ne değişir:**
- `DashboardPage.tsx` oluşturulur
- Metrik grid: 4 sütun, 80px kartlar
- `dashboard-grid`: sol `1fr`, sağ `280px`
- Talep satırı `min-height: 56px`, butonlar ikon-only
- Sağ kolon: günlük işler + yaklaşan rezervasyonlar kompakt liste

---

### Aşama 5 — Müşteri İşleri (CustomerWorkPage)

**Etki:** `src/pages/CustomerWorkPage.tsx` (refactor), `App.tsx` (customerWork JSX)

**Ne değişir:**
- Tab'lar → `SegmentedControl` (topbar içinde)
- Master-detail layout: sol 290px liste, sağ detay paneli
- `DrawerPanel.tsx` ile manuel talep formu
- Liste satırları `52px`

---

### Aşama 6 — Pansiyon + Restoran

**Etki:** `src/pages/PensionPage.tsx`, `src/pages/RestaurantPage.tsx`, `App.tsx`

**Ne değişir:**
- Pansiyon: `grid-template-columns: 1fr 320px` + günlük işler collapse
- Restoran: masa grid 3 kolon + sağ 260px görev panel
- Oda kart: sol border renkli `64px`
- Masa kart: üst border renkli `76px × 76px`

---

### Aşama 7 — Menü + Mesajlar + Ayarlar

**Etki:** Yeni `src/pages/MenuPage.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/MessagesPage.tsx` (refactor), `App.tsx`

**Ne değişir:**
- Menü: 3 kolon extract, form kompakt
- Mesajlar: segmented control topbar'da, güvenli mod default
- Ayarlar: SegmentedControl + 2/3 kolon form grid

---

### Aşama 8 — Responsive / 1366×768 Kontrol

**Etki:** `styles.css` (media queries)

**Ne değişir:**
- `@media (max-width: 1400px)`: sidebar 200px → 180px, page padding 16px → 12px
- `@media (max-width: 1180px)`: Mevcut breakpoint iyileştirilir (tek kolon fallback'ler)
- Tüm sayfaların 1366×768'de `%100 zoom` testi

---

## 8. Riskler ve Önlemler

| Risk Alanı | Açıklama | Önlem |
|-----------|----------|-------|
| **Electron webview** | WhatsApp Web modu `<webview>` tag'ı içeriyor. CSS değişiklikleri webview içini etkilemez. | Webview wrapper div'in dışını değiştir, içini dokunma. |
| **WhatsApp güvenli mod** | `prepareWhatsAppAction`, `createWhatsAppUrl`, mesaj gönderim state'leri `App.tsx`'te. | Component extract'te sadece JSX taşı, handler'ları prop olarak geçir. |
| **AI taslak aksiyonları** | `handleGenerateAiWorkspace`, `handleSaveAiWorkspace` gibi handler'lar `App.tsx`'te tanımlı. | Extract sonrası bu handler'lar `App.tsx`'te kalır, sayfa component'lerine prop geçilir. |
| **businessCapabilities** | `buildNavigation` ve conditional rendering capability snapshot'ına bağlı. | Profil yalnız başlangıç preset'idir; runtime görünürlük persisted capability'lerden okunur. |
| **Form state'leri** | `categoryForm`, `itemForm`, `setupForm` gibi state'ler `App.tsx`'de tanımlı. | Extract sırasında state'ler `App.tsx`'te kalır, handler prop'ları ile sayfa bileşenine geçilir. |
| **Scroll davranışı** | `contentRef.current?.scrollTo()` page değişiminde scroll'u sıfırlıyor. | `AppShell` → `PageContent` ref yapısı korunmalı. contentRef'i yeni component'e prop olarak geç. |
| **Build/typecheck** | `App.tsx` extract sırasında `import` yolları değişir. | Her aşama sonrası `npm run build` çalıştır. TypeScript strict mode'da tip hatası olmadığını doğrula. |
| **Zoom/ui-scale** | `--ui-scale` ve `zoom: var(--ui-scale)` `:root`'ta kullanılıyor. Token refactor'da korunmalı. | Token dosyasına `--ui-scale: 1` ekle, `readUiPreferences()` çağrısı dokunulmadan bırak. |

---

## 9. Codex'e Verilecek Uygulama Promptu

```
### Yardımcı Asistan Desktop — UI Refactor Uygulama Talimatı

**Amaç**
apps/desktop-app uygulamasının React + Vite frontend'ini modern koyu temalı,
kompakt ve 1366×768 çözünürlükte %100 zoom ile kullanılabilir hale getir.
Backend, Electron IPC, veritabanı ve senkronizasyon mantığına dokunma.

**Kapsam**
- src/styles.css
- src/App.tsx (JSX extract, prop geçişleri)
- src/pages/*.tsx (refactor + yeni component extract)
- src/components/layout/ (yeni: AppShell, Sidebar, PageHeader)
- src/components/ui/ (yeni: MetricCard, StatusBadge, CompactListItem, Panel,
  ActionButton, SegmentedControl, Toolbar, DrawerPanel)

**Değiştirilecek Alanlar**
1. Design token'ları: styles.css :root ve :root[data-theme="dark"] blokları
2. Layout ölçüleri: sidebar 200px, topbar 56px, page-padding 16px, satır 52–60px
3. Sidebar bileşeni: genişlik küçültme, nav item kompakt, aktif state left-border
4. PageHeader bileşeni: başlık + açıklama + sağda CTA slot, 56px sabit
5. Dashboard: metrik grid 4 kolon 80px, talep listesi satır tabanlı 56px
6. CustomerWork: master-detail layout, sol 290px liste, sağ detay paneli
7. Pansiyon: 1fr 320px grid, oda kart 64px renkli sol border
8. Restoran: masa grid 3 kolon + 260px görev paneli
9. Menü: 3 kolon extract (MenuPage.tsx), form kompakt 34px input
10. Mesajlar: SegmentedControl topbar'da, güvenli mod default
11. Ayarlar: extract (SettingsPage.tsx), 2–3 kolon form grid

**Korunacak Fonksiyonlar**
- window.yardimciDesktop IPC çağrıları (pullRequests, getDashboardData, vb.)
- WhatsApp URL oluşturma (createWhatsAppUrl, createWhatsAppWebUrl)
- AI workspace handler'ları (generate, save, copy, whatsapp)
- businessCapabilities ile koşullu nav ve sayfa görünürlüğü
- --ui-scale zoom sistemi (ui-preferences.ts)
- Tüm form state'leri (categoryForm, itemForm, setupForm, manualRequestForm)
- Electron webview wrapper (WhatsApp Web modu)
- messagesAiOpen, backupState, androidPublishState state'leri
- contentRef scroll sıfırlama

**Uygulama Sırası**
1. styles.css: token güncelleme (renkler, boyutlar, radius, shadow)
2. AppShell + Sidebar + PageHeader extract
3. Ortak UI bileşenleri (components/ui/)
4. DashboardPage extract ve yeni layout
5. CustomerWorkPage refactor (master-detail)
6. PensionPage + RestaurantPage refactor
7. MenuPage + SettingsPage extract + MessagesPage refactor
8. Media query / responsive kontrol

**Test Komutları**
cd apps/desktop-app
npm run build          # TypeScript + Vite build kontrolü
npm run dev            # Renderer geliştirme

**Kabul Kriterleri**
- [ ] npm run build hatasız tamamlanıyor
- [ ] 1366×768'de %100 zoom'da tüm sayfalar scroll gerektirmeden görüntülenebiliyor
- [ ] Sidebar 200px, nav item'lar görünür
- [ ] Dashboard'da 4 metrik + talep listesi aynı anda görünüyor
- [ ] Müşteri İşleri'nde sol liste 8+ satır gösteriyor
- [ ] Pansiyon'da rezervasyon listesi ve oda grid aynı ekranda
- [ ] Web talebi çekme butonu çalışıyor
- [ ] WhatsApp güvenli mod çalışıyor
- [ ] AI taslak oluşturma çalışıyor
- [ ] `accommodation.rooms` kapalı iken Pansiyon menüde yok
- [ ] Menü yayınlama butonu çalışıyor
- [ ] Ayarlar kaydediliyor
```

---

> **Bu planı Codex ile uygulama aşamasına çevirmemi ister misiniz?**

# Masaüstü Frontend Mimarisi

Bu belge masaüstü renderer'ın güncel Application Platform v2 kompozisyonunu özetler.
Domain sınırlarında Constitution ve Domain Decision Register yetkilidir.

## Kök kompozisyon

Renderer akışı:

```text
App.tsx
  → controllers / application coordination
  → DesktopAppView
      → lock boundary + Appearance
      → PageViewStateProvider (unlocked business/database session)
      → DesktopAppFrame
          → global shell/navigation/header
          → global canonical Workspace hosts
          → DesktopWorkspaceRouter
              → active Page composition
```

`App.tsx` sunum dosyası değildir. Page JSX'i veya domain workspace UI'si köke geri
taşınmamalıdır.

## DesktopAppView

`DesktopAppView`:

- application controller'larını alır
- app lock boundary'sini uygular
- Appearance v2 preference state'ini sahiplenir
- Market ve Finance gibi view-lifetime controller hook'larını kurar
- Frame + Router kompozisyonunu yapar

Appearance persistence yalnız version 2 shape kullanır. Eski easy/pro/theme/mode
compatibility katmanı yoktur.

## DesktopAppFrame

Frame global shell sahibidir:

- Sidebar
- PageHeader
- global sync/status
- notifications
- diagnostics overlay
- local menu preview
- global canonical entity Workspace hosts
- WorkspaceNavigationProvider

Frame page/domain formu render etmez.

Navigation metadata `app/navigation.ts` içindeki static typed contribution modelinden
gelir. Capability snapshot görünürlük kaynağıdır.

## DesktopWorkspaceRouter

Router active page kompozisyonunu yapar ve controller operasyonlarını doğru page/feature
props'larına bağlar.

Router canonical entity editor mantığını kopyalamaz. Bir Page başka bir entity üzerinde
çalışmak istediğinde Workspace navigation intent açar.

Controller'lar mevcut sahiplerinde kalır. Route/remount boyunca yalnız sunum bağlamı
`app/page-view-state.tsx` içindeki `usePageViewState` / `usePageViewScroll` ile korunur.
Store unlocked işletme/veritabanı oturumuna aittir; kilit/logout ve context değişiminde
sıfırlanır. Entity snapshot, secret, kaydedilmemiş form ve domain mutation bu store'a
girmez. Persist edilen entity ID, açılışta canonical veriyle yeniden doğrulanır.
[Canonical UI sözleşmesi](design-system/UX_CONSOLIDATION.md) kullanım sınırlarını açıklar.

## Controller ownership

Controller'lar presentation component değildir.

- `DesktopSyncController` — dashboard/domain projection ve sync/capability akışı
- `SetupController` — canonical setup state/save
- `MessagingController` — WhatsApp/AI state ve operasyonlar
- `CustomerController` — request/customer akışı
- `OperationController` — reservation/task/table gibi operasyon delegasyonu
- `DeviceController` — Android cihaz operasyonları
- `MarketController` — Market data/view coordination
- `FinanceController` — Finance workspace state/operations

Yeni generic controller factory/service locator eklenmez.

## Page / Workspace ayrımı

Page operasyon lensidir. Entity Workspace tek entity için canonical çalışma alanıdır.

Canonical workspace tanımları static aggregate ile bağlanır. Feature-owned örnekler:

- Pension → Room Workspace definition
- Restaurant → Table Workspace definition

Customer, Product ve Menu Item workspace'leri de aynı platform contract'ını kullanır.

Workspace intent entityType/entityId/mode/action/return context taşır. Presentation
centered/full-canvas olabilir; presentation değişimi aynı mounted state'i korur.

## Settings Platform

`SettingsWorkspace` dört category kullanır. Setup staged draft state page lifetime'ında
korunur. Field ownership `settings-draft-model.ts` üzerinden tek kaynaktır.

Static staged contribution slot yalnız kendi category draft'ına yazabilir. Resource ve
action lifecycles ayrı kalır.

## Capability modeli

Business profile preset'tir; runtime authority değildir.

Renderer davranış/görünürlük kararları persisted `BusinessCapabilitySnapshot`
üzerinden yapılır. Backend/domain mutation gate'leri ayrıca korunur.

`CapabilityCondition` yalnız static UI composition için kullanılan küçük bir dildir;
authorization sistemi değildir.

## Persistent özel lifetimes

Bazı feature'lar özellikle genericleştirilmemiştir:

- Messages persistent WhatsApp guest/webview
- Market Quick Sale session/scanner/recovery ownership
- Finance transaction/lock/generation ownership
- Calendar router-lifetime page context
- Dashboard SystemHealth projection-only ownership

Bu state'leri global generic registry/store içine taşımayın.

## Stil sistemi

Tek giriş: `src/styles/index.css`.

Katmanlar:

```text
reset
tokens
foundation
components
layout
pages
utilities
appearance
```

Appearance scheme/density/accent/font/motion ayrı eksenlerdir.

Feature stylesheet:

- shell geometry tanımlamaz
- global palette/radius/shadow sahiplenmez
- ortak primitive'i yüksek specificity ile override etmez
- yalnız feature-specific layout/presentation taşır

## Test yaklaşımı

Yeni test davranışı korur, tarihsel DOM yapısını değil.

Öncelik:

1. domain/service contract
2. platform contract
3. feature browser behavior
4. yalnız zorunluysa minimal source-structure guard

Migration-era screenshot/DOM smoke'ları kaldırılmıştır. Güncel milestone kapıları
`AGENTS.md` altında tutulur.

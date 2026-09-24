# Desktop Design System

Bu belge masaüstü uygulamanın güncel stil ve primitive sözleşmesidir. Tarihsel migration
envanteri kaldırılmıştır; hedef yalnız yaşayan v2 sistemidir.

## Stil ağacı

Tek giriş noktası:

```text
apps/desktop-app/src/styles/index.css
```

Güncel yapı:

```text
styles/
  tokens/
    primitives.css
    semantic.css
    typography.css
    dimensions.css
  appearance/
    schemes.css
    density.css
    accents.css
    fonts.css
    motion.css
  foundation/
    reset.css
    base.css
    typography.css
    focus.css
  components/
    badges.css
    buttons.css
    cards.css
    data-list.css
    dialogs.css
    workspace.css
    navigation.css
    header.css
    notifications.css
    toolbars.css
    status.css
    disclosures.css
    feedback.css
    forms.css
    metrics.css
    motion.css
    panels.css
    resources.css
  layout/
    app-shell.css
    page.css
    responsive.css
  pages/
    ...
  utilities.css
```

## Appearance v2

Tek appearance sistemi:

- color scheme: system / light / dark
- density: comfortable / compact
- accent: controlled preset
- font: controlled preset
- scale
- motion preference

Eski easy/pro, theme dosyaları veya `data-theme/data-mode` dalları kullanılmaz.

## Token ilkesi

Feature code mümkün olduğunca semantic/component token kullanır.

Token katmanı:

```text
primitive → semantic → component/primitive CSS → feature layout
```

Feature stylesheet içinde yeni raw palette, global radius/shadow sistemi veya paralel
spacing scale yaratmayın.

## Shared primitives

React/UI primitive'leri semantik role göre kullanılır:

- `ActionButton`
- `IconButton`
- `StatusBadge`
- `DataList`
- `Panel`
- `FormDialog`
- `ModalSurface`
- `WorkspaceFrame`
- `WorkspaceTabs`
- `PageHeader`
- `AppShell`

Yeni component yalnız tekrar eden gerçek bir semantic contract varsa çıkarılır.

## Workspace presentation

Canonical entity editor için Workspace platformu kullanılır.

Centered/full-canvas aynı entity state'inin iki presentation'ıdır. Feature kendi ikinci
dialog/drawer editör familyasını üretmez.

Nested modal yasaktır. Subflow mümkünse aynı Workspace içinde gösterilir.

## Formlar

- gerçek `label`/control ilişkisi
- native control davranışını gereksiz custom widget ile değiştirmeme
- açık field size sınıfları
- validation field/section yakınında
- dar viewportta tek kolon/taşmasız düzen

## Layout ownership

`AppShell` global viewport/sidebar/content sınırını sahiplenir.

Feature Page yalnız kendi toolbar/body düzenini; Workspace yalnız entity içeriğini
sahiplenir. Feature CSS global sidebar/header/page padding tanımlamaz.

## Renk ve durum

Durum yalnız renkle anlatılmaz. Badge/icon yanında metin gerekir.

Danger, warning, success, info semantic tokenlarını kullanın. Feature'a özel ham durum
paleti üretmeyin.

## Motion ve focus

Motion durum değişimini açıklamak için kullanılır ve reduced-motion'a uyar.

Workspace/dialog açma-kapama focus restoration, focus trap ve close guard davranışları
platform primitive'lerinin sorumluluğudur.

## CSS audit

Strict audit yeni borcu engeller:

```fish
npm run design:audit:strict
```

Audit özellikle şunları kontrol eder:

- raw color debt
- `!important`
- override tokenları
- eski alias'lar
- shell selector ownership
- orphan stylesheet
- duplicate/shared primitive ihlalleri

Menü preview gibi bilinçli renderer istisnaları audit'te açıkça sınıflandırılır.

## Yeni feature kontrol listesi

1. AppShell/Page anatomy'yi tekrar yazma.
2. Mevcut primitive'i kullan.
3. Canonical Workspace varsa yeni editor yaratma.
4. Feature CSS'i yalnız feature layout/presentation için kullan.
5. Semantic token kullan.
6. Responsive document overflow yaratma.
7. Focus/keyboard davranışını koru.
8. `design:audit:strict` ve ilgili behavior smoke'u çalıştır.

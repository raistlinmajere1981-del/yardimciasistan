# Nexa assets

Desktop and Web use the aquatic V2 SVG rig from
`packages/shared/utils/nexa-rig.ts`. This single module owns the locally authored
SVG, instance-scoped paints/clip IDs, expressions and child-part motion. The
executable reference lab remains at `.superdesign/audit/nexa-rig-v2/`.
The raster manifest and all retained artwork remain available for fallback and
other uses. Ready is the default.

## Authoritative map

`manifest.json` owns asset paths, dimensions, state aliases and Desktop/Web runtime
selections. Paths resolve from the repository/build-output root. UI code selects
by usage/state; it does not invent filenames. `pleased` maps to `success` and
`concerned` to `warning`.

Runtime images are lossless transparent WebP. Current Electron and modern widget
browsers support WebP; redundant runtime PNG fallbacks are omitted. High-resolution
and master PNG sources remain under `master/`. Habitats are independent SVG layers.
Named wide/welcome entries alias the identical canonical ready state export.

## Remaining structure

- `master/`: 14 PNG sources (including expression layers), prompts and lineage.
- `states/`: 49 WebP exports, seven states at 512/256/128/96/64/48/32 px.
- `desktop/`: seven specialized WebP exports, including micro sources.
- `web/`: four specialized WebP exports; welcome aliases ready-256 in the manifest.
- `habitat/`: eight SVG niche/shadow layers for light/dark.
- `quality/`: original measured artwork previews and reports.

Cleanup removed 82 redundant exports from the initial 173-file set: 70 runtime
PNGs, two master WebPs, eight habitat WebPs and two byte-identical named WebPs.
There are now 91 files. Retained image pixels have not been altered or regenerated.

## Runtime distribution

`scripts/nexa-assets.mjs` selects files from this manifest. Vite serves the same
paths in development and emits only the selected subset in build outputs.
Master/source/quality PNGs never enter Desktop/Web runtime distributions.
Web packaging copies those build assets beside widget.js, without modifying the
tracked template snapshot during normal builds.

Desktop mounts the shared rig at 112/64/40 px in wide/compact/micro modes and
unmounts it when sidebar navigation needs the space. Only a contact shadow frames
it; the older niche/blob layers are retained assets. A small nearby speech bubble
appears only in wide mode during work or a result; it never contains customer or
AI message content. Brand, Settings and navigation keep their existing ownership.

Web mounts the same rig at 48 px in the static closed launcher, 112 px on welcome,
and 32 px in the conversation/form header. Home uses only the configured business
logo in its header. Conversation/forms use one Nexa and no logo or per-message
avatars. If SVG rendering fails, `widgetNexaUrl` resolves manifest-backed WebP
beside widget.js, independently of host-page and API paths. Desktop likewise uses
its existing manifest fallback. Normal SVG rendering requests no character image.

## Motion and theme

The existing shared `createNexaPresence` remains the semantic authority:
ready → idle, thinking → focused eyes, speaking → mouth/gaze/fin gestures,
pleased → success with one finite delight, concerned → serious brows and mouth.
Sleep uses closed eyes; listening retains the calm fallback. Speaking is a visual
reaction to the existing response lifecycle, with no audio synchronization.
Web form success is observed only after the existing request API confirms it.

The SVG and body never bounce or scale. Crown, fins, eye aperture and clipped
pupils, mouth and trailing ribbons move independently. Each controller cancels
its animation frame and releases observers/listeners on unmount. Visibility,
intersection, focus, reduced motion and consumer activity gate the loop. The
closed launcher schedules no animation loop; closing stops the open rig before
the panel exit. Reduced motion retains distinct static expressions, including
success and concern. Character paints are fixed artwork, scoped by instance IDs;
surface/shadow styling uses each consumer's existing appearance system.

`smoke-desktop-nexa.mjs`, `smoke-web-nexa.mjs` and
`smoke-web-widget-branding.mjs` remain registered integration checks. They cover
child motion/clipping, semantic reactions, readable static expressions, stopped
lifecycles, unique IDs, fallback URLs, branding and narrow/sidebar interactions.
They save light/dark and small Desktop/Web screenshots under the ignored
`artifacts/nexa-integration/`. Run these on a host that permits local servers and
Chromium; no live service or publication is required.

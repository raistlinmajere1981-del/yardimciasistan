# Nexa assets

Character design is locked. Ready is the default. The shared white face, small
navy eyes, asymmetric upper crest and lower diagonal wrap are unchanged.

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

Desktop uses a common full-detail state source for wide/compact and the optical
48 px source for micro. It reduces or hides the habitat when navigation needs the
space. The existing sidebar scroll ownership is confined to navigation; the brand,
Settings and habitat do not create additional scrolling regions.

Web loads only launcher pixels while closed. Welcome is requested only on the
home panel. Conversation uses one compact header avatar, including thinking /
speaking states, and no per-message avatar. Asset URLs resolve beside the widget
script independently of the host site's URL and API endpoint.

## Motion and theme

There is no baked animation or idle loop. Only brief state-entry opacity/position
changes run while visible and focused. Reduced motion uses static image changes.
Hidden/background surfaces cancel transient reaction timers. Character colors do
not change with theme; only separate habitat/shadow layers differ.

The original 32/48 px artwork preview remains in `quality/`. Fine state differences
are intentionally subtle at 32 px; global/operation feedback stays in its existing
UI owner. New integration checks are registered in the repository verification
registry: nexa-assets, desktop-nexa and web-nexa.

# Brand assets (Yardımcı Asistan + Nexa identity)

Canonical source: `yardimci-asistan-logo-full.png` (1448×1086, transparent RGBA).
Full horizontal lockup: Nexa icon mark + "Yardımcı Asistan" wordmark.

## Two usages

- FULL LOGO (`yardimci-asistan-logo-full.png`): website header/footer already use
  the icon mark + HTML wordmark, so the full lockup ships only where a wide brand
  image is needed: desktop lock screen, showcase fallback cover art. Light
  surfaces only — the navy "Yardımcı" line is not readable on dark backgrounds.
- ICON MARK: square crop of the Nexa bubble (source x36–652, y268–834, squared
  with transparent padding, no redraw). Used for sidebar brand-symbol, favicons,
  Electron window/packaged icons, Android launcher, widget/provisioning symbol
  copies. No text, readable at 16 px.

## Derivation ( Pillow, LANCZOS, no redraw )

- Full runtime copies: trim alpha>=16 bbox + 4 px pad, resize to width 720.
- Icon master: crop box above → center on transparent square → resize per target.
  Launcher/mipmap targets keep ~20% padding so round/square masks never clip the
  bubble tail, antenna ball or swoosh tip.
- `app-icon.ico`: 16/24/32/48/64/128/256 from the padded 1024 master.
- Android adaptive (`mipmap-anydpi-v26`): foreground = icon-mark drawable,
  background = existing `@color/ya_night_background` (#0B1220, white Nexa face
  pops on it, teal/yellow stay legible).

## Quality notes

- Source corners are fully transparent; scattered alpha 1–10 noise pixels exist
  outside the artwork (bbox tail to y1060) and a faint AI fringe halo sits on
  edges. Derivatives trim sub-visible noise and rely on LANCZOS downsampling;
  artwork pixels are otherwise unaltered.
- Never scale the full horizontal lockup down to icon sizes. Use the icon mark.
- Do not copy the 1448 px canonical file directly into runtime surfaces.
- Nexa character asset set (`assets/nexa/`) is independent and untouched.

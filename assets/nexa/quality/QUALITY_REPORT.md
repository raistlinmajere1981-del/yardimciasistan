# Nexa quality and cleanup report

The character artwork is unchanged. The original generation review verified
native 32/48 px light/dark readability, common state alpha silhouettes and fixed
body geometry. Original visual proofs are retained in this folder.

Runtime cleanup removed 82 duplicate exports. No retained character pixels were
changed or generated again. Master/high-resolution PNG sources remain; states,
Desktop and Web use WebP; habitats use separate SVG layers. Runtime has no PNG
fallback duplicates and no byte-identical WebP files under different names.

Named wide/welcome usages share the canonical ready-256 WebP through the manifest.
All remaining manifest/source paths, byte counts, hashes and lossless WebP alpha /
dimensions are checked by `scripts/smoke-nexa-assets.mjs`. Runtime build subsets
exclude all master/source/quality files.

At 32 px, fine listening/thinking/success/warning distinctions remain subtle.
Identity and face readability take priority; Nexa does not replace authoritative
operation status, errors or accessible feedback.

Integration checks cover Desktop navigation at multiple heights, Settings access,
AI state transitions and reduced motion; Web launcher/welcome/conversation,
thinking/speaking, mobile sizing, lazy image requests and reduced motion. Their
current run results belong to the repository Verify JSON reports.

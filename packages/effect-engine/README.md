# Yardımcı Asistan owned effect engine

Source of truth: src/model, src/registry, src/runtime and src/editor.
Photo scenes are v1; the object scene engine is v2. The canonical model,
registry and runtime were adopted from the already released Yardımcı Asistan
site vendor, not from ChannelFoundry's later development tree. The existing
photo-scene semantics are unchanged.

The SHA-256 manifest and API compatibility gates protect site scenes.
Only update this source within the Yardımcı Asistan repository. Review
scene compatibility and targeted tests before regenerating the site's
vendor runtime using web-site-template/tools/sync-effect-engine.mjs.

The Admin photo editor mounts in React; it has no standalone HTML entrypoint.

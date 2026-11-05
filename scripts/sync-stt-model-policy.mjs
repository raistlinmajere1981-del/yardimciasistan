import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

// Explicit source snapshot refresh; builds/tests never rewrite tracked templates.
const require = createRequire(import.meta.url);
const { STT_MODEL_POLICY } = require("../packages/shared/dist");
writeFileSync(new URL("../firm-template/web-module/lib/stt-model-policy.json", import.meta.url),
  JSON.stringify(STT_MODEL_POLICY, null, 2) + "\n");

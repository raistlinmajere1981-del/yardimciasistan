import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

// Explicit snapshot refresh only; builds/tests must never rewrite tracked templates.
const require = createRequire(import.meta.url);
const { BUSINESS_AI_DOMAIN_POLICY, BUSINESS_AI_INTENT_POLICY, BUSINESS_AI_INFORMATION_PATTERNS } = require("../packages/shared/dist");
writeFileSync(new URL("../firm-template/web-module/lib/business-ai-policy.json", import.meta.url), JSON.stringify({
  domains: BUSINESS_AI_DOMAIN_POLICY,
  intents: BUSINESS_AI_INTENT_POLICY,
  informationPatterns: BUSINESS_AI_INFORMATION_PATTERNS
}, null, 2) + "\n");

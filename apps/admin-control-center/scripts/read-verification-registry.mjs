import {
  VERIFICATION_CHECKS,
  VERIFICATION_PRESETS,
  createVerificationPlan,
  verificationDomains
} from "../../../scripts/verification-registry.mjs";

const plans = Object.fromEntries(
  VERIFICATION_PRESETS.map((preset) => [
    preset,
    createVerificationPlan({ preset, platform: process.platform }).map((item) => item.id)
  ])
);

process.stdout.write(JSON.stringify({
  presets: VERIFICATION_PRESETS,
  domains: verificationDomains(),
  plans,
  checks: VERIFICATION_CHECKS.map((item) => ({
    id: item.id,
    label: item.label,
    phase: item.phase,
    presets: item.presets,
    domains: item.domains,
    requires: item.requires,
    manual: item.manual,
    platforms: item.platforms ?? null
  }))
}));

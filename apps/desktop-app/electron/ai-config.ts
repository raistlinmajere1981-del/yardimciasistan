export function normalizeAiTimeoutSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.max(5, Math.min(120, Math.trunc(value)));
}

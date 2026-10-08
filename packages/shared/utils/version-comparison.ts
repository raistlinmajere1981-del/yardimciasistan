/** Semver precedence; build metadata never changes update availability. */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.+)?$/);
  const a = parse(left), b = parse(right);
  if (!a || !b) return 0;
  for (const index of [1, 2, 3]) {
    if (Number(a[index]) !== Number(b[index])) return Number(a[index]) > Number(b[index]) ? 1 : -1;
  }
  if (a[4] === b[4]) return 0;
  if (!a[4]) return 1;
  if (!b[4]) return -1;
  const ap = a[4].split("."), bp = b[4].split(".");
  for (let i = 0; i < Math.max(ap.length, bp.length); ++i) {
    const aPart = ap[i];
    const bPart = bp[i];
    if (aPart === bPart) continue;
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    const an = /^\d+$/.test(aPart), bn = /^\d+$/.test(bPart);
    if (an && bn) return Number(aPart) > Number(bPart) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return aPart > bPart ? 1 : -1;
  }
  return 0;
}

export type Semver = {
  major: number;
  minor: number;
  patch: number;
};

export function parseSemver(input?: string | null): Semver | null {
  if (!input) return null;
  const cleaned = input.trim().replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return { major, minor, patch };
}

export function compareSemver(a: Semver, b: Semver) {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  return 0;
}

export function isWithinRange(version: Semver, min?: Semver | null, max?: Semver | null) {
  if (min && compareSemver(version, min) < 0) return false;
  if (max && compareSemver(version, max) > 0) return false;
  return true;
}

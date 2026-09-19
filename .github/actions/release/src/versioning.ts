import { ReleaseError } from "./errors.ts";

export type Versioning = "semver" | "calver";
const VERSION_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const CALVER_YEAR_MIN = 2000;

export interface ParsedTag {
  tag: string;
  major: number;
  minor: number;
  patch: number;
}

export interface CalverPlan {
  version: string;
  releaseType: "minor" | "patch";
  syntheticBaseTag?: string;
  releaseNotesBaseTag?: string;
}

export function parseVersionTag(tag: string): ParsedTag | undefined {
  const match = VERSION_TAG.exec(tag);
  if (!match) return undefined;
  const [, major, minor, patch] = match;
  return { tag, major: Number(major), minor: Number(minor), patch: Number(patch) };
}

export function isCalverTag(tag: ParsedTag): boolean {
  return tag.major >= CALVER_YEAR_MIN && tag.minor >= 1 && tag.minor <= 12;
}

export function assertVersionMode(versioning: Versioning, recordedModes: Versioning[]): void {
  const modes = new Set(recordedModes);
  if (modes.size === 0) return;
  if (modes.size !== 1 || !modes.has(versioning)) {
    throw new ReleaseError(
      "version_mode_mismatch",
      `Requested ${versioning}, but published releases record ${[...modes].join(" and ")}.`,
    );
  }
}

export function nextCalver(tags: string[], now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const latest = tags.map(parseVersionTag).filter((tag): tag is ParsedTag => Boolean(tag))
    .filter((tag) => tag.tag !== "v0.0.0" && isCalverTag(tag))
    .sort((a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch)[0];
  if (latest && (latest.major > year || (latest.major === year && latest.minor > month))) {
    throw new ReleaseError(
      "calver_clock_regression",
      `Current Asia/Tokyo month ${year}.${month} precedes latest release ${latest.major}.${latest.minor}.`,
    );
  }
  return `${year}.${month}.${latest?.major === year && latest.minor === month ? latest.patch + 1 : 0}`;
}

export function latestVersionTag(tags: string[]): string | undefined {
  return tags.map(parseVersionTag).filter((tag): tag is ParsedTag => Boolean(tag))
    .sort((a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch)[0]?.tag;
}

export function planCalver(tags: string[], now = new Date()): CalverPlan {
  const version = nextCalver(tags, now);
  const desired = parseVersionTag(`v${version}`)!;
  const latest = tags.map(parseVersionTag).filter((tag): tag is ParsedTag => Boolean(tag))
    .filter((tag) => tag.tag !== "v0.0.0" && isCalverTag(tag))
    .sort((a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch)[0];

  if (desired.patch > 0) return { version, releaseType: "patch" };
  if (latest?.major === desired.major && latest.minor + 1 === desired.minor) {
    return { version, releaseType: "minor" };
  }
  return {
    version,
    releaseType: "minor",
    syntheticBaseTag: `v${desired.major}.${desired.minor - 1}.0`,
    ...(latest ? { releaseNotesBaseTag: latest.tag } : {}),
  };
}

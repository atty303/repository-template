export interface ReleaseCommit {
  hash?: string;
  message: string;
}

const SUPPORTED_TYPES = new Set([
  "feat",
  "fix",
  "perf",
  "revert",
  "refactor",
  "docs",
  "test",
  "ci",
  "build",
  "chore",
]);
const HEADER = /^([a-z][a-z0-9-]*)(?:\([^()\r\n]+\))?(!)?: .+$/u;
const BREAKING_FOOTER = /^(?:BREAKING CHANGE|BREAKING-CHANGE): /mu;

export const RELEASE_RULES = [
  { breaking: true, release: "major" },
  { revert: true, release: "patch" },
  { type: "revert", release: "patch" },
  { type: "feat", release: "minor" },
  { type: "fix", release: "patch" },
  { type: "perf", release: "patch" },
  { type: "refactor", release: false },
  { type: "docs", release: false },
  { type: "test", release: false },
  { type: "ci", release: false },
  { type: "build", release: false },
  { type: "chore", release: false },
];

export function filterReleaseCommits(
  commits: ReleaseCommit[],
  warn: (message: string) => void = () => undefined,
): ReleaseCommit[] {
  return commits.flatMap((commit) => {
    const header = commit.message.split("\n", 1)[0] ?? "";
    const match = HEADER.exec(header);
    const breaking = match?.[2] === "!" || BREAKING_FOOTER.test(commit.message);
    if (!match || (!SUPPORTED_TYPES.has(match[1]!) && !breaking)) {
      warn(`Ignoring non-Conventional or unsupported commit ${commit.hash?.slice(0, 7) ?? "unknown"}.`);
      return [];
    }
    if (match[2] === "!") {
      const lines = commit.message.split("\n");
      lines[0] = header.replace("!:", ":");
      const message = lines.join("\n");
      return [{
        ...commit,
        message: BREAKING_FOOTER.test(message)
          ? message
          : `${message}\n\nBREAKING CHANGE: ${header.slice(header.indexOf(":") + 1).trim()}`,
      }];
    }
    return [commit];
  });
}

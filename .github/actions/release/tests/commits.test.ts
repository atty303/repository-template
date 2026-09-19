import assert from "node:assert/strict";
import test from "node:test";
import * as commitAnalyzer from "@semantic-release/commit-analyzer";
import { filterReleaseCommits, RELEASE_RULES, type ReleaseCommit } from "../src/commits.ts";

async function analyze(commits: ReleaseCommit[]): Promise<string | null> {
  return commitAnalyzer.analyzeCommits(
    { preset: "angular", releaseRules: RELEASE_RULES },
    {
      commits: filterReleaseCommits(commits),
      cwd: process.cwd(),
      logger: { log() {} },
    },
  );
}

test("release commit classification preserves breaking and revert semantics", async () => {
  assert.equal(await analyze([{ message: "feat!: break the API" }]), "major");
  assert.equal(await analyze([{ message: "fix(core)!: break the API" }]), "major");
  assert.equal(await analyze([{ message: "revert: undo bug" }]), "patch");
  assert.equal(await analyze([{ message: "docs: explain it" }]), null);
});

test("invalid headers cannot trigger through a breaking footer", async () => {
  const warnings: string[] = [];
  const commits = filterReleaseCommits(
    [{ hash: "0123456789", message: "not conventional\n\nBREAKING CHANGE: boom" }],
    (warning) => warnings.push(warning),
  );
  assert.deepEqual(commits, []);
  assert.equal(await analyze(commits), null);
  assert.deepEqual(warnings, ["Ignoring non-Conventional or unsupported commit 0123456."]);
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import test from "node:test";
import semanticRelease from "semantic-release";
import * as commitAnalyzer from "@semantic-release/commit-analyzer";
import * as releaseNotesGenerator from "@semantic-release/release-notes-generator";
import { runCommand } from "../src/command.ts";
import { git } from "../src/git.ts";
import { releaseNotesLastRelease, removeTransientBootstrapTag, withTransientLocalTags } from "../src/semantic.ts";
import { planCalver } from "../src/versioning.ts";

test("semantic-release publishes the planned CalVer through direct lifecycle functions", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-semantic-"));
  const remote = await mkdtemp(join(tmpdir(), "release-semantic-remote-"));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(remote, { recursive: true, force: true });
  });
  await runCommand("git", ["init", "--bare", "--initial-branch=main"], { cwd: remote });
  await runCommand("git", ["init", "--initial-branch=main"], { cwd: root });
  await runCommand("git", ["config", "user.name", "Release Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "release@example.invalid"], { cwd: root });
  await runCommand("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  await runCommand("git", ["commit", "--allow-empty", "-m", "chore: initial"], { cwd: root });
  await runCommand("git", ["tag", "v0.0.0"], { cwd: root });
  const calver = planCalver(["v0.0.0"], new Date("2026-09-19T01:00:00.000Z"));
  assert.equal(calver.syntheticBaseTag, "v2026.8.0");
  await runCommand("git", ["tag", calver.syntheticBaseTag, "v0.0.0"], { cwd: root });
  await runCommand("git", ["remote", "add", "origin", remote], { cwd: root });
  await runCommand("git", ["push", "-u", "origin", "main"], { cwd: root });
  await runCommand("git", ["commit", "--allow-empty", "-m", "fix: useful fix"], { cwd: root });
  await runCommand("git", ["push", "origin", "main"], { cwd: root });
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const result = await semanticRelease({
    branches: ["main"],
    repositoryUrl: pathToFileURL(remote).href,
    dryRun: false,
    noCi: true,
    plugins: [],
    analyzeCommits: [[async (pluginOptions: unknown, pluginContext: unknown) => {
      const releaseType = await commitAnalyzer.analyzeCommits(pluginOptions, pluginContext);
      return releaseType && calver.releaseType;
    }, {}]],
    verifyRelease: [async () => {
      await removeTransientBootstrapTag(root, "v0.0.0");
      await removeTransientBootstrapTag(root, calver.syntheticBaseTag);
    }],
    generateNotes: [[releaseNotesGenerator.generateNotes, {}]],
  } as any, { cwd: root, env: process.env as Record<string, string>, stdout: sink as any, stderr: sink as any });
  assert.ok(result && "nextRelease" in result);
  assert.equal(result.nextRelease.version, "2026.9.0");
  assert.match(result.nextRelease.notes ?? "", /useful fix/u);
  const remoteTags = await git(root, ["ls-remote", "--tags", remote]);
  assert.doesNotMatch(remoteTags, /refs\/tags\/v0\.0\.0/u);
  assert.doesNotMatch(remoteTags, /refs\/tags\/v2026\.8\.0/u);
  assert.match(remoteTags, /refs\/tags\/v2026\.9\.0/u);
});

test("CalVer release notes never link to local-only tags", async () => {
  const commits = [{ hash: "0123456789abcdef", message: "fix: useful fix" }];
  const nextRelease = {
    version: "2026.9.0",
    gitTag: "v2026.9.0",
    gitHead: "fedcba9876543210",
  };
  const context = {
    commits,
    nextRelease,
    options: { repositoryUrl: "https://github.com/example/project.git" },
    cwd: process.cwd(),
  };

  const firstPlan = planCalver(["v0.0.0"], new Date("2026-09-19T01:00:00.000Z"));
  assert.ok(firstPlan.syntheticBaseTag);
  const firstNotes = await releaseNotesGenerator.generateNotes({}, {
    ...context,
    lastRelease: releaseNotesLastRelease({ gitTag: firstPlan.syntheticBaseTag }, firstPlan),
  });
  assert.doesNotMatch(firstNotes, /compare\//u);
  assert.doesNotMatch(firstNotes, /v0\.0\.0|v2026\.8\.0/u);

  const skippedPlan = planCalver(["v2026.7.2"], new Date("2026-09-19T01:00:00.000Z"));
  assert.ok(skippedPlan.syntheticBaseTag);
  const skippedNotes = await releaseNotesGenerator.generateNotes({}, {
    ...context,
    lastRelease: releaseNotesLastRelease({ gitTag: skippedPlan.syntheticBaseTag }, skippedPlan),
  });
  assert.match(skippedNotes, /compare\/v2026\.7\.2\.\.\.v2026\.9\.0/u);
  assert.doesNotMatch(skippedNotes, /v2026\.8\.0/u);
});

test("transient local tags are removed after no-release and early failure", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-transient-tags-"));
  context.after(async () => await rm(root, { recursive: true, force: true }));
  await runCommand("git", ["init", "--initial-branch=main"], { cwd: root });
  await runCommand("git", ["config", "user.name", "Release Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "release@example.invalid"], { cwd: root });
  await runCommand("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  await runCommand("git", ["commit", "--allow-empty", "-m", "chore: initial"], { cwd: root });

  for (const outcome of ["no-release", "failure"] as const) {
    await runCommand("git", ["tag", "v0.0.0"], { cwd: root });
    await runCommand("git", ["tag", "v2026.8.0"], { cwd: root });
    const tags = new Set(["v0.0.0", "v2026.8.0"]);
    if (outcome === "no-release") {
      assert.equal(await withTransientLocalTags(root, tags, async () => false), false);
    } else {
      await assert.rejects(
        withTransientLocalTags(root, tags, async () => {
          throw new Error("verify conditions failed");
        }),
        /verify conditions failed/u,
      );
    }
    assert.equal(await git(root, ["tag", "--list", "v0.0.0"]), "");
    assert.equal(await git(root, ["tag", "--list", "v2026.8.0"]), "");
  }
});

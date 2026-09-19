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
import { removeTransientBootstrapTag } from "../src/semantic.ts";

test("semantic-release accepts bundled direct lifecycle functions", async (context) => {
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
    analyzeCommits: [[commitAnalyzer.analyzeCommits, { preset: "angular" }]],
    verifyRelease: [async () => removeTransientBootstrapTag(root, "v0.0.0")],
    generateNotes: [[releaseNotesGenerator.generateNotes, { preset: "angular" }]],
  } as any, { cwd: root, env: process.env as Record<string, string>, stdout: sink as any, stderr: sink as any });
  assert.ok(result && "nextRelease" in result);
  assert.equal(result.nextRelease.version, "0.0.1");
  assert.match(result.nextRelease.notes ?? "", /useful fix/u);
  const remoteTags = await git(root, ["ls-remote", "--tags", remote]);
  assert.doesNotMatch(remoteTags, /refs\/tags\/v0\.0\.0/u);
  assert.match(remoteTags, /refs\/tags\/v0\.0\.1/u);
});

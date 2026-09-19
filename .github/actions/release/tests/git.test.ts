import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCommand } from "../src/command.ts";
import { bootstrapTagTarget, createLocalTag, deleteLocalTag, git } from "../src/git.ts";

test("bootstrap tag targets the first-parent initial commit and is created once", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-bootstrap-"));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await runCommand("git", ["init", "--initial-branch=main"], { cwd: root });
  await runCommand("git", ["config", "user.name", "Release Test"], { cwd: root });
  await runCommand("git", ["config", "user.email", "release@example.invalid"], { cwd: root });
  await runCommand("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  await runCommand("git", ["commit", "--allow-empty", "-m", "chore: initial"], { cwd: root });
  const initial = await git(root, ["rev-parse", "HEAD"]);
  await runCommand("git", ["commit", "--allow-empty", "-m", "fix: later"], { cwd: root });
  const created = await bootstrapTagTarget(root);
  assert.deepEqual(created, { name: "v0.0.0", sha: initial });
  await createLocalTag(root, created!.name, created!.sha);
  assert.equal(await git(root, ["rev-list", "-n", "1", "v0.0.0"]), initial);
  assert.equal(await bootstrapTagTarget(root), undefined);
  await deleteLocalTag(root, created!.name);
  assert.deepEqual(await bootstrapTagTarget(root), created);
});

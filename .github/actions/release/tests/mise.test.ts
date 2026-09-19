import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCommand } from "../src/command.ts";
import { repositoryRoot } from "../src/git.ts";
import { listRootTasks, runReleaseTask, selectRootTask } from "../src/mise.ts";

test("selects only standard or monorepo-root task names", () => {
  assert.equal(selectRootTask([{ name: "release:build" }], "release:build"), "release:build");
  assert.equal(
    selectRootTask([{ name: "//:release:build" }, { name: "//packages/app:release:build" }], "release:build"),
    "//:release:build",
  );
  assert.equal(selectRootTask([{ name: "//packages/app:release:build" }], "release:build"), undefined);
});

test("actual mise monorepo syntax resolves root tasks from a package checkout path", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-mise-monorepo-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const packageDirectory = join(root, "packages", "app");
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    join(root, "mise.toml"),
    `monorepo_root = true

[monorepo]
config_roots = ["packages/app"]

[tasks."release:build"]
run = '''
#!/usr/bin/env bash
mkdir -p "$2"
printf '%s' "$1" > "$2/root.txt"
'''

[tasks."release:publish"]
run = "echo root-publish"
`,
  );
  await writeFile(
    join(packageDirectory, "mise.toml"),
    `[tasks."release:build"]
run = "echo child-build"
`,
  );
  await runCommand("git", ["init", "--initial-branch=main"], { cwd: root });
  const discoveredRoot = await repositoryRoot(packageDirectory);
  assert.equal(discoveredRoot, root);
  const state = join(root, ".mise-state");
  const tasks = await listRootTasks(discoveredRoot, {
    ...process.env,
    MISE_TRUSTED_CONFIG_PATHS: root,
    MISE_STATE_DIR: state,
    MISE_CACHE_DIR: join(root, ".mise-cache"),
  });
  assert.equal(selectRootTask(tasks, "release:build"), "//:release:build");
  assert.equal(selectRootTask(tasks, "release:publish"), "//:release:publish");
  assert.equal(tasks.some(({ name }) => name === "//packages/app:release:build"), false);
  const output = join(root, "artifacts");
  await runReleaseTask(discoveredRoot, "//:release:build", "2026.9.0", output, {
    ...process.env,
    MISE_TRUSTED_CONFIG_PATHS: root,
    MISE_STATE_DIR: state,
    MISE_CACHE_DIR: join(root, ".mise-cache"),
  });
  assert.equal(
    await import("node:fs/promises").then(({ readFile }) => readFile(join(output, "root.txt"), "utf8")),
    "2026.9.0",
  );
});

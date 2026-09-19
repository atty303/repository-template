import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("committed bundle starts when isolated from node_modules", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-bundle-isolated-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const bundle = join(root, "index.mjs");
  await copyFile("dist/index.js", bundle);
  const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [bundle], {
      cwd: root,
      env: { PATH: process.env.PATH, RUNNER_OS: "Linux", INPUT_VERSIONING: "semver" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => output += chunk);
    child.stderr.on("data", (chunk: string) => output += chunk);
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
  assert.notEqual(result.code, 0);
  assert.doesNotMatch(result.output, /ERR_AMBIGUOUS_MODULE_SYNTAX|ERR_MODULE_NOT_FOUND|Cannot find package/u);
});

test("post phase without a manifest never re-enters main", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-bundle-post-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const bundle = join(root, "index.mjs");
  await copyFile("dist/index.js", bundle);
  const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [bundle], {
      cwd: root,
      env: { PATH: process.env.PATH, STATE_post_sentinel: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => output += chunk);
    child.stderr.on("data", (chunk: string) => output += chunk);
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
  assert.equal(result.code, 0);
  assert.doesNotMatch(result.output, /Input required|No release|Release failed/u);
});

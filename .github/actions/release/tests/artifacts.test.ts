import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resetArtifactDirectory, validateArtifacts } from "../src/artifacts.ts";

test("validates direct files and writes deterministic checksums", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-artifacts-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "z.txt"), "z\n");
  await writeFile(join(root, "a.txt"), "a\n");
  assert.deepEqual(await validateArtifacts(root), ["a.txt", "z.txt", "SHA256SUMS"]);
  const checksums = await readFile(join(root, "SHA256SUMS"), "utf8");
  assert.match(checksums, /^[0-9a-f]{64}  a\.txt\n[0-9a-f]{64}  z\.txt\n$/u);
});

test("rejects directories and symbolic links", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-artifacts-invalid-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "nested"));
  await assert.rejects(validateArtifacts(root), /not a direct regular file/u);
  await resetArtifactDirectory(root);
  await writeFile(join(root, "target"), "x");
  await symlink("target", join(root, "link"));
  await assert.rejects(validateArtifacts(root), /not a direct regular file/u);
});

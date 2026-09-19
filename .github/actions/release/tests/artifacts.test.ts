import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resetArtifactDirectory, validateArtifacts, verifyPublishedArtifacts } from "../src/artifacts.ts";

test("validates and hashes direct files without creating checksum artifacts", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-artifacts-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "z.txt"), "z\n");
  await writeFile(join(root, "a.txt"), "a\n");
  assert.deepEqual(await validateArtifacts(root), [
    {
      name: "a.txt",
      size: 2,
      digest: "sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7",
    },
    {
      name: "z.txt",
      size: 2,
      digest: "sha256:c865f6c5ab8d1b0bcd383a5e1e3879d22681c96bf462c269b7581d523fbe70ab",
    },
  ]);
  assert.deepEqual((await readdir(root)).sort(), ["a.txt", "z.txt"]);
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

test("verifies uploaded GitHub asset sizes and digests", () => {
  const local = [{ name: "app.tar.xz", size: 3, digest: `sha256:${"a".repeat(64)}` }];
  assert.doesNotThrow(() =>
    verifyPublishedArtifacts(local, [{
      name: "app.tar.xz",
      size: 3,
      digest: `sha256:${"A".repeat(64)}`,
      state: "uploaded",
    }])
  );
  assert.throws(
    () => verifyPublishedArtifacts(local, [{ name: "app.tar.xz", size: 3, digest: null, state: "uploaded" }]),
    /digest <missing>/u,
  );
  assert.throws(
    () =>
      verifyPublishedArtifacts(local, [{
        name: "app.tar.xz",
        size: 3,
        digest: `sha256:${"b".repeat(64)}`,
        state: "uploaded",
      }]),
    /expected sha256:/u,
  );
});

test("requires the exact uploaded asset set", () => {
  const local = [{ name: "app.tar.xz", size: 3, digest: `sha256:${"a".repeat(64)}` }];
  assert.throws(() => verifyPublishedArtifacts(local, []), /missing asset/u);
  assert.throws(
    () =>
      verifyPublishedArtifacts(local, [
        { name: "app.tar.xz", size: 3, digest: `sha256:${"a".repeat(64)}`, state: "uploaded" },
        { name: "extra.txt", size: 0, digest: `sha256:${"b".repeat(64)}`, state: "uploaded" },
      ]),
    /unexpected assets/u,
  );
  assert.throws(
    () =>
      verifyPublishedArtifacts(local, [
        { name: "app.tar.xz", size: 3, digest: `sha256:${"a".repeat(64)}`, state: "uploaded" },
        { name: "app.tar.xz", size: 3, digest: `sha256:${"a".repeat(64)}`, state: "uploaded" },
      ]),
    /duplicate asset/u,
  );
});

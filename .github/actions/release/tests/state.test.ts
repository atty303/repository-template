import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { type CleanupApi, rollback, StateStore } from "../src/state.ts";

test("rollback removes only owned release resources with matching tag heads", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-state-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(join(root, "state.json"));
  await store.beginTag({ name: "v0.0.0", sha: "initial" });
  await store.setTagOwnership("v0.0.0", "created");
  await store.beginTag({ name: "v1.2.3", sha: "head" });
  await store.setTagOwnership("v1.2.3", "created");
  await store.beginRelease("v1.2.3", "owner-marker");
  await store.confirmRelease(42);
  const deleted: string[] = [];
  const refs = new Map([
    ["tags/v0.0.0", "initial"],
    ["tags/v1.2.3", "head"],
    ["notes/semantic-release-v1.2.3", "note"],
  ]);
  const api: CleanupApi = {
    async refSha(ref) {
      return refs.get(ref);
    },
    async deleteRef(ref) {
      deleted.push(ref);
      refs.delete(ref);
    },
    async release(tag) {
      return tag === "v1.2.3" ? { id: 42, body: "<!-- owner-marker -->" } : undefined;
    },
    async deleteRelease(id) {
      deleted.push(`release/${id}`);
    },
  };
  await rollback(store, api);
  assert.deepEqual(deleted, [
    "release/42",
    "tags/v1.2.3",
    "tags/v0.0.0",
  ]);
  assert.equal(refs.get("notes/semantic-release-v1.2.3"), "note");
  assert.equal(store.snapshot().status, "complete");
});

test("rollback preserves an existing unmarked release and a non-owned tag", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-state-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(join(root, "state.json"));
  await store.beginTag({ name: "v1.2.3", sha: "head" });
  await store.setTagOwnership("v1.2.3", "not-owned");
  await store.beginRelease("v1.2.3", "owner-marker");
  const deleted: string[] = [];
  const api: CleanupApi = {
    async refSha() {
      return "head";
    },
    async deleteRef(ref) {
      deleted.push(ref);
    },
    async release() {
      return { id: 7, body: "release created by another actor" };
    },
    async deleteRelease(id) {
      deleted.push(`release/${id}`);
    },
  };

  await assert.rejects(
    rollback(store, api),
    /Could not roll back: GitHub Release v1\.2\.3 \(ownership unconfirmed\)\./u,
  );
  assert.deepEqual(deleted, []);
  assert.equal(store.snapshot().status, "active");
});

test("rollback preserves a tag whose atomic creation outcome is unknown", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-state-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(join(root, "state.json"));
  await store.beginTag({ name: "v1.2.3", sha: "head" });
  const deleted: string[] = [];
  const api: CleanupApi = {
    async refSha() {
      return "head";
    },
    async deleteRef(ref) {
      deleted.push(ref);
    },
    async release() {
      return undefined;
    },
    async deleteRelease(id) {
      deleted.push(`release/${id}`);
    },
  };

  await assert.rejects(
    rollback(store, api),
    /Could not roll back: tag v1\.2\.3 \(creation outcome unknown\)\./u,
  );
  assert.deepEqual(deleted, []);
  assert.equal(store.snapshot().status, "active");
});

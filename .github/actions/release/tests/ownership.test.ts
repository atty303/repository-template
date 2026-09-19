import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOwnedTag } from "../src/ownership.ts";
import { StateStore } from "../src/state.ts";

test("atomic ref success records ownership", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-owned-ref-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(join(root, "state.json"));
  const calls: string[] = [];
  await createOwnedTag(
    {
      async createRef(ref, sha) {
        calls.push(`${ref}:${sha}`);
      },
    },
    store,
    { name: "v1.2.3", sha: "head" },
  );
  assert.deepEqual(calls, ["tags/v1.2.3:head"]);
  assert.equal(store.snapshot().tags[0]?.ownership, "created");
});

test("atomic ref conflict is recorded as non-owned", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-owned-ref-conflict-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(join(root, "state.json"));
  await assert.rejects(
    createOwnedTag(
      {
        async createRef() {
          throw Object.assign(new Error("exists"), { status: 422 });
        },
      },
      store,
      { name: "v1.2.3", sha: "head" },
    ),
    /atomically create/u,
  );
  assert.equal(store.snapshot().tags[0]?.ownership, "not-owned");
});

test("atomic ref failure reports safe GitHub API diagnostics", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "release-owned-ref-diagnostics-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(join(root, "state.json"));
  await assert.rejects(
    createOwnedTag(
      {
        async createRef() {
          throw Object.assign(new Error("Resource not accessible by integration"), {
            status: 403,
            response: { headers: { "x-github-request-id": "SAFE_REQUEST_ID" } },
          });
        },
      },
      store,
      { name: "v0.0.0", sha: "initial" },
    ),
    /HTTP 403; Resource not accessible by integration; request SAFE_REQUEST_ID/u,
  );
  assert.equal(store.snapshot().tags[0]?.ownership, "creating");
});

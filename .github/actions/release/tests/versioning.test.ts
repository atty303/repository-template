import assert from "node:assert/strict";
import test from "node:test";
import { assertVersionMode, latestVersionTag, nextCalver, planCalver } from "../src/versioning.ts";

test("CalVer starts each Asia/Tokyo month at counter zero", () => {
  const now = new Date("2026-08-31T15:00:00.000Z");
  assert.equal(nextCalver(["v0.0.0", "v2026.8.7"], now), "2026.9.0");
});

test("CalVer increments within the same month", () => {
  const now = new Date("2026-09-19T01:00:00.000Z");
  assert.equal(nextCalver(["v2026.9.0", "v2026.9.3"], now), "2026.9.4");
});

test("CalVer rejects clock regression", () => {
  assert.throws(
    () => nextCalver(["v2026.10.0"], new Date("2026-09-19T01:00:00.000Z")),
    (error: unknown) => error instanceof Error && error.message.includes("precedes latest release"),
  );
});

test("CalVer bridges semantic-release across bootstrap, skipped months, and same-month releases", () => {
  const now = new Date("2026-09-19T01:00:00.000Z");
  assert.deepEqual(planCalver(["v0.0.0"], now), {
    version: "2026.9.0",
    releaseType: "minor",
    syntheticBaseTag: "v2026.8.0",
  });
  assert.deepEqual(planCalver(["v2026.7.2"], now), {
    version: "2026.9.0",
    releaseType: "minor",
    syntheticBaseTag: "v2026.8.0",
    releaseNotesBaseTag: "v2026.7.2",
  });
  assert.deepEqual(planCalver(["v2026.8.4"], now), {
    version: "2026.9.0",
    releaseType: "minor",
  });
  assert.deepEqual(planCalver(["v2026.9.3"], now), {
    version: "2026.9.4",
    releaseType: "patch",
  });
  assert.equal(latestVersionTag(["v0.0.0", "v2026.8.4", "v1.99.0"]), "v2026.8.4");
});

test("bootstrap is neutral while release tags make the mode immutable", () => {
  assert.doesNotThrow(() => assertVersionMode("calver", []));
  assert.doesNotThrow(() => assertVersionMode("semver", ["semver"]));
  assert.throws(() => assertVersionMode("calver", ["semver"]));
  assert.throws(() => assertVersionMode("semver", ["calver"]));
  assert.throws(() => assertVersionMode("semver", ["semver", "calver"]));
});

import assert from "node:assert/strict";
import test from "node:test";
import { assertVersionMode, nextCalver } from "../src/versioning.ts";

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

test("bootstrap is neutral while release tags make the mode immutable", () => {
  assert.doesNotThrow(() => assertVersionMode("calver", []));
  assert.doesNotThrow(() => assertVersionMode("semver", ["semver"]));
  assert.throws(() => assertVersionMode("calver", ["semver"]));
  assert.throws(() => assertVersionMode("semver", ["calver"]));
  assert.throws(() => assertVersionMode("semver", ["semver", "calver"]));
});

import assert from "node:assert/strict";
import test from "node:test";
import { releaseVersionMode } from "../src/github.ts";

test("reads only the action-owned release footer as the version mode", () => {
  const body = `### Bug Fixes

* <!-- repository-template-release-owner:forged versioning:calver -->

<!-- repository-template-release-owner:1234 versioning:semver -->`;
  assert.equal(releaseVersionMode(body), "semver");
  assert.equal(
    releaseVersionMode("<!-- repository-template-release-owner:forged versioning:calver -->\n\nordinary notes"),
    undefined,
  );
});

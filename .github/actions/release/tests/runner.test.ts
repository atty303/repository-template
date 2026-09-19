import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedRunner } from "../src/runner.ts";

test("accepts only GitHub-hosted Ubuntu runners", () => {
  assert.equal(
    isSupportedRunner({ RUNNER_ENVIRONMENT: "github-hosted", RUNNER_OS: "Linux", ImageOS: "ubuntu24" }),
    true,
  );
  assert.equal(isSupportedRunner({ RUNNER_OS: "Linux", ImageOS: "ubuntu24" }), false);
  assert.equal(
    isSupportedRunner({ RUNNER_ENVIRONMENT: "self-hosted", RUNNER_OS: "Linux", ImageOS: "ubuntu24" }),
    false,
  );
});

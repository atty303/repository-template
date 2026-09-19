import { join } from "node:path";
import * as core from "@actions/core";
import {
  bootstrapTagTarget,
  createLocalTag,
  currentHead,
  git,
  reachableVersionTags,
  repositoryRoot,
  syncHistory,
} from "./git.ts";
import { GitHubApi } from "./github.ts";
import { findReleaseTasks } from "./mise.ts";
import { ReleaseError, releaseError } from "./errors.ts";
import { runSemanticRelease } from "./semantic.ts";
import { rollback, StateStore } from "./state.ts";
import { assertVersionMode, type Versioning } from "./versioning.ts";
import { isSupportedRunner } from "./runner.ts";

function branchName(env: NodeJS.ProcessEnv): string | undefined {
  if (env.GITHUB_REF_TYPE && env.GITHUB_REF_TYPE !== "branch") return undefined;
  return env.GITHUB_REF_NAME ?? env.GITHUB_REF?.replace(/^refs\/heads\//, "");
}

async function ensureBootstrapTag(root: string): Promise<string | undefined> {
  const bootstrap = await bootstrapTagTarget(root);
  if (!bootstrap) return undefined;
  await createLocalTag(root, bootstrap.name, bootstrap.sha);
  core.info(`Created transient local bootstrap tag ${bootstrap.name} on the first-parent initial commit.`);
  return bootstrap.name;
}

async function failureSummary(error: ReleaseError, rollbackError?: ReleaseError): Promise<void> {
  core.summary.addHeading("Release failed", 2)
    .addRaw(`**${error.code}**: ${error.message}\n\n`);
  if (rollbackError) core.summary.addRaw(`**${rollbackError.code}**: ${rollbackError.message}\n`);
  await core.summary.write();
}

async function successSummary(result: Awaited<ReturnType<typeof runSemanticRelease>>): Promise<void> {
  if (!result.released) return;
  core.summary.addHeading(`Released ${result.tag}`, 2)
    .addRaw(`Version: \`${result.version}\`\n\n`)
    .addRaw(`Artifacts: ${result.artifactNames.join(", ")}\n\n`)
    .addRaw(`Registry publish: ${result.registryPublished ? "completed" : "not configured"}\n`);
  await core.summary.write();
}

async function post(): Promise<void> {
  const manifest = core.getState("cleanup_manifest");
  if (!manifest) return;
  const store = await StateStore.load(manifest);
  if (store.snapshot().status === "complete") return;
  try {
    await rollback(store, new GitHubApi(core.getInput("github-token", { required: true })));
  } catch (error) {
    const releaseFailure = releaseError(error, "rollback_incomplete");
    core.setFailed(`[${releaseFailure.code}] ${releaseFailure.message}`);
  }
}

async function main(): Promise<void> {
  let store: StateStore | undefined;
  let api: GitHubApi | undefined;
  try {
    if (!isSupportedRunner(process.env)) {
      throw new ReleaseError(
        "unsupported_runner",
        "This release action currently supports GitHub-hosted Ubuntu runners only.",
      );
    }
    const versioning = core.getInput("versioning", { required: true }) as Versioning;
    if (versioning !== "semver" && versioning !== "calver") {
      throw new ReleaseError("version_mode_mismatch", "versioning must be semver or calver.");
    }
    const token = core.getInput("github-token", { required: true });
    api = new GitHubApi(token);
    const defaultBranch = await api.defaultBranch();
    const currentBranch = branchName(process.env);
    if (currentBranch !== defaultBranch) {
      core.info(`No release: ${currentBranch ?? "this ref"} is not the default branch ${defaultBranch}.`);
      return;
    }

    const root = await repositoryRoot(process.env.GITHUB_WORKSPACE ?? process.cwd());
    const runnerTemp = process.env.RUNNER_TEMP;
    if (!runnerTemp) throw new ReleaseError("unsupported_runner", "RUNNER_TEMP is not set.");
    store = new StateStore(
      join(
        runnerTemp,
        `release-cleanup-${process.env.GITHUB_RUN_ID ?? "local"}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}.json`,
      ),
    );
    await store.initialize();
    const releaseEnv = { ...process.env, GITHUB_TOKEN: token, GH_TOKEN: token };
    let transientBootstrapTag: string | undefined;

    await core.group("Synchronize release history", async () => {
      await syncHistory(root, defaultBranch, token, process.env.GITHUB_SERVER_URL ?? "https://github.com");
      transientBootstrapTag = await ensureBootstrapTag(root);
    });

    const tags = await reachableVersionTags(root);
    assertVersionMode(versioning, await api.releaseVersionModes());
    const tasks = await findReleaseTasks(root, releaseEnv);
    const repositoryUrl = await git(root, ["remote", "get-url", "origin"]);
    const head = await currentHead(root);
    if (head !== process.env.GITHUB_SHA) {
      throw new ReleaseError("git_sync_failed", "Checked-out HEAD does not match GITHUB_SHA.");
    }
    const result = await runSemanticRelease({
      root,
      defaultBranch,
      repositoryUrl,
      artifactDirectory: join(root, ".release", "artifacts"),
      versioning,
      reachableTags: tags,
      tasks,
      env: releaseEnv,
      api,
      state: store,
      transientBootstrapTag,
    });
    try {
      await successSummary(result);
    } catch (error) {
      core.warning(
        `Release succeeded, but the job summary could not be written: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await store.complete();
  } catch (error) {
    const failure = releaseError(error, "github_release_failed");
    let rollbackFailure: ReleaseError | undefined;
    if (store && api) {
      try {
        await rollback(store, api);
      } catch (rollbackError) {
        rollbackFailure = releaseError(rollbackError, "rollback_incomplete");
      }
    }
    await failureSummary(failure, rollbackFailure);
    core.setFailed(`[${failure.code}] ${failure.message}${rollbackFailure ? `; ${rollbackFailure.message}` : ""}`);
  }
}

if (core.getState("post_sentinel")) await post();
else {
  core.saveState("post_sentinel", "1");
  await main();
}

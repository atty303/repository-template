import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import * as core from "@actions/core";
import semanticRelease from "semantic-release";
import * as commitAnalyzer from "@semantic-release/commit-analyzer";
import * as releaseNotesGenerator from "@semantic-release/release-notes-generator";
import * as githubPlugin from "@semantic-release/github";
import {
  type LocalArtifact,
  resetArtifactDirectory,
  validateArtifacts,
  verifyPublishedArtifacts,
} from "./artifacts.ts";
import { filterReleaseCommits, RELEASE_RULES } from "./commits.ts";
import { createLocalTag, currentHead, deleteLocalTagIfPresent, git } from "./git.ts";
import type { GitHubApi } from "./github.ts";
import { runReleaseTask } from "./mise.ts";
import { createOwnedTag } from "./ownership.ts";
import { ReleaseError, releaseError } from "./errors.ts";
import type { StateStore } from "./state.ts";
import { type CalverPlan, latestVersionTag, planCalver, type Versioning } from "./versioning.ts";

interface Tasks {
  build: string;
  publish?: string;
}
interface NextRelease {
  version: string;
  gitTag: string;
  gitHead: string;
  notes: string;
  name: string;
}
interface PluginContext {
  commits: Array<{ hash?: string; message: string }>;
  lastRelease: { gitHead?: string; gitTag?: string };
  nextRelease: NextRelease;
}

export interface ReleaseResult {
  released: boolean;
  version?: string;
  tag?: string;
  notes?: string | undefined;
  artifactNames: string[];
  registryPublished: boolean;
}

function named<T extends (...args: any[]) => any>(name: string, plugin: T): T {
  Object.defineProperty(plugin, "pluginName", { value: name, enumerable: true });
  return plugin;
}

export async function removeTransientBootstrapTag(root: string, tag: string | undefined): Promise<void> {
  if (tag) await deleteLocalTagIfPresent(root, tag);
}

async function cleanupTransientTags(root: string, tags: Set<string>): Promise<void> {
  for (const tag of [...tags]) {
    await removeTransientBootstrapTag(root, tag);
    tags.delete(tag);
  }
}

export async function withTransientLocalTags<T>(
  root: string,
  tags: Set<string>,
  operation: () => Promise<T>,
): Promise<T> {
  let operationError: unknown;
  try {
    return await operation();
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await cleanupTransientTags(root, tags);
    } catch (cleanupError) {
      if (operationError) {
        throw new ReleaseError("git_sync_failed", "Release failed and transient local tags could not be removed.", {
          cause: new AggregateError([operationError, cleanupError]),
        });
      }
      throw cleanupError;
    }
  }
}

export function releaseNotesLastRelease(
  lastRelease: PluginContext["lastRelease"],
  calver: CalverPlan | undefined,
): PluginContext["lastRelease"] {
  if (!calver?.syntheticBaseTag) return lastRelease;
  return calver.releaseNotesBaseTag ? { ...lastRelease, gitTag: calver.releaseNotesBaseTag } : {};
}

export async function runSemanticRelease(options: {
  root: string;
  defaultBranch: string;
  repositoryUrl: string;
  artifactDirectory: string;
  versioning: Versioning;
  reachableTags: string[];
  tasks: Tasks;
  env: NodeJS.ProcessEnv;
  api: GitHubApi;
  state: StateStore;
  transientBootstrapTag?: string | undefined;
}): Promise<ReleaseResult> {
  const calver = options.versioning === "calver" ? planCalver(options.reachableTags) : undefined;
  const transientTags = new Set(
    [options.transientBootstrapTag].filter((tag): tag is string => Boolean(tag)),
  );
  if (calver?.syntheticBaseTag) {
    const anchorTag = latestVersionTag(options.reachableTags);
    if (!anchorTag) {
      throw new ReleaseError("git_sync_failed", "CalVer requires a reachable version tag as its release anchor.");
    }
    const anchorSha = await git(options.root, ["rev-list", "-n", "1", anchorTag]);
    await createLocalTag(options.root, calver.syntheticBaseTag, anchorSha);
    transientTags.add(calver.syntheticBaseTag);
    core.info(`Created transient local CalVer base ${calver.syntheticBaseTag} at ${anchorTag}.`);
  }
  let semanticLog = "";
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      semanticLog += chunk.toString();
      callback();
    },
  });
  let artifactNames: string[] = [];
  let artifacts: LocalArtifact[] = [];
  let registryPublished = false;
  const releaseOwner = randomUUID();
  const releaseMarker = `repository-template-release-owner:${releaseOwner}`;

  const analyze = named("conventional-commits", async (pluginOptions: unknown, context: PluginContext) => {
    const commits = filterReleaseCommits(context.commits, (message) => core.warning(message));
    const releaseType = await commitAnalyzer.analyzeCommits(pluginOptions, { ...context, commits });
    return releaseType && calver ? calver.releaseType : releaseType;
  });

  const verifyRelease = named("release-version", async (_pluginOptions: unknown, context: PluginContext) => {
    if (calver && context.nextRelease.version !== calver.version) {
      throw new ReleaseError(
        "version_calculation_failed",
        `semantic-release calculated ${context.nextRelease.version}; expected CalVer ${calver.version}.`,
      );
    }
    await cleanupTransientTags(options.root, transientTags);
  });

  const generateNotes = named("release-notes", async (pluginOptions: unknown, context: PluginContext) => {
    const commits = filterReleaseCommits(context.commits);
    const lastRelease = releaseNotesLastRelease(context.lastRelease, calver);
    return releaseNotesGenerator.generateNotes(pluginOptions, { ...context, commits, lastRelease });
  });

  const prepare = named("mise-release-build", async (_pluginOptions: unknown, context: PluginContext) => {
    await core.group("Build release artifacts", async () => {
      const before = await currentHead(options.root);
      await resetArtifactDirectory(options.artifactDirectory);
      try {
        await runReleaseTask(
          options.root,
          options.tasks.build,
          context.nextRelease.version,
          options.artifactDirectory,
          options.env,
        );
      } catch (error) {
        throw releaseError(error, "build_failed");
      }
      if (await currentHead(options.root) !== before) {
        throw new ReleaseError(
          "build_failed",
          "release:build created a commit; release tags must point to the input main commit.",
        );
      }
      artifacts = await validateArtifacts(options.artifactDirectory);
      artifactNames = artifacts.map(({ name }) => name);
      await options.state.setArtifacts(artifactNames);
      await createOwnedTag(options.api, options.state, {
        name: context.nextRelease.gitTag,
        sha: context.nextRelease.gitHead,
      });
      core.info(`Validated ${artifactNames.length} release files.`);
    });
  });

  const publishRegistry = named("mise-release-publish", async (_pluginOptions: unknown, context: PluginContext) => {
    if (!options.tasks.publish) return false;
    await core.group("Publish registry artifacts", async () => {
      try {
        await runReleaseTask(
          options.root,
          options.tasks.publish!,
          context.nextRelease.version,
          options.artifactDirectory,
          options.env,
        );
        registryPublished = true;
        await options.state.setRegistryPublished();
      } catch (error) {
        throw releaseError(error, "registry_publish_failed");
      }
    });
    return { name: "configured registry" };
  });

  const githubOptions = {
    assets: [{ path: join(options.artifactDirectory, "*") }],
    successComment: false,
    failComment: false,
    failTitle: false,
    labels: false,
    releasedLabels: false,
    addReleases: false,
    draftRelease: false,
    discussionCategoryName: false,
    releaseNameTemplate: "<%= nextRelease.gitTag %>",
    releaseBodyTemplate: `<%= nextRelease.notes %>\n\n<!-- ${releaseMarker} versioning:${options.versioning} -->`,
  };
  const publishGitHub = named("github-release", async (pluginOptions: unknown, context: PluginContext) => {
    await options.state.beginRelease(context.nextRelease.gitTag, releaseMarker);
    (pluginOptions as { assets: Array<{ path: string }> }).assets = artifactNames.map((name) => ({
      path: join(options.artifactDirectory, name),
    }));
    try {
      const release = await githubPlugin.publish(pluginOptions, context) as { id?: unknown };
      if (typeof release.id !== "number") {
        throw new ReleaseError("github_release_failed", "GitHub publish did not return a release ID.");
      }
      await options.state.confirmRelease(release.id);
      verifyPublishedArtifacts(artifacts, await options.api.releaseAssets(release.id));
      core.info(`Verified ${artifactNames.length} GitHub Release asset digests.`);
      return release;
    } catch (error) {
      throw releaseError(error, "github_release_failed");
    }
  });

  const publish = options.tasks.publish
    ? [[publishRegistry], [publishGitHub, githubOptions]]
    : [[publishGitHub, githubOptions]];

  let semanticLogFlushed = false;
  const flushSemanticLog = async () => {
    if (semanticLogFlushed || !semanticLog) return;
    semanticLogFlushed = true;
    await core.group("semantic-release", async () => {
      process.stdout.write(semanticLog);
    });
  };
  let result: Awaited<ReturnType<typeof semanticRelease>>;
  try {
    result = await withTransientLocalTags(options.root, transientTags, () =>
      semanticRelease({
        extends: [],
        branches: [options.defaultBranch],
        repositoryUrl: options.repositoryUrl,
        tagFormat: "v${version}",
        plugins: [],
        analyzeCommits: [[analyze, { releaseRules: RELEASE_RULES }]],
        verifyConditions: [[githubPlugin.verifyConditions, githubOptions]],
        verifyRelease: [verifyRelease],
        generateNotes: [[generateNotes, {}]],
        prepare: [prepare],
        publish,
        addChannel: false,
        success: false,
        fail: false,
        ci: true,
      } as any, {
        cwd: options.root,
        env: options.env as Record<string, string>,
        stdout: sink as any,
        stderr: sink as any,
      }));
  } catch (error) {
    await flushSemanticLog();
    throw error;
  }

  if (!result || !("nextRelease" in result)) {
    core.info("No release: no relevant commits since the latest release tag.");
    return { released: false, artifactNames: [], registryPublished: false };
  }
  await flushSemanticLog();
  return {
    released: true,
    version: result.nextRelease.version,
    tag: result.nextRelease.gitTag,
    notes: result.nextRelease.notes,
    artifactNames,
    registryPublished,
  };
}

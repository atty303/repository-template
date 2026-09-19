import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import * as core from "@actions/core";
import semanticRelease from "semantic-release";
import * as commitAnalyzer from "@semantic-release/commit-analyzer";
import * as releaseNotesGenerator from "@semantic-release/release-notes-generator";
import * as githubPlugin from "@semantic-release/github";
import { resetArtifactDirectory, validateArtifacts } from "./artifacts.ts";
import { filterReleaseCommits, RELEASE_RULES } from "./commits.ts";
import { currentHead } from "./git.ts";
import type { GitHubApi } from "./github.ts";
import { runReleaseTask } from "./mise.ts";
import { createOwnedTag } from "./ownership.ts";
import { ReleaseError, releaseError } from "./errors.ts";
import type { StateStore } from "./state.ts";
import { nextCalver, type Versioning } from "./versioning.ts";

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
}): Promise<ReleaseResult> {
  let semanticLog = "";
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      semanticLog += chunk.toString();
      callback();
    },
  });
  let artifactNames: string[] = [];
  let registryPublished = false;
  const releaseOwner = randomUUID();
  const releaseMarker = `repository-template-release-owner:${releaseOwner}`;

  const analyze = named("conventional-commits", async (pluginOptions: unknown, context: PluginContext) => {
    const commits = filterReleaseCommits(context.commits, (message) => core.warning(message));
    return commitAnalyzer.analyzeCommits(pluginOptions, { ...context, commits });
  });

  const verifyRelease = named("release-version", async (_pluginOptions: unknown, context: PluginContext) => {
    if (options.versioning === "calver") {
      context.nextRelease.version = nextCalver(options.reachableTags);
      context.nextRelease.gitTag = `v${context.nextRelease.version}`;
      context.nextRelease.name = context.nextRelease.gitTag;
    }
  });

  const generateNotes = named("release-notes", async (pluginOptions: unknown, context: PluginContext) => {
    const commits = filterReleaseCommits(context.commits);
    return releaseNotesGenerator.generateNotes(pluginOptions, { ...context, commits });
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
      artifactNames = await validateArtifacts(options.artifactDirectory);
      await options.state.setArtifacts(artifactNames);
      await createOwnedTag(options.api, options.state, {
        name: context.nextRelease.gitTag,
        sha: context.nextRelease.gitHead,
      });
      core.info(`Validated ${artifactNames.length} release files including SHA256SUMS.`);
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
    result = await semanticRelease({
      extends: [],
      branches: [options.defaultBranch],
      repositoryUrl: options.repositoryUrl,
      tagFormat: "v${version}",
      plugins: [],
      analyzeCommits: [[analyze, { preset: "angular", releaseRules: RELEASE_RULES }]],
      verifyConditions: [[githubPlugin.verifyConditions, githubOptions]],
      verifyRelease: [verifyRelease],
      generateNotes: [[generateNotes, { preset: "angular" }]],
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
    });
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

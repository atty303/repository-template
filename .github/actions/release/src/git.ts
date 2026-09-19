import { runCommand } from "./command.ts";
import { ReleaseError } from "./errors.ts";
import { parseVersionTag } from "./versioning.ts";

function gitAuthEnvironment(token: string, serverUrl: string): NodeJS.ProcessEnv {
  const key = `http.${serverUrl.replace(/\/$/, "")}/.extraheader`;
  const value = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: key,
    GIT_CONFIG_VALUE_0: value,
    GIT_TERMINAL_PROMPT: "0",
  };
}

export async function git(root: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  return (await runCommand("git", args, { cwd: root, env })).stdout;
}

export async function repositoryRoot(cwd: string): Promise<string> {
  try {
    return await git(cwd, ["rev-parse", "--show-toplevel"]);
  } catch (error) {
    throw new ReleaseError("git_sync_failed", "The action must run inside a Git working tree.", { cause: error });
  }
}

export async function currentHead(root: string): Promise<string> {
  return git(root, ["rev-parse", "HEAD"]);
}

export async function syncHistory(
  root: string,
  defaultBranch: string,
  token: string,
  serverUrl: string,
): Promise<void> {
  try {
    const shallow = await git(root, ["rev-parse", "--is-shallow-repository"]);
    const args = ["fetch", "--force", "--prune", "--tags"];
    if (shallow === "true") args.push("--unshallow");
    args.push(
      "origin",
      `+refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`,
      "+refs/notes/*:refs/notes/*",
    );
    await git(root, args, gitAuthEnvironment(token, serverUrl));
  } catch (error) {
    throw new ReleaseError("git_sync_failed", "Unable to fetch complete Git history, tags, and notes.", {
      cause: error,
    });
  }
}

export async function reachableVersionTags(root: string): Promise<string[]> {
  const output = await git(root, ["tag", "--merged", "HEAD", "--list", "v*"]);
  return output.split("\n").filter((tag) => parseVersionTag(tag));
}

export async function bootstrapTagTarget(root: string): Promise<{ name: string; sha: string } | undefined> {
  if ((await reachableVersionTags(root)).length > 0) return undefined;
  const existing = await runCommand("git", ["rev-parse", "--verify", "--quiet", "refs/tags/v0.0.0"], {
    cwd: root,
  }).then(() => true, () => false);
  if (existing) {
    throw new ReleaseError("git_sync_failed", "Tag v0.0.0 exists but is not reachable from HEAD.");
  }
  const roots = (await git(root, ["rev-list", "--first-parent", "--max-parents=0", "HEAD"]))
    .split("\n").filter(Boolean);
  const sha = roots.at(-1);
  if (!sha) throw new ReleaseError("git_sync_failed", "Unable to find the first-parent initial commit.");
  return { name: "v0.0.0", sha };
}

export async function createLocalTag(root: string, name: string, sha: string): Promise<void> {
  try {
    await git(root, ["tag", name, sha]);
  } catch (error) {
    throw new ReleaseError("git_sync_failed", `Unable to create local tag ${name}.`, { cause: error });
  }
}

export async function deleteLocalTag(root: string, name: string): Promise<void> {
  try {
    await git(root, ["tag", "--delete", name]);
  } catch (error) {
    throw new ReleaseError("git_sync_failed", `Unable to delete transient local tag ${name}.`, { cause: error });
  }
}

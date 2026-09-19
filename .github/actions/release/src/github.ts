import { readFile } from "node:fs/promises";
import * as github from "@actions/github";
import { ReleaseError } from "./errors.ts";
import type { Versioning } from "./versioning.ts";

export interface Repository {
  owner: string;
  repo: string;
}

export interface GitHubRelease {
  id: number;
  body: string;
}

export interface GitHubReleaseAsset {
  name: string;
  size: number;
  digest: string | null;
  state: string;
}

export function releaseVersionMode(body: string): Versioning | undefined {
  const match = /<!-- repository-template-release-owner:[^ ]+ versioning:(semver|calver) -->\s*$/u.exec(body);
  return match?.[1] === "semver" || match?.[1] === "calver" ? match[1] : undefined;
}

export function repositoryFromEnvironment(env: NodeJS.ProcessEnv): Repository {
  const [owner, repo, extra] = (env.GITHUB_REPOSITORY ?? "").split("/");
  if (!owner || !repo || extra) throw new ReleaseError("unsupported_runner", "GITHUB_REPOSITORY is invalid.");
  return { owner, repo };
}

export class GitHubApi {
  readonly repository: Repository;
  private readonly octokit: ReturnType<typeof github.getOctokit>;

  constructor(token: string, env: NodeJS.ProcessEnv = process.env) {
    this.repository = repositoryFromEnvironment(env);
    this.octokit = github.getOctokit(token, env.GITHUB_API_URL ? { baseUrl: env.GITHUB_API_URL } : {});
  }

  async defaultBranch(env: NodeJS.ProcessEnv = process.env): Promise<string> {
    if (env.GITHUB_EVENT_PATH) {
      try {
        const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8")) as {
          repository?: { default_branch?: unknown };
        };
        if (typeof event.repository?.default_branch === "string") return event.repository.default_branch;
      } catch {
        // The API fallback below is authoritative.
      }
    }
    const response = await this.octokit.rest.repos.get({ ...this.repository });
    return response.data.default_branch;
  }

  async refSha(ref: string): Promise<string | undefined> {
    try {
      const response = await this.octokit.rest.git.getRef({ ...this.repository, ref });
      return response.data.object.sha;
    } catch (error) {
      if (typeof error === "object" && error && "status" in error && error.status === 404) return undefined;
      throw error;
    }
  }

  async deleteRef(ref: string): Promise<void> {
    await this.octokit.rest.git.deleteRef({ ...this.repository, ref });
  }

  async createRef(ref: string, sha: string): Promise<void> {
    await this.octokit.rest.git.createRef({ ...this.repository, ref: `refs/${ref}`, sha });
  }

  async release(tag: string): Promise<GitHubRelease | undefined> {
    try {
      const response = await this.octokit.rest.repos.getReleaseByTag({ ...this.repository, tag });
      return { id: response.data.id, body: response.data.body ?? "" };
    } catch (error) {
      if (typeof error === "object" && error && "status" in error && error.status === 404) return undefined;
      throw error;
    }
  }

  async deleteRelease(releaseId: number): Promise<void> {
    await this.octokit.rest.repos.deleteRelease({ ...this.repository, release_id: releaseId });
  }

  async releaseAssets(releaseId: number): Promise<GitHubReleaseAsset[]> {
    const assets: GitHubReleaseAsset[] = [];
    for (let page = 1;; page += 1) {
      const response = await this.octokit.rest.repos.listReleaseAssets({
        ...this.repository,
        release_id: releaseId,
        per_page: 100,
        page,
      });
      assets.push(...response.data.map(({ name, size, digest, state }) => ({
        name,
        size,
        digest,
        state,
      })));
      if (response.data.length < 100) return assets;
    }
  }

  async releaseVersionModes(): Promise<Versioning[]> {
    const modes: Versioning[] = [];
    for (let page = 1;; page += 1) {
      const response = await this.octokit.rest.repos.listReleases({ ...this.repository, per_page: 100, page });
      for (const release of response.data) {
        if (release.draft) continue;
        const mode = releaseVersionMode(release.body ?? "");
        if (mode) modes.push(mode);
      }
      if (response.data.length < 100) return modes;
    }
  }
}

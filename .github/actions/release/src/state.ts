import { readFile, rename, writeFile } from "node:fs/promises";
import * as core from "@actions/core";
import { ReleaseError } from "./errors.ts";

export interface CleanupApi {
  refSha(ref: string): Promise<string | undefined>;
  deleteRef(ref: string): Promise<void>;
  release(tag: string): Promise<{ id: number; body: string } | undefined>;
  deleteRelease(releaseId: number): Promise<void>;
}

export interface OwnedTag {
  name: string;
  sha: string;
  ownership: "creating" | "created" | "not-owned";
}

export interface OwnedRelease {
  tag: string;
  marker: string;
  id?: number;
}

export interface CleanupState {
  schema: 1;
  status: "active" | "complete";
  tags: OwnedTag[];
  release?: OwnedRelease;
  artifactNames?: string[];
  registryPublished?: boolean;
}

export class StateStore {
  private state: CleanupState = { schema: 1, status: "active", tags: [] };
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  static async load(path: string): Promise<StateStore> {
    const store = new StateStore(path);
    store.state = JSON.parse(await readFile(path, "utf8")) as CleanupState;
    return store;
  }

  snapshot(): Readonly<CleanupState> {
    return this.state;
  }

  async initialize(): Promise<void> {
    core.saveState("cleanup_manifest", this.path);
    await this.persist();
  }

  async beginTag(tag: Omit<OwnedTag, "ownership">): Promise<void> {
    if (!this.state.tags.some(({ name }) => name === tag.name)) {
      this.state.tags.push({ ...tag, ownership: "creating" });
    }
    await this.persist();
  }

  async setTagOwnership(name: string, ownership: OwnedTag["ownership"]): Promise<void> {
    const tag = this.state.tags.find((candidate) => candidate.name === name);
    if (!tag) throw new Error(`Tag ${name} is not journaled.`);
    tag.ownership = ownership;
    await this.persist();
  }

  async beginRelease(tag: string, marker: string): Promise<void> {
    this.state.release = { tag, marker };
    await this.persist();
  }

  async confirmRelease(id: number): Promise<void> {
    if (!this.state.release) throw new Error("Release is not journaled.");
    this.state.release.id = id;
    await this.persist();
  }

  async setArtifacts(names: string[]): Promise<void> {
    this.state.artifactNames = names;
    await this.persist();
  }

  async setRegistryPublished(): Promise<void> {
    this.state.registryPublished = true;
    await this.persist();
  }

  async complete(): Promise<void> {
    this.state.status = "complete";
    await this.persist();
  }

  private async persist(): Promise<void> {
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.state)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
  }
}

export async function rollback(store: StateStore, api: CleanupApi): Promise<string[]> {
  const state = store.snapshot();
  if (state.status === "complete") return [];
  const failures: string[] = [];
  if (state.release) {
    try {
      const release = await api.release(state.release.tag);
      if (
        release && release.body.includes(state.release.marker) && (!state.release.id || release.id === state.release.id)
      ) {
        await api.deleteRelease(release.id);
      } else if (release) {
        failures.push(`GitHub Release ${state.release.tag} (ownership unconfirmed)`);
      }
    } catch {
      failures.push(`GitHub Release ${state.release.tag}`);
    }
  }
  for (const tag of [...state.tags].reverse()) {
    if (tag.ownership === "not-owned") continue;
    if (tag.ownership === "creating") {
      failures.push(`tag ${tag.name} (creation outcome unknown)`);
      continue;
    }
    try {
      const remoteSha = await api.refSha(`tags/${tag.name}`);
      if (remoteSha === tag.sha) await api.deleteRef(`tags/${tag.name}`);
      else if (remoteSha !== undefined) failures.push(`tag ${tag.name} (ownership changed)`);
    } catch {
      failures.push(`tag ${tag.name}`);
    }
  }
  if (failures.length > 0) {
    throw new ReleaseError("rollback_incomplete", `Could not roll back: ${failures.join(", ")}.`);
  }
  await store.complete();
  return failures;
}

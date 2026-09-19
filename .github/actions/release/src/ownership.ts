import { ReleaseError } from "./errors.ts";
import type { StateStore } from "./state.ts";

export interface RefCreator {
  createRef(ref: string, sha: string): Promise<void>;
}

function statusOf(error: unknown): number | undefined {
  return typeof error === "object" && error && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
}

export async function createOwnedTag(
  api: RefCreator,
  state: StateStore,
  tag: { name: string; sha: string },
): Promise<void> {
  await state.beginTag(tag);
  try {
    await api.createRef(`tags/${tag.name}`, tag.sha);
  } catch (error) {
    if (statusOf(error) === 422) await state.setTagOwnership(tag.name, "not-owned");
    throw new ReleaseError("git_sync_failed", `Unable to atomically create tag ${tag.name}.`, { cause: error });
  }
  await state.setTagOwnership(tag.name, "created");
}

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

function apiFailureDetail(error: unknown): string {
  if (typeof error !== "object" || !error) return String(error);
  const status = statusOf(error);
  const message = "message" in error && typeof error.message === "string" ? error.message : undefined;
  const response = "response" in error && typeof error.response === "object" && error.response
    ? error.response
    : undefined;
  const headers = response && "headers" in response && typeof response.headers === "object" && response.headers
    ? response.headers
    : undefined;
  const requestId = headers && "x-github-request-id" in headers &&
      typeof headers["x-github-request-id"] === "string"
    ? headers["x-github-request-id"]
    : undefined;
  return [status === undefined ? undefined : `HTTP ${status}`, message, requestId ? `request ${requestId}` : undefined]
    .filter(Boolean)
    .join("; ") || "unknown GitHub API failure";
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
    throw new ReleaseError(
      "git_sync_failed",
      `Unable to atomically create tag ${tag.name}: ${apiFailureDetail(error)}.`,
      { cause: error },
    );
  }
  await state.setTagOwnership(tag.name, "created");
}

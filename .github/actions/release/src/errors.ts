export type ErrorCode =
  | "unsupported_runner"
  | "git_sync_failed"
  | "version_mode_mismatch"
  | "calver_clock_regression"
  | "version_calculation_failed"
  | "build_task_missing"
  | "build_failed"
  | "artifact_invalid"
  | "artifact_verification_failed"
  | "registry_publish_failed"
  | "github_release_failed"
  | "rollback_incomplete";

export class ReleaseError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReleaseError";
    this.code = code;
  }
}

export function releaseError(error: unknown, fallback: ErrorCode): ReleaseError {
  return error instanceof ReleaseError
    ? error
    : new ReleaseError(fallback, error instanceof Error ? error.message : String(error), { cause: error });
}

export function isSupportedRunner(env: NodeJS.ProcessEnv): boolean {
  return env.RUNNER_ENVIRONMENT === "github-hosted" && env.RUNNER_OS === "Linux" &&
    Boolean(env.ImageOS?.startsWith("ubuntu"));
}

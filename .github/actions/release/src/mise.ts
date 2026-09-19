import { runCommand } from "./command.ts";
import { ReleaseError } from "./errors.ts";

interface MiseTask {
  name?: unknown;
}

export function selectRootTask(tasks: MiseTask[], name: string): string | undefined {
  const candidates = new Set([name, `//:${name}`]);
  const matches = tasks.map((task) => task.name).filter((task): task is string => typeof task === "string")
    .filter((task) => candidates.has(task));
  if (matches.length > 1) throw new ReleaseError("build_failed", `mise returned ambiguous root tasks for ${name}.`);
  return matches[0];
}

export async function listRootTasks(root: string, env: NodeJS.ProcessEnv): Promise<MiseTask[]> {
  const { stdout } = await runCommand("mise", ["tasks", "--json"], { cwd: root, env });
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) throw new Error("mise tasks --json did not return an array.");
  return parsed as MiseTask[];
}

export async function findReleaseTasks(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<{ build: string; publish?: string }> {
  const tasks = await listRootTasks(root, env);
  const build = selectRootTask(tasks, "release:build");
  if (!build) {
    throw new ReleaseError(
      "build_task_missing",
      "Required root mise task release:build (or //:release:build with monorepo_root=true) was not found.",
    );
  }
  const publish = selectRootTask(tasks, "release:publish");
  return publish ? { build, publish } : { build };
}

export async function runReleaseTask(
  root: string,
  task: string,
  version: string,
  artifactDirectory: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await runCommand("mise", ["run", task, "--", version, artifactDirectory], {
    cwd: root,
    env: { ...env, RELEASE_VERSION: version, RELEASE_ARTIFACT_DIR: artifactDirectory },
    stream: true,
  });
}

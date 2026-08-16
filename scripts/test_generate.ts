type License = "MIT" | "Apache-2.0";
type Template = "base" | "deno";

interface Scenario {
  license: License;
  name: string;
  projectName?: string;
  semanticRelease: boolean;
  template: Template;
}

const author = "Template Test <template@example.com>";
const scenarios: Scenario[] = [
  {
    name: "base-mit",
    projectName: "Base Mit",
    template: "base",
    license: "MIT",
    semanticRelease: false,
  },
  { name: "base-apache", template: "base", license: "Apache-2.0", semanticRelease: false },
  { name: "deno-mit", template: "deno", license: "MIT", semanticRelease: false },
  { name: "deno-apache-release", template: "deno", license: "Apache-2.0", semanticRelease: true },
];
const rootEffects = {
  "actionlint": "read",
  "archetect:interface": "read",
  "deno:check": "read",
  "deno:fmt": "write",
  "deno:lint": "write",
} as const;
const templateEffects = {
  base: { actionlint: "read" },
  deno: {
    actionlint: "read",
    "deno:check": "read",
    "deno:fmt": "write",
    "deno:lint": "write",
  },
} as const;

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function containsAtlTag(source: string): boolean {
  return source.includes("{%") || /(^|[^$])\{\{/.test(source);
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  console.log(`$ ${command} ${args.join(" ")} (${cwd})`);
  const status = await new Deno.Command(command, {
    args,
    cwd,
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;
  if (!status.success) {
    throw new Error(`${command} exited with status ${status.code}`);
  }
}

async function runCapture(command: string, args: string[], cwd: string): Promise<string> {
  console.log(`$ ${command} ${args.join(" ")} (${cwd})`);
  const output = await new Deno.Command(command, {
    args,
    cwd,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stderr = new TextDecoder().decode(output.stderr);
  assert(output.success, `${command} exited with status ${output.code}: ${stderr}`);
  return new TextDecoder().decode(output.stdout);
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), message);
  return value as Record<string, unknown>;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function verifyCodexConfig(mise: string, project: string): Promise<void> {
  const source = await runCapture(
    mise,
    ["exec", "--", "taplo", "get", "--file-path", ".codex/config.toml", "--output-format", "json"],
    project,
  );
  const config = asRecord(JSON.parse(source), `${project}: Codex config is not a table`);
  const servers = asRecord(config.mcp_servers, `${project}: Codex config lacks mcp_servers`);
  const hk = asRecord(servers.hk, `${project}: Codex config lacks the hk server`);
  assert(hk.command === "mise", `${project}: hk MCP does not use mise`);
  assert(
    JSON.stringify(hk.args) === JSON.stringify(["exec", "--", "hk", "mcp", "--root", "."]),
    `${project}: hk MCP has the wrong arguments`,
  );
  assert(hk.required === false, `${project}: hk MCP must remain optional`);
  assert(hk.startup_timeout_sec === 60, `${project}: hk MCP has the wrong startup timeout`);
  assert(hk.default_tools_approval_mode === "writes", `${project}: hk MCP does not preserve write approvals`);
  assert(
    JSON.stringify(hk.disabled_tools) === JSON.stringify(["start_check"]),
    `${project}: hk MCP does not disable only start_check`,
  );

  const tools = asRecord(hk.tools, `${project}: hk MCP lacks tool approvals`);
  for (const name of ["cancel_run", "start_safe_check", "start_safe_fix"]) {
    const tool = asRecord(tools[name], `${project}: hk MCP lacks ${name} approval`);
    assert(tool.approval_mode === "auto", `${project}: hk MCP does not auto-approve ${name}`);
  }
}

async function verifyFixPlan(
  mise: string,
  project: string,
  expectedEffects: Record<string, "read" | "write">,
): Promise<void> {
  const source = await runCapture(
    mise,
    ["exec", "--", "hk", "fix", "--all", "--safe", "--no-stage", "--plan", "--json"],
    project,
  );
  const plan = asRecord(JSON.parse(source), `${project}: hk fix plan is not an object`);
  assert(Array.isArray(plan.steps), `${project}: hk fix plan lacks steps`);
  const effects = new Map<string, unknown>();
  for (const value of plan.steps) {
    const step = asRecord(value, `${project}: hk fix plan contains an invalid step`);
    const metadata = asRecord(step.metadata, `${project}: ${String(step.name)} lacks plan metadata`);
    effects.set(String(step.name), metadata.effect);
    assert(
      metadata.effect === "read" || metadata.effect === "write",
      `${project}: ${String(step.name)} has unsafe effect ${String(metadata.effect)}`,
    );
  }
  for (const [name, effect] of Object.entries(expectedEffects)) {
    assert(effects.get(name) === effect, `${project}: ${name} effect is not ${effect}`);
  }
}

async function verifyHkMcp(mise: string, project: string): Promise<void> {
  assert(Deno.build.os === "linux", "hk MCP process-group verification requires Linux");
  const child = new Deno.Command("setsid", {
    args: [mise, "exec", "--", "hk", "mcp", "--root", "."],
    cwd: project,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const statusPromise = child.status;
  const stderrPromise = new Response(child.stderr).text();
  const writer = child.stdin.getWriter();
  const reader = child.stdout.pipeThrough(new TextDecoderStream()).getReader();
  const encoder = new TextEncoder();
  let nextId = 0;
  let testError: unknown;
  const activeRunIds = new Set<string>();
  const cleanupErrors: unknown[] = [];
  const pending = new Map<
    number,
    {
      reject: (reason: unknown) => void;
      resolve: (response: Record<string, unknown>) => void;
    }
  >();

  const stdoutPump = (async () => {
    let buffer = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += chunk.value;
        while (true) {
          const newline = buffer.indexOf("\n");
          if (newline < 0) break;
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line.length === 0) continue;
          const response = asRecord(JSON.parse(line), "hk MCP returned an invalid JSON-RPC response");
          if (typeof response.id !== "number") continue;
          pending.get(response.id)?.resolve(response);
          pending.delete(response.id);
        }
      }
      assert(buffer.length === 0, "hk MCP closed stdout with a partial response");
      assert(pending.size === 0, "hk MCP closed stdout before responding");
    } catch (error) {
      for (const waiter of pending.values()) waiter.reject(error);
      pending.clear();
      throw error;
    }
  })();

  async function send(message: Record<string, unknown>): Promise<void> {
    await withTimeout(
      writer.write(encoder.encode(`${JSON.stringify(message)}\n`)),
      5_000,
      "hk MCP request write",
    );
  }

  async function request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++nextId;
    const responsePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    try {
      await send({ jsonrpc: "2.0", id, method, params });
      const response = await withTimeout(responsePromise, 10_000, `${method} response`);
      assert(response.error === undefined, `hk MCP ${method} failed: ${JSON.stringify(response.error)}`);
      return response.result;
    } finally {
      pending.delete(id);
    }
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = asRecord(
      await request("tools/call", { name, arguments: args }),
      `hk MCP ${name} returned an invalid result`,
    );
    assert(result.isError !== true, `hk MCP ${name} failed: ${JSON.stringify(result.content)}`);
    return asRecord(result.structuredContent, `hk MCP ${name} lacks structured content`);
  }

  async function waitForRun(runId: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + 30_000;
    while (true) {
      const run = await callTool("get_run", { run_id: runId });
      if (run.finished_at !== null) return run;
      assert(Date.now() < deadline, `hk MCP run ${runId} did not finish`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  async function waitForRunning(runId: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + 30_000;
    while (true) {
      const run = await callTool("get_run", { run_id: runId });
      if (run.status === "running") return run;
      assert(run.finished_at === null, `hk MCP run ${runId} finished before cancellation`);
      assert(Date.now() < deadline, `hk MCP run ${runId} did not start running`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  async function signalProcessGroup(signal: "TERM" | "KILL"): Promise<boolean> {
    const output = await withTimeout(
      new Deno.Command("kill", {
        args: [`-${signal}`, "--", `-${child.pid}`],
        stdin: "null",
        stdout: "null",
        stderr: "piped",
      }).output(),
      2_000,
      `hk MCP process-group SIG${signal}`,
    );
    if (output.success) return true;
    const stderr = new TextDecoder().decode(output.stderr);
    if (stderr.includes("No such process")) return false;
    throw new Error(`failed to signal hk MCP process group with SIG${signal}: ${stderr}`);
  }

  try {
    const initialized = asRecord(
      await request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "repository-template-test", version: "1" },
      }),
      "hk MCP returned an invalid initialize result",
    );
    assert(initialized.protocolVersion === "2024-11-05", "hk MCP negotiated the wrong protocol version");
    assert(asRecord(initialized.serverInfo, "hk MCP lacks server info").name === "hk", "hk MCP is not hk");
    const capabilities = asRecord(initialized.capabilities, "hk MCP lacks capabilities");
    asRecord(capabilities.tools, "hk MCP lacks tool capabilities");
    asRecord(capabilities.resources, "hk MCP lacks resource capabilities");
    await send({ jsonrpc: "2.0", method: "notifications/initialized" });

    const listedTools = asRecord(await request("tools/list", {}), "hk MCP returned an invalid tool list").tools;
    assert(Array.isArray(listedTools), "hk MCP did not return a tool list");
    const toolNames = new Set(listedTools.map((tool) => String(asRecord(tool, "invalid hk MCP tool").name)));
    for (
      const name of [
        "cancel_run",
        "get_diff",
        "get_output",
        "get_run",
        "inspect_project",
        "plan",
        "start_safe_check",
        "start_safe_fix",
      ]
    ) {
      assert(toolNames.has(name), `hk MCP lacks ${name}`);
    }

    const resources = asRecord(
      await request("resources/list", {}),
      "hk MCP returned an invalid resource list",
    ).resources;
    assert(
      Array.isArray(resources) &&
        resources.some((resource) => asRecord(resource, "invalid hk MCP resource").uri === "ui://hk/run-dashboard"),
      "hk MCP lacks the run dashboard resource",
    );

    const started = await callTool("start_safe_fix", {});
    const runId = String(started.id);
    assert(runId !== "undefined", "hk MCP safe fix lacks a run id");
    activeRunIds.add(runId);
    const completed = await waitForRun(runId);
    activeRunIds.delete(runId);
    assert(completed.status === "succeeded", `hk MCP safe fix ended as ${String(completed.status)}`);
    assert(completed.exit_code === 0, "hk MCP safe fix did not exit successfully");
    const runResult = asRecord(completed.result, "hk MCP safe fix lacks a structured result");
    assert(Array.isArray(runResult.steps), "hk MCP safe fix lacks step results");
    for (const value of runResult.steps) {
      const step = asRecord(value, "hk MCP safe fix has an invalid step result");
      assert(Array.isArray(step.diagnostics) && step.diagnostics.length === 0, `${String(step.name)} left diagnostics`);
    }
    const output = await callTool("get_output", { run_id: runId });
    assert(output.eof === true && typeof output.text === "string", "hk MCP did not return complete run output");
    const diff = await callTool("get_diff", { run_id: runId });
    assert(diff.eof === true && typeof diff.text === "string", "hk MCP did not return a complete diff");

    const cancellable = await callTool("start_safe_fix", {});
    const cancellableId = String(cancellable.id);
    activeRunIds.add(cancellableId);
    await waitForRunning(cancellableId);
    const cancelled = await callTool("cancel_run", { run_id: cancellableId });
    assert(cancelled.id === cancellableId, "hk MCP cancelled the wrong run");
    const cancelledRun = await waitForRun(cancellableId);
    activeRunIds.delete(cancellableId);
    assert(cancelledRun.status === "cancelled", `hk MCP cancelled run ended as ${String(cancelledRun.status)}`);
  } catch (error) {
    testError = error;
    for (const runId of activeRunIds) {
      try {
        await callTool("cancel_run", { run_id: runId });
        const run = await waitForRun(runId);
        assert(run.status === "cancelled", `hk MCP cleanup left ${runId} as ${String(run.status)}`);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    activeRunIds.clear();
  }

  let status: Deno.CommandStatus | undefined;
  try {
    await withTimeout(writer.close(), 2_000, "hk MCP stdin close");
  } catch (error) {
    cleanupErrors.push(error);
  }
  let groupSignalled = false;
  if (testError !== undefined && cleanupErrors.length > 0) {
    try {
      groupSignalled = await signalProcessGroup("TERM");
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    status = await withTimeout(statusPromise, 2_000, "hk MCP graceful shutdown");
  } catch {
    try {
      groupSignalled = await signalProcessGroup("TERM") || groupSignalled;
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      status = await withTimeout(statusPromise, 2_000, "hk MCP SIGTERM shutdown");
    } catch {
      try {
        groupSignalled = await signalProcessGroup("KILL") || groupSignalled;
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        status = await withTimeout(statusPromise, 2_000, "hk MCP SIGKILL shutdown");
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }
  if (groupSignalled) {
    try {
      await signalProcessGroup("KILL");
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await withTimeout(stdoutPump, 2_000, "hk MCP stdout cleanup");
  } catch (error) {
    cleanupErrors.push(error);
    try {
      await withTimeout(reader.cancel(), 2_000, "hk MCP stdout reader cancel");
    } catch (cancelError) {
      cleanupErrors.push(cancelError);
    }
  }
  let stderr = "";
  try {
    stderr = await withTimeout(stderrPromise, 2_000, "hk MCP stderr cleanup");
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (status === undefined) {
    cleanupErrors.push(new Error("hk MCP process was not reaped"));
  } else if (testError === undefined && !status.success) {
    cleanupErrors.push(new Error(`hk MCP exited with status ${status.code}: ${stderr}`));
  }

  if (testError !== undefined && cleanupErrors.length > 0) {
    throw new AggregateError([testError, ...cleanupErrors], "hk MCP test and cleanup failed");
  }
  if (testError !== undefined) throw testError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "hk MCP cleanup failed");
}

async function generateProject(
  archetype: string,
  destination: string,
  scenario: Scenario,
): Promise<void> {
  const archetect = Deno.env.get("REPOSITORY_TEMPLATE_ARCHETECT") ?? "archetect";
  const answers = [
    `template=${scenario.template}`,
    `project_name=${scenario.projectName ?? scenario.name}`,
    `author=${author}`,
    `license=${scenario.license}`,
  ];
  if (scenario.template === "deno") {
    answers.push(`semantic_release=${scenario.semanticRelease}`);
  }

  const args = ["render", archetype, destination, "--headless"];
  for (const answer of answers) args.push("-a", answer);
  await run(archetect, args, archetype);
}

async function verifyScenario(root: string, scenario: Scenario): Promise<void> {
  const project = `${root}/${scenario.name}`;
  const license = await Deno.readTextFile(`${project}/LICENSE`);
  assert(
    license.startsWith(scenario.license === "MIT" ? "MIT License" : "Apache License"),
    `${scenario.name}: generated the wrong license`,
  );
  assert(license.includes(author), `${scenario.name}: LICENSE lacks the explicit author`);
  assert(!containsAtlTag(license), `${scenario.name}: LICENSE contains ATL tags`);

  const readme = await Deno.readTextFile(`${project}/README.md`);
  assert(readme.startsWith(`# ${scenario.name}\n`), `${scenario.name}: README has the wrong project name`);
  assert(
    readme.includes("without staging the changed files"),
    `${scenario.name}: README lacks the non-staging fix contract`,
  );

  const agentGuidance = await Deno.readTextFile(`${project}/AGENTS.md`);
  for (
    const expected of [
      "start_safe_fix",
      "call `mise run fix` directly",
      "continue without reading the diff",
      "only when autofix fails",
      "`mise run test` once as the final verification",
    ]
  ) {
    assert(agentGuidance.includes(expected), `${scenario.name}: AGENTS.md lacks ${expected}`);
  }

  const releaseFiles = [
    ".github/workflows/release.yml",
    ".releaserc.json",
    "scripts/set_version.ts",
  ];
  for (const file of releaseFiles) {
    assert(
      await exists(`${project}/${file}`) === scenario.semanticRelease,
      `${scenario.name}: unexpected release file state for ${file}`,
    );
  }

  const ci = await Deno.readTextFile(`${project}/.github/workflows/ci.yml`);
  assert(!containsAtlTag(ci), `${scenario.name}: CI workflow contains ATL tags`);
  assert(ci.includes("${{ github.workflow }}"), `${scenario.name}: CI lost a GitHub expression`);
  assert(!ci.includes("id-token: write"), `${scenario.name}: CI has release permissions`);

  const miseConfig = await Deno.readTextFile(`${project}/mise.toml`);
  assert(
    miseConfig.includes("[tasks.prepare]") === scenario.semanticRelease,
    `${scenario.name}: unexpected prepare task state`,
  );
  assert(
    !containsAtlTag(miseConfig),
    `${scenario.name}: mise.toml contains ATL tags`,
  );
  assert(miseConfig.includes("hk check --safe"), `${scenario.name}: check is not safe`);
  assert(miseConfig.includes('hk check --safe -- "$@"'), `${scenario.name}: check does not protect path arguments`);
  assert(
    miseConfig.includes('hk fix --safe --no-stage -- "$@"'),
    `${scenario.name}: fix is not safe and non-staging`,
  );

  if (scenario.template === "deno") {
    const manifest = await Deno.readTextFile(`${project}/deno.jsonc`);
    assert(
      manifest.includes(`"name": "@atty303/${scenario.name}"`) &&
        manifest.includes(`"license": "${scenario.license}"`),
      `${scenario.name}: deno.jsonc has the wrong name or license`,
    );
    assert(
      (readme.includes("Before the first release, create") &&
        readme.includes("package settings")) === scenario.semanticRelease,
      `${scenario.name}: README has the wrong release setup state`,
    );
  }

  if (scenario.semanticRelease) {
    const releaseWorkflow = await Deno.readTextFile(
      `${project}/.github/workflows/release.yml`,
    );
    assert(
      !containsAtlTag(releaseWorkflow),
      `${scenario.name}: release workflow contains ATL tags`,
    );
    for (
      const expected of [
        "id-token: write",
        "semantic_version: 25.0.9",
        "@semantic-release/commit-analyzer@13.0.1",
        "@semantic-release/release-notes-generator@14.1.1",
        "@semantic-release/exec@7.1.0",
        "@semantic-release/git@11.0.1",
        "@semantic-release/github@12.0.9",
      ]
    ) {
      assert(releaseWorkflow.includes(expected), `${scenario.name}: release workflow lacks ${expected}`);
    }

    const releaseConfig = JSON.parse(
      await Deno.readTextFile(`${project}/.releaserc.json`),
    );
    assert(releaseConfig.branches?.[0] === "main", `${scenario.name}: release branch is not main`);
    const execPlugin = releaseConfig.plugins?.find((plugin: unknown) =>
      Array.isArray(plugin) && plugin[0] === "@semantic-release/exec"
    );
    assert(
      execPlugin?.[1]?.prepareCmd === "mise run prepare --version=${nextRelease.version}" &&
        execPlugin?.[1]?.publishCmd === "mise run publish",
      `${scenario.name}: semantic-release commands are invalid`,
    );
  }

  await run("git", ["init", "--initial-branch=main"], project);

  const mise = Deno.env.get("REPOSITORY_TEMPLATE_MISE") ?? "mise";
  await run(mise, ["trust", "--yes", `${project}/mise.toml`], project);
  await run(mise, ["install", "--yes"], project);
  await verifyCodexConfig(mise, project);
  await verifyFixPlan(mise, project, templateEffects[scenario.template]);
  if (scenario.semanticRelease) {
    const manifestPath = `${project}/deno.jsonc`;
    const manifest = await Deno.readTextFile(manifestPath);
    await Deno.writeTextFile(
      manifestPath,
      `// This comment must survive release preparation.\n${manifest.replace(/\n}\s*$/, ",\n}\n")}`,
    );
    await run(mise, ["run", "prepare", "--version=1.2.3"], project);
    const prepared = await Deno.readTextFile(manifestPath);
    assert(prepared.startsWith("// This comment"), `${scenario.name}: prepare removed a JSONC comment`);
    assert(prepared.includes('"version": "1.2.3"'), `${scenario.name}: prepare did not update version`);
    assert(prepared.endsWith(",\n}\n"), `${scenario.name}: prepare removed the trailing comma`);
    await Deno.writeTextFile(manifestPath, manifest);
    await run(mise, ["run", "prepare", "--version=1.2.3"], project);
  }
  await run(mise, ["run", "test"], project);
  if (scenario.name === "deno-mit") await verifyHkMcp(mise, project);
}

async function verifyDenoNamePreserved(archetype: string, destination: string): Promise<void> {
  const scenario: Scenario = {
    name: "a-",
    template: "deno",
    license: "MIT",
    semanticRelease: false,
  };
  await generateProject(archetype, destination, scenario);
  const manifest = await Deno.readTextFile(`${destination}/${scenario.name}/deno.jsonc`);
  assert(
    manifest.includes('"name": "@atty303/a-"'),
    "Deno project_name was changed after validation",
  );
}

if (import.meta.main) {
  const archetype = await Deno.realPath(new URL("../", import.meta.url));
  const destination = await Deno.makeTempDir({ prefix: "repository-template-" });
  try {
    const mise = Deno.env.get("REPOSITORY_TEMPLATE_MISE") ?? "mise";
    await verifyCodexConfig(mise, archetype);
    await verifyFixPlan(mise, archetype, rootEffects);
    for (const scenario of scenarios) {
      await generateProject(archetype, destination, scenario);
      await verifyScenario(destination, scenario);
    }
    await verifyDenoNamePreserved(archetype, destination);
  } finally {
    await Deno.remove(destination, { recursive: true });
  }
}

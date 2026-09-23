type License = "MIT" | "Apache-2.0";
type Template = "base" | "deno";

interface Scenario {
  browserAutomation: boolean;
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
    browserAutomation: false,
  },
  { name: "base-apache", template: "base", license: "Apache-2.0", semanticRelease: false, browserAutomation: false },
  { name: "deno-mit", template: "deno", license: "MIT", semanticRelease: false, browserAutomation: false },
  {
    name: "deno-apache-release",
    template: "deno",
    license: "Apache-2.0",
    semanticRelease: true,
    browserAutomation: false,
  },
  { name: "base-browser", template: "base", license: "MIT", semanticRelease: false, browserAutomation: true },
  { name: "deno-browser-release", template: "deno", license: "MIT", semanticRelease: true, browserAutomation: true },
];

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
  if (scenario.browserAutomation) answers.push("browser_automation=true");

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
  assert(!(await exists(`${project}/mise.lock`)), `${scenario.name}: render included mise.lock`);
  const agents = await Deno.readTextFile(`${project}/AGENTS.md`);
  const gitignore = await Deno.readTextFile(`${project}/.gitignore`);
  const browserTasksPath = `${project}/.config/mise/tasks/browser.toml`;
  const cliSpecifierPath = `${project}/.config/mise/tasks/browser/playwright-cli.txt`;
  assert(
    (await exists(browserTasksPath)) === scenario.browserAutomation &&
      (await exists(cliSpecifierPath)) === scenario.browserAutomation &&
      (await exists(`${project}/.playwright/cli.config.json`)) === scenario.browserAutomation &&
      agents.includes("mise run browser:cli -- open <url>") === scenario.browserAutomation &&
      agents.includes("repository-template scenario guide") === scenario.browserAutomation &&
      gitignore.includes(".playwright-cli/"),
    `${scenario.name}: browser opt-in files or guidance are incorrect`,
  );
  if (scenario.browserAutomation) {
    const browserTasks = await Deno.readTextFile(browserTasksPath);
    assert(
      browserTasks.includes('["browser:cli"]') &&
        browserTasks.includes('["browser:install"]') &&
        browserTasks.match(/tools\.deno = "2\.9\.5"/g)?.length === 2 &&
        browserTasks.match(/playwright-cli\.txt/g)?.length === 2 &&
        (await Deno.readTextFile(cliSpecifierPath)).trim() === "npm:@playwright/cli@0.1.21",
      `${scenario.name}: browser tasks lack pinned Deno or CLI`,
    );
  }
  if (scenario.template === "base") {
    assert(
      !miseConfig.includes('deno = "2.9.5"') &&
        !(await exists(`${project}/deno.json`)) && !(await exists(`${project}/deno.jsonc`)),
      `${scenario.name}: base Deno manifest or tool state is incorrect`,
    );
  }
  assert(
    miseConfig.includes("[tasks.prepare]") === scenario.semanticRelease,
    `${scenario.name}: unexpected prepare task state`,
  );
  assert(
    !containsAtlTag(miseConfig),
    `${scenario.name}: mise.toml contains ATL tags`,
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
  await run(mise, ["lock"], project);
  const miseLock = await Deno.readTextFile(`${project}/mise.lock`);
  assert(
    miseLock.includes("[[tools.deno]]") === (scenario.template === "deno" || scenario.browserAutomation),
    `${scenario.name}: Deno lock state is incorrect`,
  );
  await run(mise, ["install", "--yes"], project);
  if (scenario.browserAutomation) {
    await run(mise, ["run", "browser:cli", "--", "--help"], project);
    assert(!(await exists(`${project}/deno.lock`)), `${scenario.name}: CLI wrote deno.lock`);
  }
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
}

async function verifyDenoNamePreserved(archetype: string, destination: string): Promise<void> {
  const scenario: Scenario = {
    name: "a-",
    template: "deno",
    license: "MIT",
    semanticRelease: false,
    browserAutomation: false,
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
    for (const scenario of scenarios) {
      await generateProject(archetype, destination, scenario);
      await verifyScenario(destination, scenario);
    }
    await verifyDenoNamePreserved(archetype, destination);
  } finally {
    await Deno.remove(destination, { recursive: true });
  }
}

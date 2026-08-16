type Template = "base" | "deno";
type License = "MIT" | "Apache-2.0";

interface GenerateOptions {
  destination: string;
  license: License;
  name: string;
  semanticRelease: boolean;
  template: Template;
}

const usage = `Usage:
  mise run generate -- --name NAME --template base|deno \\
    --license MIT|Apache-2.0 --destination PATH [--semantic-release]`;

function fail(message: string): never {
  throw new Error(`${message}\n\n${usage}`);
}

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    fail(`${flag} requires a value`);
  }
  return value;
}

export function parseArgs(args: string[]): GenerateOptions {
  let destination: string | undefined;
  let license: License | undefined;
  let name: string | undefined;
  let semanticRelease = false;
  let template: Template | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--destination":
        destination = takeValue(args, index, argument);
        index += 1;
        break;
      case "--license": {
        const value = takeValue(args, index, argument);
        if (value !== "MIT" && value !== "Apache-2.0") {
          fail(`unsupported license: ${value}`);
        }
        license = value;
        index += 1;
        break;
      }
      case "--name":
        name = takeValue(args, index, argument);
        index += 1;
        break;
      case "--semantic-release":
        semanticRelease = true;
        break;
      case "--template": {
        const value = takeValue(args, index, argument);
        if (value !== "base" && value !== "deno") {
          fail(`unsupported template: ${value}`);
        }
        template = value;
        index += 1;
        break;
      }
      case "--help":
        console.log(usage);
        Deno.exit(0);
        break;
      default:
        fail(`unknown argument: ${argument}`);
    }
  }

  if (name === undefined || name.length === 0) fail("--name is required");
  if (template === undefined) fail("--template is required");
  if (license === undefined) fail("--license is required");
  if (destination === undefined || destination.length === 0) {
    fail("--destination is required");
  }
  if (template === "base" && semanticRelease) {
    fail("--semantic-release is only valid with --template deno");
  }
  if (
    template === "deno" &&
    !/^[a-z0-9][a-z0-9-]{1,57}$/.test(name)
  ) {
    fail("Deno project names must be 2-58 lowercase letters, numbers, or hyphens and cannot start with a hyphen");
  }

  return { destination, license, name, semanticRelease, template };
}

export async function generateProject(options: GenerateOptions): Promise<void> {
  const root = await Deno.realPath(new URL("../", import.meta.url));
  await Deno.mkdir(options.destination, { recursive: true });
  const commandArgs = [
    "generate",
    "--path",
    root,
    "--name",
    options.name,
    "--destination",
    options.destination,
    "--vcs",
    "git",
    "--silent",
    "--define",
    `license=${options.license}`,
  ];
  if (options.template === "deno") {
    commandArgs.push(
      "--define",
      `semantic_release=${options.semanticRelease}`,
    );
  }
  commandArgs.push(options.template);

  const status = await new Deno.Command("cargo-generate", {
    args: commandArgs,
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;
  if (!status.success) {
    throw new Error(`cargo-generate exited with status ${status.code}`);
  }
}

if (import.meta.main) {
  await generateProject(parseArgs(Deno.args));
}

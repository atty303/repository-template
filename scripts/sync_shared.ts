const targets = ["base", "deno"] as const;
export const sharedFiles = [
  ".codex/config.toml",
  ".devcontainer/devcontainer.json",
  ".editorconfig",
  ".github/workflows/ci.yml",
  ".gitignore",
  "AGENTS.md",
  "LICENSE",
] as const;

interface Difference {
  path: string;
  reason: "missing" | "different";
}

const defaultRoot = new URL("../", import.meta.url);
const encoder = new TextEncoder();

async function read(path: URL): Promise<Uint8Array | undefined> {
  try {
    return await Deno.readFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

export async function findDifferences(root = defaultRoot): Promise<Difference[]> {
  const differences: Difference[] = [];
  for (const target of targets) {
    for (const file of sharedFiles) {
      const source = await Deno.readFile(new URL(`shared/${file}`, root));
      const destination = await read(new URL(`${target}/${file}`, root));
      if (destination === undefined) {
        differences.push({ path: `${target}/${file}`, reason: "missing" });
      } else if (!equal(source, destination)) {
        differences.push({ path: `${target}/${file}`, reason: "different" });
      }
    }
  }
  return differences;
}

export async function sync(root = defaultRoot): Promise<void> {
  for (const target of targets) {
    for (const file of sharedFiles) {
      const source = new URL(`shared/${file}`, root);
      const destination = new URL(`${target}/${file}`, root);
      await Deno.mkdir(new URL("./", destination), { recursive: true });
      await Deno.writeFile(destination, await Deno.readFile(source));
    }
  }
}

if (import.meta.main) {
  const mode = Deno.args[0];
  if (mode === "sync") {
    await sync();
  } else if (mode === "check") {
    const differences = await findDifferences();
    if (differences.length > 0) {
      await Deno.stderr.write(encoder.encode(
        `${differences.map(({ path, reason }) => `${path}: ${reason}`).join("\n")}\n` +
          "Run `mise run sync` to update generated template files.\n",
      ));
      Deno.exit(1);
    }
  } else {
    throw new Error("expected `sync` or `check`");
  }
}

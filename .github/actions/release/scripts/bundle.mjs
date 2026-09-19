import { constants } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const temporary = await mkdtemp(join(tmpdir(), "repository-template-release-action-"));
try {
  const compiled = join(temporary, "compiled");
  const bundled = join(temporary, "index.js");
  await run("tsc", ["--project", "tsconfig.build.json", "--outDir", compiled]);
  await run("rollup", ["--config"], {
    RELEASE_ACTION_COMPILED_ENTRY: join(compiled, "src", "index.js"),
    RELEASE_ACTION_BUNDLE_OUTPUT: bundled,
  });
  if (process.argv.includes("--check")) {
    await access("dist/index.js", constants.R_OK);
    const [expected, actual] = await Promise.all([readFile("dist/index.js"), readFile(bundled)]);
    if (!expected.equals(actual)) throw new Error("dist/index.js is stale; run npm run fix.");
  } else {
    await mkdir("dist", { recursive: true });
    await copyFile(bundled, "dist/index.js");
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}

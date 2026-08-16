import { parseArgs } from "./generate.ts";

Deno.test("root exposes the documented interactive generation task", async () => {
  const miseConfig = await Deno.readTextFile("mise.toml");
  if (!miseConfig.includes('[tasks."generate:interactive"]')) {
    throw new Error("mise.toml does not expose generate:interactive");
  }

  const readme = await Deno.readTextFile("README.md");
  if (!readme.includes("mise run generate:interactive")) {
    throw new Error("README does not document generate:interactive");
  }
});

Deno.test("parseArgs accepts the non-interactive Deno release interface", () => {
  const options = parseArgs([
    "--name",
    "example",
    "--template",
    "deno",
    "--license",
    "Apache-2.0",
    "--destination",
    "/tmp/output",
    "--semantic-release",
  ]);
  if (
    options.name !== "example" || options.template !== "deno" ||
    options.license !== "Apache-2.0" || options.destination !== "/tmp/output" ||
    !options.semanticRelease
  ) {
    throw new Error(`unexpected options: ${JSON.stringify(options)}`);
  }
});

Deno.test("parseArgs rejects semantic-release for the base template", () => {
  try {
    parseArgs([
      "--name",
      "example",
      "--template",
      "base",
      "--license",
      "MIT",
      "--destination",
      "/tmp/output",
      "--semantic-release",
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("only valid")) return;
    throw error;
  }
  throw new Error("base template accepted --semantic-release");
});

Deno.test("parseArgs enforces JSR package-name boundaries for Deno", () => {
  const parseName = (name: string) =>
    parseArgs([
      "--name",
      name,
      "--template",
      "deno",
      "--license",
      "MIT",
      "--destination",
      "/tmp/output",
    ]);

  if (parseName("ab").name !== "ab" || parseName("a".repeat(58)).name.length !== 58) {
    throw new Error("valid JSR package-name boundary was rejected");
  }
  for (const invalid of ["a", "a".repeat(59), "Uppercase", "has_underscore", "-leading"]) {
    try {
      parseName(invalid);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Deno project names")) continue;
      throw error;
    }
    throw new Error(`invalid JSR package name was accepted: ${invalid}`);
  }
});

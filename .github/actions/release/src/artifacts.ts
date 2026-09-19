import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ReleaseError } from "./errors.ts";

export async function resetArtifactDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}

export async function validateArtifacts(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length === 0) throw new ReleaseError("artifact_invalid", "release:build produced no artifacts.");
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new ReleaseError("artifact_invalid", `Artifact ${entry.name} is not a direct regular file.`);
    }
    if (entry.name === "SHA256SUMS" || entry.name.includes("\n") || entry.name.includes("\r")) {
      throw new ReleaseError("artifact_invalid", `Artifact name ${JSON.stringify(entry.name)} is reserved or unsafe.`);
    }
    names.push(entry.name);
  }
  names.sort();
  const sums: string[] = [];
  for (const name of names) {
    const digest = createHash("sha256").update(await readFile(join(directory, name))).digest("hex");
    sums.push(`${digest}  ${name}`);
  }
  await writeFile(join(directory, "SHA256SUMS"), `${sums.join("\n")}\n`, { encoding: "utf8", flag: "wx" });
  return [...names, "SHA256SUMS"];
}

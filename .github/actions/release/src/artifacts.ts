import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { ReleaseError } from "./errors.ts";

export interface LocalArtifact {
  name: string;
  size: number;
  digest: string;
}

export interface PublishedArtifact {
  name: string;
  size: number;
  digest: string | null;
  state: string;
}

export async function resetArtifactDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}

export async function validateArtifacts(directory: string): Promise<LocalArtifact[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length === 0) throw new ReleaseError("artifact_invalid", "release:build produced no artifacts.");
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new ReleaseError("artifact_invalid", `Artifact ${entry.name} is not a direct regular file.`);
    }
    if (entry.name.includes("\n") || entry.name.includes("\r")) {
      throw new ReleaseError("artifact_invalid", `Artifact name ${JSON.stringify(entry.name)} is unsafe.`);
    }
    names.push(entry.name);
  }
  names.sort();
  const artifacts: LocalArtifact[] = [];
  for (const name of names) {
    const contents = await readFile(join(directory, name));
    artifacts.push({
      name,
      size: contents.byteLength,
      digest: `sha256:${createHash("sha256").update(contents).digest("hex")}`,
    });
  }
  return artifacts;
}

export function verifyPublishedArtifacts(local: LocalArtifact[], published: PublishedArtifact[]): void {
  const remoteByName = new Map<string, PublishedArtifact>();
  for (const artifact of published) {
    if (remoteByName.has(artifact.name)) {
      throw new ReleaseError(
        "artifact_verification_failed",
        `GitHub Release contains duplicate asset ${JSON.stringify(artifact.name)}.`,
      );
    }
    remoteByName.set(artifact.name, artifact);
  }

  const expectedNames = new Set(local.map(({ name }) => name));
  const unexpected = [...remoteByName.keys()].filter((name) => !expectedNames.has(name)).sort();
  if (unexpected.length > 0) {
    throw new ReleaseError(
      "artifact_verification_failed",
      `GitHub Release contains unexpected assets: ${unexpected.join(", ")}.`,
    );
  }

  for (const expected of local) {
    const actual = remoteByName.get(expected.name);
    if (!actual) {
      throw new ReleaseError(
        "artifact_verification_failed",
        `GitHub Release is missing asset ${JSON.stringify(expected.name)}.`,
      );
    }
    if (actual.state !== "uploaded") {
      throw new ReleaseError(
        "artifact_verification_failed",
        `GitHub Release asset ${JSON.stringify(expected.name)} is in state ${JSON.stringify(actual.state)}.`,
      );
    }
    if (actual.size !== expected.size) {
      throw new ReleaseError(
        "artifact_verification_failed",
        `GitHub Release asset ${JSON.stringify(expected.name)} has size ${actual.size}; expected ${expected.size}.`,
      );
    }
    if (actual.digest?.toLowerCase() !== expected.digest) {
      throw new ReleaseError(
        "artifact_verification_failed",
        `GitHub Release asset ${JSON.stringify(expected.name)} has digest ${
          actual.digest ?? "<missing>"
        }; expected ${expected.digest}.`,
      );
    }
  }
}

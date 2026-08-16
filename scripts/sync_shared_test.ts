import { findDifferences, sharedFiles, sync } from "./sync_shared.ts";

Deno.test("sync detects and repairs template drift", async () => {
  const directory = await Deno.makeTempDir({ prefix: "sync-shared-" });
  const root = new URL(`file://${directory}/`);
  try {
    for (const file of sharedFiles) {
      const source = new URL(`shared/${file}`, root);
      await Deno.mkdir(new URL("./", source), { recursive: true });
      await Deno.writeTextFile(source, `${file}\n`);
    }

    await sync(root);
    if ((await findDifferences(root)).length !== 0) {
      throw new Error("freshly synchronized templates differ");
    }

    await Deno.writeTextFile(new URL("base/LICENSE", root), "drift\n");
    const differences = await findDifferences(root);
    if (
      differences.length !== 1 ||
      differences[0].path !== "base/LICENSE" ||
      differences[0].reason !== "different"
    ) {
      throw new Error(`unexpected drift report: ${JSON.stringify(differences)}`);
    }

    await sync(root);
    if ((await findDifferences(root)).length !== 0) {
      throw new Error("sync did not repair template drift");
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

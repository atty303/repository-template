const version = Deno.args[0];
if (version === undefined || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("expected a semantic version argument");
}

const path = "deno.jsonc";
const source = await Deno.readTextFile(path);
const versionField = /^(\s*"version"\s*:\s*)"[^"\r\n]*"/gm;
const matches = [...source.matchAll(versionField)];
if (matches.length !== 1) {
  throw new Error(`expected exactly one string version field in ${path}`);
}
await Deno.writeTextFile(path, source.replace(versionField, `$1"${version}"`));

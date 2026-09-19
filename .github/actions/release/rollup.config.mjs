import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { resolve } from "node:path";

const packageMetadata = new Map([
  ["semantic-release/index.js", [[
    'const pkg = require("./package.json");',
    'const pkg = {name: "semantic-release", version: "25.0.9"};',
  ]]],
  ["semantic-release/lib/get-config.js", [
    ['import { cosmiconfig } from "cosmiconfig";', ""],
    [
      "const { config, filepath } = (await cosmiconfig(CONFIG_NAME).search(cwd)) || {};",
      "const { config, filepath } = {config: {}, filepath: undefined};",
    ],
  ]],
  ["@semantic-release/github/lib/octokit.js", [[
    'const pkg = require("../package.json");',
    'const pkg = {version: "12.0.9"};',
  ]]],
  ["@semantic-release/github/lib/definitions/errors.js", [[
    'const pkg = require("../../package.json");\nconst HOMEPAGE = pkg.homepage;',
    'const HOMEPAGE = "https://github.com/semantic-release/github";',
  ]]],
]);

function inlinePackageMetadata() {
  const replaced = new Set();
  return {
    name: "inline-package-metadata",
    transform(code, id) {
      for (const [suffix, replacements] of packageMetadata) {
        if (id.endsWith(suffix)) {
          for (const [from, to] of replacements) {
            if (!code.includes(from)) throw new Error(`Expected bundled source changed in ${suffix}`);
            code = code.replace(from, to);
          }
          replaced.add(suffix);
          return { code, map: null };
        }
      }
      return null;
    },
    buildEnd() {
      const missing = [...packageMetadata.keys()].filter((name) => !replaced.has(name));
      if (missing.length > 0) throw new Error(`Package metadata transforms did not run: ${missing.join(", ")}`);
    },
  };
}

export default {
  input: process.env.RELEASE_ACTION_COMPILED_ENTRY ?? ".build/src/index.js",
  output: {
    file: process.env.RELEASE_ACTION_BUNDLE_OUTPUT ?? "dist/index.js",
    format: "esm",
    inlineDynamicImports: true,
    sourcemap: false,
  },
  plugins: [
    inlinePackageMetadata(),
    nodeResolve({ exportConditions: ["node"], modulePaths: [resolve("node_modules")], preferBuiltins: true }),
    commonjs(),
    json(),
  ],
};

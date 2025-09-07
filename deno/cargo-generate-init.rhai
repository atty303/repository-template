import "cargo-generate-mod" as mod;

mod::copy_files("copy-shared-files", "../shared", [
  ".devcontainer/devcontainer.json",
  ".editorconfig",
  ".gitignore",
  ".mise.lock",
  "hk.pkl",
  "LICENSE"
]);

import "cargo-generate-mod" as mod;

mod::copy_files("copy-shared-files", "../bare", [
  ".editorconfig",
]);

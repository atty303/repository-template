# Browser automation in generated repositories

Select `browser_automation=true` when rendering either `base` or `deno`. The
generated repository pins Deno with mise and runs `@playwright/cli@0.1.21`
through Deno's Node compatibility. Node.js and Playwright MCP are not needed.
Generation itself still only needs Archetect and Git.

After generating `mise.lock` as described in the template README and completing
the generated repository's setup, agents can run:

```sh
mise run browser:cli -- --help
mise run browser:cli -- open about:blank
mise run browser:cli -- snapshot
mise run browser:cli -- close
```

Each command first runs the CLI directly. If it reports a missing browser,
`browser:install` installs the configured browser and the command is retried
once. Other errors are returned without a retry. Installing an existing revision
does not download it again. To install explicitly, run
`mise run browser:install`. The task file `.config/mise/tasks/browser.toml`
declares its Deno version, which mise installs on first use. The generated
repository creates its own `mise.lock` with `mise lock`; this includes the
task-specific Deno version. Browser installation is always separate from mise's
tool installation. Playwright stores browser binaries in its default OS cache
(`~/.cache/ms-playwright` on Linux and `~/Library/Caches/ms-playwright` on
macOS). Repositories using the same browser revision share that binary.
Playwright may remove revisions no longer used by an installed version; a later
use can then download them again. CLI sessions and browser login state remain
separate from scenario tests.

The CLI runs with `deno run --no-config` and does not read the repository's
`deno.json` or change its `deno.lock`. Browser commands may write CLI session
state under `.playwright-cli`; keep application credentials out of committed
files.

The install task selects `chromium --only-shell`; its launch settings are in
`.playwright/cli.config.json`. Add another browser to that task and its CLI
configuration if the repository later needs one.

## Add a TypeScript scenario later

The generated repository has no browser scenario or scenario dependency. When
one is needed, use the Playwright version from the pinned CLI package. For
`@playwright/cli@0.1.21`, that is `playwright@1.64.0-alpha-1789764292000`.
Update `.config/mise/tasks/browser/playwright-cli.txt`, then check the CLI
package's `dependencies.playwright` whenever updating the CLI and change the
test dependency at the same time. The versions are kept aligned by this
procedure, without an automatic drift check.

For a `base` repository, create `deno.json`:

```json
{
  "imports": {
    "playwright": "npm:playwright@1.64.0-alpha-1789764292000"
  }
}
```

For a `deno` repository, add the same `imports` entry to its existing
`deno.jsonc`, preserving the package metadata. In either variant, add
`browser/example.test.ts` using the application URL or local fixture that the
repository owns:

```ts
import { chromium } from "playwright";

Deno.test("example page", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:3000/");
    await page.getByRole("heading", { name: "Example" }).waitFor();
  } finally {
    await browser.close();
  }
});
```

Start the application or fixture within the repository's test task, then run the
scenario with `deno test -A browser/*.test.ts`. The repo must own server
startup, readiness, and cleanup; the example URL and heading are placeholders.
`Deno.test` creates its own browser context and does not reuse a CLI session.

For `base`, add this run block to its existing `[tasks.test]` in `mise.toml`:

```toml
tools.deno = "2.9.5"
run = '''
#!/usr/bin/env bash
set -euo pipefail
mise run browser:install
deno test -A browser/*.test.ts
'''
```

For `deno`, replace the existing `deno test` line in `[tasks.test]` with
`mise run browser:install` followed by `deno test -A`. This runs the existing
unit tests and the new browser scenario once, before the current JSR dry run.
The install task checks the required browser revision on each test run and
downloads only when missing. Refresh `deno.lock` with `deno install`, commit it
with `deno.json` or `deno.jsonc`, then run `mise run check` and `mise run test`.
The existing Linux CI invokes `mise run test`, so the scenario joins CI through
that task without a separate workflow step. Do not add a cache action for
browser binaries.

To verify a fresh installation without changing your normal browser cache, set
`PLAYWRIGHT_BROWSERS_PATH` to an empty temporary directory and run
`mise run browser:cli -- open about:blank` with a time limit. Close the session
and rerun `mise run browser:install`; the second command should complete without
a download. Restore the default cache path afterward so other repositories can
share the installed revision.

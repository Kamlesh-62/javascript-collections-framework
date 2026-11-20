# Security policy

## Supported versions

Until `1.0.0`, only the latest published version receives fixes.

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting: on the repository, open
**Security → Report a vulnerability**. Do not open a public issue. Reports are acknowledged within
7 days.

In scope, for example: prototype pollution, algorithmic-complexity (hash-flooding) denial of
service, stack exhaustion from crafted input, unsafe deserialization in `from`/`fromJSON`,
anything in the published package that reaches the network, the file system or global state.

## How the package is built and published

- **Zero runtime dependencies.** The published package contains only its own code.
- **No install scripts** in the published package.
- Development dependencies are admitted only when widely used and maintained; installs refuse
  versions younger than three days and unapproved install scripts.
- CI actions are pinned to full commit SHAs with least-privilege permissions.
- The published package contains no source maps and no files beyond the built code, its type
  declarations, `package.json`, the README, the changelog and the license.
- Releases after 0.1.0 are built and published from a CI workflow on `main`, through npm trusted
  publishing (short-lived credentials, no stored token) with provenance. The workflow runs only
  after the maintainer approves it, and stages the version on npm; the version becomes public
  only when the maintainer approves it on npm with two-factor authentication.
- `pnpm size:check` checks every packed file against an allowlist.

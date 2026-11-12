# Security policy

## Supported versions

Until `1.0.0`, only the latest published version receives fixes.

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting (**Security → Report a
vulnerability**), which is enabled when the repository becomes public. Do not open a public
issue. Reports are acknowledged within 7 days.

In scope, for example: prototype pollution, algorithmic-complexity (hash-flooding) denial of
service, stack exhaustion from crafted input, unsafe deserialization in `from`/`fromJSON`,
anything in the published package that reaches the network, the file system or global state.

## How the package is built and published

- **Zero runtime dependencies.** The published package contains only its own code.
- **No install scripts** in the published package.
- Development dependencies are admitted only when widely used and maintained; installs refuse
  versions younger than three days and unapproved install scripts.
- CI actions are pinned to full commit SHAs with least-privilege permissions.
- Releases will be published from CI with npm provenance and a manual approval step.

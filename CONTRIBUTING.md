# Contributing

## Setup

Development requires Node.js 22.18 or later (the package itself runs on Node.js 18+) and
pnpm 11. Install pnpm with `npm install -g pnpm@11` (or `corepack enable` on Node.js versions
that still bundle Corepack); the exact version is pinned in `package.json`.

```sh
pnpm install
pnpm check      # typecheck, lint, test, build, ES2015 syntax, package shape, smoke load
```

| Command                     | What it does                                                      |
| --------------------------- | ----------------------------------------------------------------- |
| `pnpm test`                 | run the test suite once                                           |
| `pnpm test:watch`           | run tests on change                                               |
| `pnpm test:coverage`        | run tests with coverage thresholds                                |
| `pnpm typecheck`            | type-check `src/` and `test/`                                     |
| `pnpm lint` / `pnpm format` | check / fix formatting and lint rules (Biome)                     |
| `pnpm build`                | build ESM, CommonJS and type declarations into `dist/`            |
| `pnpm check:package`        | verify the published package shape (publint, are-the-types-wrong) |
| `pnpm changeset`            | record a user-visible change for the changelog                    |

## Compatibility rules for `src/`

The package must run unchanged on ES2015 engines, edge runtimes, React Native and inside framework
proxies. `test/package.test.ts` enforces these on the syntax tree:

- relative imports only; no dependencies; no platform globals (`process`, `window`, `globalThis`, …);
- no `#private` fields (they throw inside Vue/MobX proxies and are lowered to slow WeakMaps) —
  use TypeScript `private`/`protected` and mark internals `@internal`;
- no static blocks, no static field initializers and no generator functions (iterators are
  hand-written classes);
- no object spread or object rest (they compile to large helpers at ES2015);
- no `eval`, `Function`, `import.meta` or triple-slash references;
- named exports only.

`src/` is type-checked against ES2016 runtime APIs (`lib: ["ES2016"]`, the same floor as the oldest supported browsers); newer built-ins need a
fallback. The build lowers syntax to ES2015 and `pnpm check:syntax` proves it.

## Dependencies and security

- Runtime dependencies: none, ever.
- A new development dependency must be widely used, maintained by more than one person, free of
  install scripts and known advisories, and justified in the pull request. Prefer writing a small
  amount of code over adding a package.
- pnpm refuses package versions younger than three days and unapproved install scripts
  (`pnpm-workspace.yaml`). Do not relax these settings to make an install pass.
- GitHub Actions are pinned to full commit SHAs. Dependabot proposes updates weekly.

## Rules for changes

- **Every public export** comes from `src/index.ts`, has TSDoc with an `@example`, and states its
  time complexity.
- **Every public behaviour has a test** in `test/`.
- **Docs change with the code.** A change to public behaviour updates `README.md` and the
  relevant page in `docs/` in the same pull request, and carries a changeset.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(list): add ArrayList.removeIf`.

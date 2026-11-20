# Contributing

## Quick path

From a fork to an open pull request, with the [GitHub CLI](https://cli.github.com/) and pnpm 11:

```sh
gh repo fork Kamlesh-62/javascript-collections-framework --clone
cd javascript-collections-framework && pnpm install
git switch -c fix/short-description
pnpm check
pnpm changeset && gh pr create --fill
```

Make the change between the branch and `pnpm check`, with its tests. `pnpm changeset` records
what a user would notice; for a change users do not see, run `pnpm changeset --empty`. The
sections below give the details.

## Setup

Development requires Node.js 22.18 or later (the package itself runs on Node.js 18+) and
pnpm 11. Install pnpm with `npm install -g pnpm@11` (or `corepack enable` on Node.js versions
that still bundle Corepack); the exact version is pinned in `package.json`.

```sh
pnpm install
pnpm check      # typecheck, lint, test, build, ES2015 syntax, package shape, smoke load
```

| Command                     | What it does                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| `pnpm test`                 | run the test suite once                                                  |
| `pnpm test:watch`           | run tests on change                                                      |
| `pnpm test:coverage`        | run tests with coverage thresholds                                       |
| `pnpm typecheck`            | type-check `src/` and `test/`                                            |
| `pnpm lint` / `pnpm format` | check / fix formatting and lint rules (Biome)                            |
| `pnpm build`                | build ESM, CommonJS, IIFE and type declarations into `dist/`             |
| `pnpm check:package`        | check the package shape (publint) and the types of a packed tarball      |
| `pnpm bench`                | benchmark each collection against native structures (needs `pnpm build`) |
| `pnpm changeset`            | record a user-visible change for the changelog                           |

## Compatibility rules for `src/`

The package must run unchanged on ES2015 engines, edge runtimes, React Native and inside framework
proxies. `test/package.test.ts` enforces these on the syntax tree:

- relative imports only; no dependencies; no platform globals (`process`, `window`, `globalThis`, …);
- no `#private` fields (they throw inside Vue/MobX proxies and are lowered to slow WeakMaps) —
  use TypeScript `private`; a member or type that reaches the published declarations never carries
  `@internal` (the API report fails on the tag), and public classes have no `protected` members;
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

## Branches, commits and pull requests

- **Branch** from an up-to-date `main` as `<type>/<short-description>`, for example
  `feat/array-list` or `fix/tree-map-floor`. Keep branches short-lived and to one topic.
  `main` only changes through pull requests.
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/):

  ```
  <type>(<scope>): <subject>

  <body: what changed and why, wrapped at 72 columns>

  BREAKING CHANGE: <what breaks and how to migrate>   (only for breaking changes, with "!" in the header)
  ```

  | Type       | Use for                                     |
  | ---------- | ------------------------------------------- |
  | `feat`     | new behaviour users can see                 |
  | `fix`      | a bug fix users can see                     |
  | `perf`     | faster, same behaviour                      |
  | `refactor` | internal change, same behaviour             |
  | `docs`     | documentation only                          |
  | `test`     | tests only                                  |
  | `build`    | build setup, dependencies, package metadata |
  | `ci`       | workflows and automation                    |
  | `chore`    | anything else without user impact           |
  | `revert`   | reverting an earlier commit                 |

  The scope is optional, lowercase and kebab-case (`array-list`, `tree-map`, `deps`). The subject
  is imperative ("add", not "added"), starts lowercase, has no trailing period, and the header
  stays within 72 characters.
- **One logical change per commit**, with its tests and docs. Do not mix formatting or
  refactoring with behaviour changes.
- **Pull requests** use the template; the title is a Conventional Commit header because it
  becomes the squash-merge commit on `main`. CI checks the title and that a changeset is present
  (`pnpm changeset --empty` when nothing is released).
- Never rewrite `main` or other shared history; do not bypass hooks.

## Reports of the public surface

Two committed reports record what the package exposes, and `pnpm check` (after `pnpm build`)
compares the build with them:

- `api/javascript-collections-framework.api.d.ts` — the public type surface. A difference fails
  `pnpm api:check` with a diff. When the change is intended, run `pnpm api:update`, commit the
  report, and add a changeset whose bump matches the change (see [versioning](docs/versioning.md)).
- `api/javascript-collections-framework.size.json` — the minified and gzipped bytes of the whole
  package and of each export imported alone. A difference fails `pnpm size:check`; run
  `pnpm size:update` and commit it, so the pull request shows what the change costs.

`pnpm test:copies` checks that two loaded copies of the build recognise each other's values, and
`pnpm test:consumers` type-checks a program using every export with each supported TypeScript
version.

## Code examples in the docs

Every code block tagged `ts` or `js` in `README.md` and `docs/` is type-checked and run by
`pnpm test`. The blocks of a page run in order as one program: a block sees, and may shadow, the
names of the blocks before it, and every export of the package is in scope. Imports from the
package are type-checked and then dropped; any other import needs the marker below. Random
numbers are seeded, so a run is repeatable.

A comment at the end of a top-level statement states its result when it has one of these forms:

| Comment                                      | The statement must                                     |
| -------------------------------------------- | ------------------------------------------------------ |
| `// 3`, `// 'a'`, `// [1, 2]`, `// { a: 1 }` | evaluate to that value (`Object.is`, deep for objects) |
| `// ArrayList(2) [1, 2]`                     | print as that text with `String(value)`                |
| `// RangeError`, `// throws RangeError`      | throw that error class                                 |
| `// compile error; at run time, TypeError`   | fail to type-check, and throw that error when run      |

The stated part ends at the first spaced dash (—), or colon or semicolon followed by a space,
outside quotes and brackets, so `// 3 — the size` states `3`. Any other comment is prose and is
not checked: write the contents of a collection after a call as prose (`// list is [1, 2]`),
never by comparing it with an array.
A result that depends on `shuffle` without an explicit `random` cannot be stated.

A block that cannot run as written (a framework recipe, a signature, a module system other than
the package's) is skipped only with a marker on the line before its fence, which the test output
lists:

```html
<!-- example: not run — a framework recipe, tested in test/frameworks/ -->
```

## Rules for changes

- **Every public export** comes from `src/index.ts`, has TSDoc with an `@example`, and states its
  time complexity.
- **Every public behaviour has a test** in `test/`.
- **Docs change with the code.** A change to public behaviour updates `README.md` and the
  relevant page in `docs/` in the same pull request, and carries a changeset.

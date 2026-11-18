# How this library is tested

This page describes what is tested, how to run each kind of test, how to replay a failure, and
what is not tested. Every count is in the [table below](#counts); the counts are constants in
`test/stress/config.ts`, never derived from elapsed time, and a test checks that the table matches
them.

## Kinds of test

**Shared contract suites.** Each interface (`Collection`, `List`, `SetCollection`,
`MapCollection`, `Queue`, `Deque`, the sequenced and sorted interfaces) has one suite of rules in
`test/contracts/`. Every class and every view that implements the interface runs the same suite,
so a rule holds for all of them or the run fails.

**Reference comparisons.** Seeded random sequences of operations run on a collection and, side by
side, on a plain reference: a native `Array`, `Map` or `Set`, a sorted array for the sorted
collections, an array of stamped entries for the linked collections. Every result, the size and
the contents are compared. Live iterators are compared with native iterators while the
collection changes; fail-fast iterators must throw `ConcurrentModificationError` after a change.

**Scale.** Every collection, `asList` and `newSetFromMap` is filled to a large size, queried,
iterated, partly removed (by `removeIf`, through a cursor and at the ends) and drained, against
the same references. Tree maps and sets are filled in ascending, descending and alternating order,
and every insertion, lookup and removal is checked to stay within 2·⌈log₂(n + 1)⌉ comparisons
(plus one in natural order). Views over large collections (sub-lists, range views, reversed
views, key, entry and value views, unmodifiable views) are created with as many comparisons,
equality calls and element reads as views over small ones. Printing, `JSON.stringify`, `equals`
and `hashCode` run on large collections and on nested ones. Nesting far deeper than the call stack
allows throws the engine's `RangeError`, and afterwards no collection is left marked as in
progress.

**Deep random runs.** The reference comparisons run again for many more seeds and steps, over
every model, collection and option path (default equality, `key`, `equivalence`, an equivalence
with few hashes, views, access order, `maxSize`). Each run grows its collection past a high mark
and shrinks it below a low mark again and again, so tables resize and trees rebalance while
iterators and cursors are held open.

**The built package.** The scale suites and the deep random runs run a second and third time
against the built files, `dist/index.js` (ESM) and `dist/index.cjs` (CommonJS), loaded without a
transform: the code that is published.

**Two loaded copies.** The ESM and CommonJS builds are loaded together in one process, as two
copies of the package, and their collections are mixed: `equals` both ways, `addAll`, the
`copyOf…` factories, collections as map keys and the `is…` guards, at scale. The results must be
those of a single copy.

**Frameworks.** Recipes for React, Vue, Svelte and plain change signals run in `test/frameworks/`
on every change, and against the real framework packages every night.

**Runtimes.** The full suite runs on several Node.js versions and operating systems on every
change, and the built package is loaded on older Node.js, Bun and Deno. See
[compatibility](compatibility.md) for the exact matrix.

## Counts

<!-- counts:start -->
| What                                                                 |        Count |
| -------------------------------------------------------------------- | -----------: |
| Elements in each scale, view and output test                         |    1,000,000 |
| Lookups, end removals and near-end cursor removals per class (scale) |       10,000 |
| Lookups per class where one lookup walks the collection (scale)      |          100 |
| Nesting depth that prints, writes JSON, compares and hashes          |          400 |
| Nesting depth that throws `RangeError`                               |      100,000 |
| Deep random runs (model, collection and options)                     |           44 |
| Seeds × steps per deep random run                                    | 20 × 100,000 |
| Steps between full-contents comparisons (deep runs)                  |        1,000 |
| Iterators and cursors held open at once (deep runs)                  |            8 |
| Seeds × steps per run in the fast subset                             |    2 × 2,000 |
| Elements per collection with both builds loaded                      |      100,000 |
| Nightly stress job timeout                                           |   60 minutes |
<!-- counts:end -->

## Running the tests

```sh
pnpm test             # every suite on the source, including a fast subset of every deep random run
pnpm test:coverage    # the same, with coverage thresholds
pnpm build            # the stress suites need the built package
pnpm test:stress      # scale, deep random runs and two copies, on the source and on both builds
```

The stress suites run as four projects: `src`, `esm`, `cjs` and `copies`. To run one project, one
run, or one seed of one run:

```sh
pnpm test:stress --project src
pnpm test:stress --project esm -t "deep random runs set/hash-set/equivalence "
pnpm test:stress --project src -t "deep random runs set/hash-set/equivalence seed 3:"
```

The run names are listed in `RUNS` in `test/stress/config.ts`.

## Replaying a failure

A failing seeded run names its seed, its step, the operation that diverged and both results. A
failing deep random run also prints the command that replays that seed against the source, with
the hash and bucket seeds fixed from the run's seed, for example:

```text
Replay this seed against the source: pnpm test:stress --project src -t "deep random runs set/hash-set seed 3:"
```

Runs against the built package use the package's own random seeds; their results do not depend on
them. Every seed that has ever found a bug is kept in `test/stress/regressions.ts`, and `pnpm test`
replays each one.

## What is not tested

- **Leaks that only garbage collection would show.** Such checks depend on when the engine
  collects, so they cannot be deterministic.
- **Speed.** No test measures time, and the documentation makes no speed claims; the stated time
  complexities are bounds on work, not timings.
- **Engines and runtimes outside CI.** Browsers, React Native, edge runtimes and the other targeted
  environments in [compatibility](compatibility.md) are checked for syntax and platform APIs, not
  run.
- **Worst cases, workloads and hostile values.** Dedicated suites for the worst-case input of each
  documented bound, realistic workloads and hostile values across every class are not part of
  these runs yet.

## Nightly runs

The stress suites and the framework apps run every night in the
[nightly workflow](../.github/workflows/nightly.yml).

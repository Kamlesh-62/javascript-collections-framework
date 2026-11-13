# Versioning

The package follows [semantic versioning](https://semver.org): within a major version, upgrading
never breaks code that uses the package as documented. This page says what that promise covers.

## What is public

Everything exported from the package entry point, as its documentation describes it:

- the names of exported classes, interfaces, types, functions and constants;
- the signatures of methods and functions: parameters, options objects and return types;
- the errors thrown, by class (`IndexOutOfBoundsError`, `TypeError`, …) and by when they are thrown;
- documented behaviour: results, iteration order where it is documented, whether iteration is live
  or fail-fast, what `toString` and `toJSON` produce;
- documented time complexity (`Time: O(log n)`);
- serialised forms (`toJSON` output and what `from` accepts);
- the runtimes and TypeScript versions in the Tested, Type-checked and Loaded tiers of
  [Compatibility](compatibility.md); best-effort entries may be dropped in a minor version.

Every change to the exported types is recorded: the repository keeps a report of the public type
surface, so each change to it is reviewed and released with a changelog entry saying how it
affects you.

## What is not public

These may change in any release, including a patch:

- **Error message wording.** Messages name the method and the problem, but match errors with
  `instanceof`, not by text.
- **Hash values.** `hashCode` results are seeded per loaded copy and unspecified; never store one
  or depend on its value.
- **Iteration order documented as unspecified** (for example a priority queue's iterator).
- **`revision` values.** Compare `revision` only for "changed or not".
- **Internals.** Anything not exported, `private` members, and property names you can see at run
  time but that are not documented.
- **Performance** within a documented bound, and bundle size.

## What counts as a breaking change

Only a new major version may:

- remove or rename anything public;
- accept less than before (narrow a parameter's type, reject a value that was accepted);
- return more than before (widen a return type, return `undefined` where it never did);
- change documented behaviour, an error class, or a serialised form;
- make a documented time complexity worse;
- drop a supported runtime or TypeScript version.

A minor version may add: new exports, new methods, new optional parameters or options, and
supported environments. A patch version fixes behaviour that did not match the documentation,
improves messages, speeds things up or shrinks the bundle.

## Deprecation

A feature to be removed is first marked `@deprecated` in its documentation, which editors show
with a strikethrough, and its replacement is named. It keeps working for at least one minor
version and is removed only in a major version, listed in that release's changelog.

## Before 1.0

Until `1.0.0`, a minor version (`0.3.0` → `0.4.0`) may contain breaking changes; each one is
still listed in the changelog with what to change. Patch versions (`0.3.1`) do not break. A
`^0.3.0` range stays within `0.3.x`, so it never picks up a breaking minor.

Two copies of the package in one program recognise each other's values (for `instanceof` and the
`is…` guards) when they share a major version. Every `0.x` release counts as the same major
version as `1.x` for this purpose, so values pass between any `0.x` and `1.x` copies, even across a
`0.x` minor that changed the API.

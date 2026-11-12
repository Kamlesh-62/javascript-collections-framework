<!-- Title: a Conventional Commit header, e.g. "feat(array-list): add removeAt". It becomes the
     commit message on main when the pull request is squash-merged. -->

## What and why

<!-- What changes for users of the package, and why. -->

## How it was tested

<!-- Tests added or changed; anything verified by hand. -->

## Checklist

- [ ] `pnpm check` passes locally
- [ ] Tests cover the new or changed behaviour
- [ ] Docs updated (README, `docs/`, TSDoc) where behaviour changed
- [ ] Changeset added (`pnpm changeset`), or an empty one for changes with nothing to release (`pnpm changeset --empty`)
- [ ] Breaking change? Title has `!` and the changeset explains the migration

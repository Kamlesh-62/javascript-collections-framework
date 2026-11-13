// Change tracking: the single path every change to a collection goes through.

/**
 * Counts changes to a collection.
 *
 * `revision` changes on every change to contents (the public value watchers read); `structure`
 * changes only when elements are added or removed (what fail-fast iterators and `removeIf`
 * compare, so replacing a value in place does not invalidate them).
 *
 * @internal
 */
export class ChangeCounter {
  /** Changes on every change to contents. */
  revision = 0
  /** Changes when elements are added or removed. */
  structure = 0

  /** Records a change that replaced an element or value without adding or removing one. */
  replaced(): void {
    this.revision++
  }

  /** Records a change that added or removed elements. */
  structural(): void {
    this.revision++
    this.structure++
  }
}

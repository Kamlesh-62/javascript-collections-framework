// The names read-only collections and their views print with and start their errors with.

/**
 * A tag for each role a read-only collection or view can play.
 *
 * @internal
 */
export interface ReadOnlyTags {
  readonly collection: string
  readonly sequencedCollection: string
  readonly list: string
  readonly subList: string
  readonly reversedList: string
  readonly set: string
  readonly sequencedSet: string
  readonly sortedSet: string
  readonly map: string
  readonly sequencedMap: string
  readonly sortedMap: string
  /** A plain map's key view. */
  readonly keySet: string
  /** A plain map's entry view. */
  readonly entrySet: string
  /** A plain map's value view. */
  readonly values: string
}

/** The tags of immutable collections. @internal */
export const IMMUTABLE_TAGS: ReadOnlyTags = {
  collection: 'ImmutableCollection',
  sequencedCollection: 'ImmutableSequencedCollection',
  list: 'ImmutableList',
  subList: 'ImmutableSubList',
  reversedList: 'ImmutableReversedList',
  set: 'ImmutableSet',
  sequencedSet: 'ImmutableSequencedSet',
  sortedSet: 'ImmutableSortedSet',
  map: 'ImmutableMap',
  sequencedMap: 'ImmutableSequencedMap',
  sortedMap: 'ImmutableSortedMap',
  keySet: 'ImmutableMapKeySet',
  entrySet: 'ImmutableMapEntrySet',
  values: 'ImmutableMapValues',
}

/** The tags of unmodifiable views: each view is named after its family. @internal */
export const UNMODIFIABLE_TAGS: ReadOnlyTags = {
  collection: 'UnmodifiableCollection',
  sequencedCollection: 'UnmodifiableSequencedCollection',
  list: 'UnmodifiableList',
  subList: 'UnmodifiableList',
  reversedList: 'UnmodifiableList',
  set: 'UnmodifiableSet',
  sequencedSet: 'UnmodifiableSequencedSet',
  sortedSet: 'UnmodifiableSortedSet',
  map: 'UnmodifiableMap',
  sequencedMap: 'UnmodifiableSequencedMap',
  sortedMap: 'UnmodifiableSortedMap',
  keySet: 'UnmodifiableSet',
  entrySet: 'UnmodifiableSet',
  values: 'UnmodifiableCollection',
}

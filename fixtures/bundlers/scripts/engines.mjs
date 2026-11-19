// The tree-shaking check's table: which internal engines a bundle of a single import must
// contain, found by their class names searched as substrings of the bundle.

export const ENGINES = ['OrderedTree', 'BucketTable', 'LinkedHashTable', 'BinaryHeapEngine']

/** The engines each single import needs, and no others. */
export const EXPECTED = {
  ArrayList: [],
  TreeMap: ['OrderedTree'],
  PriorityQueue: ['BinaryHeapEngine'],
  HashMap: ['BucketTable'],
  LinkedHashMap: ['LinkedHashTable', 'BucketTable'],
}

/**
 * The engines whose class names appear in `code`, in the order of `ENGINES`.
 * @param {string} code
 * @returns {string[]}
 */
export function enginesIn(code) {
  return ENGINES.filter((name) => code.includes(name))
}

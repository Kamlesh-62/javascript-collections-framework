declare const ARRAY_DEQUE_BRAND: unique symbol;
declare const ARRAY_LIST_BRAND: unique symbol;
declare class ArrayDeque<E> implements Deque<E> {
    private readonly engine;
    constructor(elements?: Iterable<E> | null);
    static from<T>(elements: Iterable<T>): ArrayDeque<T>;
    static from<T, U>(elements: Iterable<T>, mapFn: (element: T, index: number) => U, thisArg?: unknown): ArrayDeque<U>;
    static [Symbol.hasInstance](value: unknown): boolean;
    get [ARRAY_DEQUE_BRAND](): true;
    get [DEQUE_BRAND](): true;
    get [QUEUE_BRAND](): true;
    get [SEQUENCED_COLLECTION_BRAND](): true;
    get [COLLECTION_BRAND](): true;
    get size(): number;
    get revision(): number;
    get [Symbol.toStringTag](): string;
    isEmpty(): boolean;
    add(element: E): this;
    push(element: E): this;
    addLast(element: E): this;
    addFirst(element: E): this;
    addAll(elements: Iterable<E>): boolean;
    poll(): E | undefined;
    pop(): E | undefined;
    removeFirst(): E;
    removeLast(): E;
    peek(): E | undefined;
    peekLast(): E | undefined;
    getFirst(): E;
    getLast(): E;
    has(element: E): boolean;
    delete(element: E): boolean;
    removeAll(elements: Iterable<E>): boolean;
    retainAll(elements: Iterable<E>): boolean;
    removeIf(predicate: (element: E) => unknown): boolean;
    clear(): void;
    toArray(): E[];
    forEach(action: (element: E) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<E>;
    cursor(): Cursor<E>;
    reversed(): Deque<E>;
    copy(): ArrayDeque<E>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): E[];
    [INSPECT](depth: number | null, options: object, inspect: (value: unknown, options: object) => string): string;
}
declare class ArrayList<E> implements List<E> {
    private readonly engine;
    constructor(elements?: Iterable<E> | null);
    static from<T>(elements: Iterable<T>): ArrayList<T>;
    static from<T, U>(elements: Iterable<T>, mapFn: (element: T, index: number) => U, thisArg?: unknown): ArrayList<U>;
    static [Symbol.hasInstance](value: unknown): boolean;
    get [ARRAY_LIST_BRAND](): true;
    get [LIST_BRAND](): true;
    get [SEQUENCED_COLLECTION_BRAND](): true;
    get [COLLECTION_BRAND](): true;
    get size(): number;
    get revision(): number;
    get [Symbol.toStringTag](): string;
    isEmpty(): boolean;
    get(index: number): E;
    getFirst(): E;
    getLast(): E;
    indexOf(element: E): number;
    lastIndexOf(element: E): number;
    has(element: E): boolean;
    toArray(): E[];
    add(element: E): this;
    addFirst(element: E): this;
    addLast(element: E): this;
    insert(index: number, element: E): this;
    insertAll(index: number, elements: Iterable<E>): boolean;
    addAll(elements: Iterable<E>): boolean;
    set(index: number, element: E): E;
    removeAt(index: number): E;
    delete(element: E): boolean;
    removeFirst(): E;
    removeLast(): E;
    removeAll(elements: Iterable<E>): boolean;
    retainAll(elements: Iterable<E>): boolean;
    removeIf(predicate: (element: E, index: number, list: List<E>) => unknown): boolean;
    clear(): void;
    replaceAll(op: (element: E, index: number, list: List<E>) => E): void;
    sort(comparator?: Comparator<E>): this;
    forEach(action: (element: E, index: number, list: List<E>) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<E>;
    cursor(): ListCursor<E>;
    listCursor(index?: number): ListCursor<E>;
    subList(from: number, to: number): List<E>;
    reversed(): List<E>;
    copy(): ArrayList<E>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): E[];
    [INSPECT](depth: number | null, options: object, inspect: (value: unknown, options: object) => string): string;
}
interface BoundOptions {
    inclusive?: boolean | undefined;
}
declare const CLASS_CAST_ERROR_BRAND: unique symbol;
declare const COLLECTION_BRAND: unique symbol;
declare const CONCURRENT_MODIFICATION_ERROR_BRAND: unique symbol;
declare class ClassCastError extends TypeError {
    constructor(message?: string);
    get [CLASS_CAST_ERROR_BRAND](): true;
    static [Symbol.hasInstance](value: unknown): boolean;
}
interface Collection<E> extends ReadonlyCollection<E> {
    add(element: E): this;
    delete(element: E): boolean;
    addAll(elements: Iterable<E>): boolean;
    removeAll(elements: Iterable<E>): boolean;
    retainAll(elements: Iterable<E>): boolean;
    removeIf(predicate: (element: E) => unknown): boolean;
    clear(): void;
}
interface Comparable<T> {
    [compareSymbol](other: T): number;
}
type Comparator<T> = (a: T, b: T) => number;
declare class ConcurrentModificationError extends Error {
    constructor(message?: string);
    get [CONCURRENT_MODIFICATION_ERROR_BRAND](): true;
    static [Symbol.hasInstance](value: unknown): boolean;
}
interface Cursor<E> {
    hasNext(): boolean;
    next(): E;
    remove(): void;
}
declare const DEQUE_BRAND: unique symbol;
interface Deque<E> extends Queue<E>, SequencedCollection<E>, ReadonlyDeque<E> {
    push(element: E): this;
    pop(): E | undefined;
    reversed(): Deque<E>;
}
interface Equatable {
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
}
interface Equivalence<T> {
    equals(a: T, b: T): boolean;
    hash(value: T): number;
}
declare const HASH_MAP_BRAND: unique symbol;
declare const HASH_SET_BRAND: unique symbol;
type HashFunction = (value: unknown) => number;
declare class HashMap<K, V> implements MapCollection<K, V> {
    private engine;
    constructor(entries?: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>> | null, options?: HashMapOptions<K> | null);
    constructor(options: HashMapOptions<K>);
    static from<K, V>(entries: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>>, options?: HashMapOptions<K> | null): HashMap<K, V>;
    static [Symbol.hasInstance](value: unknown): boolean;
    get [HASH_MAP_BRAND](): true;
    get [MAP_COLLECTION_BRAND](): true;
    get size(): number;
    get revision(): number;
    get [Symbol.toStringTag](): string;
    isEmpty(): boolean;
    get(key: K): V | undefined;
    getOrDefault<D>(key: K, fallback: D): V | D;
    has(key: K): boolean;
    containsValue(value: V): boolean;
    set(key: K, value: V): this;
    put(key: K, value: V): V | undefined;
    putAll(entries: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>>): void;
    delete(key: K): boolean;
    remove(key: K): V | undefined;
    replace(key: K, value: V): V | undefined;
    replaceAll(fn: (value: V, key: K, map: MapCollection<K, V>) => V): void;
    getOrInsert(key: K, value: V): V;
    getOrInsertComputed(key: K, fn: (key: K) => V): V;
    compute(key: K, fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    computeIfPresent(key: K, fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    merge(key: K, value: V, fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    clear(): void;
    keySet(): SetCollection<K>;
    entrySet(): SetCollection<MapEntry<K, V>>;
    valueCollection(): Collection<V>;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[
        K,
        V
    ]>;
    forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<[
        K,
        V
    ]>;
    copy(): HashMap<K, V>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): Array<[
        K,
        V
    ]>;
    [INSPECT](depth: number | null, options: object, inspect: (value: unknown, options: object) => string): string;
}
interface HashMapOptions<K> {
    key?: KeyOf<K> | undefined;
    equivalence?: Equivalence<K> | undefined;
}
declare class HashSet<E> implements SetCollection<E> {
    private engine;
    constructor(elements?: Iterable<E> | null, options?: HashSetOptions<E> | null);
    constructor(options: HashSetOptions<E>);
    static from<T>(elements: Iterable<T>, options?: HashSetOptions<T> | null): HashSet<T>;
    static [Symbol.hasInstance](value: unknown): boolean;
    get [HASH_SET_BRAND](): true;
    get [SET_COLLECTION_BRAND](): true;
    get [COLLECTION_BRAND](): true;
    get size(): number;
    get revision(): number;
    get [Symbol.toStringTag](): string;
    isEmpty(): boolean;
    add(element: E): this;
    has(element: E): boolean;
    delete(element: E): boolean;
    addAll(elements: Iterable<E>): boolean;
    removeAll(elements: Iterable<E>): boolean;
    retainAll(elements: Iterable<E>): boolean;
    removeIf(predicate: (element: E) => unknown): boolean;
    clear(): void;
    keys(): IterableIterator<E>;
    values(): IterableIterator<E>;
    entries(): IterableIterator<[
        E,
        E
    ]>;
    forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<E>;
    cursor(): Cursor<E>;
    toArray(): E[];
    copy(): HashSet<E>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): E[];
    [INSPECT](depth: number | null, options: object, inspect: (value: unknown, options: object) => string): string;
}
interface HashSetOptions<E> {
    key?: KeyOf<E>;
    equivalence?: Equivalence<E>;
}
declare const ILLEGAL_ARGUMENT_ERROR_BRAND: unique symbol;
declare const ILLEGAL_STATE_ERROR_BRAND: unique symbol;
declare const INDEX_OUT_OF_BOUNDS_ERROR_BRAND: unique symbol;
declare const INSPECT: unique symbol;
declare class IllegalArgumentError extends RangeError {
    constructor(message?: string);
    get [ILLEGAL_ARGUMENT_ERROR_BRAND](): true;
    static [Symbol.hasInstance](value: unknown): boolean;
}
declare class IllegalStateError extends Error {
    constructor(message?: string);
    get [ILLEGAL_STATE_ERROR_BRAND](): true;
    static [Symbol.hasInstance](value: unknown): boolean;
}
declare class IndexOutOfBoundsError extends RangeError {
    constructor(message?: string);
    get [INDEX_OUT_OF_BOUNDS_ERROR_BRAND](): true;
    static [Symbol.hasInstance](value: unknown): boolean;
}
type KeyOf<T> = (value: T) => string | number | bigint | boolean | symbol | null | undefined;
declare const LINKED_HASH_MAP_BRAND: unique symbol;
declare const LINKED_HASH_SET_BRAND: unique symbol;
declare const LINKED_LIST_BRAND: unique symbol;
declare const LIST_BRAND: unique symbol;
declare class LinkedHashMap<K, V> implements SequencedMap<K, V> {
    private engine;
    constructor(entries?: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>> | null, options?: LinkedHashMapOptions<K, V> | null);
    constructor(options: LinkedHashMapOptions<K, V>);
    static from<K, V>(entries: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>>, options?: LinkedHashMapOptions<K, V> | null): LinkedHashMap<K, V>;
    static [Symbol.hasInstance](value: unknown): boolean;
    get [LINKED_HASH_MAP_BRAND](): true;
    get [MAP_COLLECTION_BRAND](): true;
    get [SEQUENCED_MAP_BRAND](): true;
    get size(): number;
    get revision(): number;
    get [Symbol.toStringTag](): string;
    isEmpty(): boolean;
    get(key: K): V | undefined;
    getOrDefault<D>(key: K, fallback: D): V | D;
    has(key: K): boolean;
    containsValue(value: V): boolean;
    set(key: K, value: V): this;
    put(key: K, value: V): V | undefined;
    putAll(entries: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>>): void;
    putFirst(key: K, value: V): this;
    putLast(key: K, value: V): this;
    delete(key: K): boolean;
    remove(key: K): V | undefined;
    replace(key: K, value: V): V | undefined;
    replaceAll(fn: (value: V, key: K, map: MapCollection<K, V>) => V): void;
    getOrInsert(key: K, value: V): V;
    getOrInsertComputed(key: K, fn: (key: K) => V): V;
    compute(key: K, fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    computeIfPresent(key: K, fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    merge(key: K, value: V, fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    clear(): void;
    firstEntry(): MapEntry<K, V> | undefined;
    lastEntry(): MapEntry<K, V> | undefined;
    pollFirstEntry(): MapEntry<K, V> | undefined;
    pollLastEntry(): MapEntry<K, V> | undefined;
    reversed(): SequencedMap<K, V>;
    keySet(): SequencedSet<K>;
    entrySet(): SequencedSet<MapEntry<K, V>>;
    valueCollection(): SequencedCollection<V>;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[
        K,
        V
    ]>;
    forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<[
        K,
        V
    ]>;
    copy(): LinkedHashMap<K, V>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): Array<[
        K,
        V
    ]>;
    [INSPECT](depth: number | null, options: object, inspect: (value: unknown, options: object) => string): string;
}
interface LinkedHashMapOptions<K, V> {
    key?: KeyOf<K> | undefined;
    equivalence?: Equivalence<K> | undefined;
    accessOrder?: boolean | undefined;
    maxSize?: number | undefined;
    onEvict?: ((value: V, key: K, map: LinkedHashMap<K, V>) => void) | undefined;
}
declare class LinkedHashSet<E> implements SequencedSet<E> {
    private engine;
    constructor(elements?: Iterable<E> | null, options?: LinkedHashSetOptions<E> | null);
    constructor(options: LinkedHashSetOptions<E>);
    static from<T>(elements: Iterable<T>, options?: LinkedHashSetOptions<T> | null): LinkedHashSet<T>;
    static [Symbol.hasInstance](value: unknown): boolean;
    get [LINKED_HASH_SET_BRAND](): true;
    get [SET_COLLECTION_BRAND](): true;
    get [SEQUENCED_COLLECTION_BRAND](): true;
    get [COLLECTION_BRAND](): true;
    get size(): number;
    get revision(): number;
    get [Symbol.toStringTag](): string;
    isEmpty(): boolean;
    add(element: E): this;
    addFirst(element: E): this;
    addLast(element: E): this;
    has(element: E): boolean;
    delete(element: E): boolean;
    getFirst(): E;
    getLast(): E;
    removeFirst(): E;
    removeLast(): E;
    reversed(): SequencedSet<E>;
    addAll(elements: Iterable<E>): boolean;
    removeAll(elements: Iterable<E>): boolean;
    retainAll(elements: Iterable<E>): boolean;
    removeIf(predicate: (element: E) => unknown): boolean;
    clear(): void;
    keys(): IterableIterator<E>;
    values(): IterableIterator<E>;
    entries(): IterableIterator<[
        E,
        E
    ]>;
    forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<E>;
    cursor(): Cursor<E>;
    toArray(): E[];
    copy(): LinkedHashSet<E>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): E[];
    [INSPECT](depth: number | null, options: object, inspect: (value: unknown, options: object) => string): string;
}
interface LinkedHashSetOptions<E> {
    key?: KeyOf<E>;
    equivalence?: Equivalence<E>;
}
declare class LinkedList<E> implements Deque<E> {
    private readonly engine;
    constructor(elements?: Iterable<E> | null);
    static from<T>(elements: Iterable<T>): LinkedList<T>;
    static from<T, U>(elements: Iterable<T>, mapFn: (element: T, index: number) => U, thisArg?: unknown): LinkedList<U>;
    static [Symbol.hasInstance](value: unknown): boolean;
    get [LINKED_LIST_BRAND](): true;
    get [DEQUE_BRAND](): true;
    get [QUEUE_BRAND](): true;
    get [SEQUENCED_COLLECTION_BRAND](): true;
    get [COLLECTION_BRAND](): true;
    get size(): number;
    get revision(): number;
    get [Symbol.toStringTag](): string;
    isEmpty(): boolean;
    add(element: E): this;
    push(element: E): this;
    addLast(element: E): this;
    addFirst(element: E): this;
    addAll(elements: Iterable<E>): boolean;
    poll(): E | undefined;
    pop(): E | undefined;
    removeFirst(): E;
    removeLast(): E;
    peek(): E | undefined;
    peekLast(): E | undefined;
    getFirst(): E;
    getLast(): E;
    has(element: E): boolean;
    delete(element: E): boolean;
    removeAll(elements: Iterable<E>): boolean;
    retainAll(elements: Iterable<E>): boolean;
    removeIf(predicate: (element: E) => unknown): boolean;
    clear(): void;
    toArray(): E[];
    forEach(action: (element: E) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<E>;
    cursor(): Cursor<E>;
    addFirstNode(element: E): LinkedListNode<E>;
    addLastNode(element: E): LinkedListNode<E>;
    insertBefore(node: LinkedListNode<E>, element: E): LinkedListNode<E>;
    insertAfter(node: LinkedListNode<E>, element: E): LinkedListNode<E>;
    removeNode(node: LinkedListNode<E>): E;
    firstNode(): LinkedListNode<E> | undefined;
    lastNode(): LinkedListNode<E> | undefined;
    reversed(): Deque<E>;
    copy(): LinkedList<E>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): E[];
    [INSPECT](depth: number | null, options: object, inspect: (value: unknown, options: object) => string): string;
}
interface LinkedListNode<E> {
    value: E;
    readonly next: LinkedListNode<E> | undefined;
    readonly previous: LinkedListNode<E> | undefined;
}
interface List<E> extends SequencedCollection<E>, ReadonlyList<E> {
    set(index: number, element: E): E;
    insert(index: number, element: E): this;
    insertAll(index: number, elements: Iterable<E>): boolean;
    removeAt(index: number): E;
    replaceAll(op: (element: E, index: number, list: List<E>) => E): void;
    removeIf(predicate: (element: E, index: number, list: List<E>) => unknown): boolean;
    sort(comparator?: Comparator<E>): this;
    subList(from: number, to: number): List<E>;
    reversed(): List<E>;
    forEach(action: (element: E, index: number, list: List<E>) => void, thisArg?: unknown): void;
}
interface ListCursor<E> extends Cursor<E> {
    hasPrevious(): boolean;
    previous(): E;
    nextIndex(): number;
    previousIndex(): number;
    set(element: E): void;
    insert(element: E): void;
}
declare const MAP_COLLECTION_BRAND: unique symbol;
interface MapCollection<K, V> extends ReadonlyMapCollection<K, V> {
    set(key: K, value: V): this;
    put(key: K, value: V): V | undefined;
    putAll(entries: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>>): void;
    delete(key: K): boolean;
    remove(key: K): V | undefined;
    replace(key: K, value: V): V | undefined;
    replaceAll(fn: (value: V, key: K, map: MapCollection<K, V>) => V): void;
    getOrInsert(key: K, value: V): V;
    getOrInsertComputed(key: K, fn: (key: K) => V): V;
    compute(key: K, fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    computeIfPresent(key: K, fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    merge(key: K, value: V, fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    clear(): void;
    keySet(): SetCollection<K>;
    entrySet(): SetCollection<MapEntry<K, V>>;
    valueCollection(): Collection<V>;
    forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void;
}
interface MapEntry<K, V> extends Iterable<K | V> {
    readonly key: K;
    readonly value: V;
    setValue(value: V): V;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): [
        K,
        V
    ];
}
declare const NO_SUCH_ELEMENT_ERROR_BRAND: unique symbol;
declare const NULL_ELEMENT_ERROR_BRAND: unique symbol;
declare class NoSuchElementError extends Error {
    constructor(message?: string);
    get [NO_SUCH_ELEMENT_ERROR_BRAND](): true;
    static [Symbol.hasInstance](value: unknown): boolean;
}
declare class NullElementError extends TypeError {
    constructor(message?: string);
    get [NULL_ELEMENT_ERROR_BRAND](): true;
    static [Symbol.hasInstance](value: unknown): boolean;
}
declare const PRIORITY_QUEUE_BRAND: unique symbol;
declare class PriorityQueue<E> implements Queue<E> {
    private readonly engine;
    constructor(elements?: Iterable<E> | null);
    constructor(options: PriorityQueueOptions<E>);
    constructor(elements: Iterable<E> | null | undefined, options?: PriorityQueueOptions<E>);
    static from<T>(elements: Iterable<T>, options?: PriorityQueueOptions<T>): PriorityQueue<T>;
    static [Symbol.hasInstance](value: unknown): boolean;
    get [PRIORITY_QUEUE_BRAND](): true;
    get [QUEUE_BRAND](): true;
    get [COLLECTION_BRAND](): true;
    get size(): number;
    get revision(): number;
    get [Symbol.toStringTag](): string;
    comparator(): Comparator<E> | undefined;
    isEmpty(): boolean;
    add(element: E): this;
    addAll(elements: Iterable<E>): boolean;
    poll(): E | undefined;
    peek(): E | undefined;
    has(element: E): boolean;
    delete(element: E): boolean;
    removeAll(elements: Iterable<E>): boolean;
    retainAll(elements: Iterable<E>): boolean;
    removeIf(predicate: (element: E) => unknown): boolean;
    clear(): void;
    toArray(): E[];
    forEach(action: (element: E) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<E>;
    cursor(): Cursor<E>;
    copy(): PriorityQueue<E>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): E[];
    [INSPECT](depth: number | null, options: object, inspect: (value: unknown, options: object) => string): string;
}
interface PriorityQueueOptions<E> {
    comparator?: Comparator<E> | undefined;
}
declare const QUEUE_BRAND: unique symbol;
interface Queue<E> extends Collection<E>, ReadonlyQueue<E> {
    poll(): E | undefined;
}
interface ReadonlyCollection<E> extends Iterable<E> {
    readonly size: number;
    readonly revision: number;
    isEmpty(): boolean;
    has(element: E): boolean;
    toArray(): E[];
    forEach(action: (element: E) => void, thisArg?: unknown): void;
    cursor(): Cursor<E>;
    [Symbol.iterator](): IterableIterator<E>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): E[];
}
interface ReadonlyDeque<E> extends ReadonlyQueue<E>, ReadonlySequencedCollection<E> {
    peekLast(): E | undefined;
    reversed(): ReadonlyDeque<E>;
}
interface ReadonlyList<E> extends ReadonlySequencedCollection<E> {
    get(index: number): E;
    indexOf(element: E): number;
    lastIndexOf(element: E): number;
    listCursor(index?: number): ListCursor<E>;
    subList(from: number, to: number): ReadonlyList<E>;
    reversed(): ReadonlyList<E>;
    forEach(action: (element: E, index: number, list: ReadonlyList<E>) => void, thisArg?: unknown): void;
}
interface ReadonlyMapCollection<K, V> extends Iterable<[
    K,
    V
]> {
    readonly size: number;
    readonly revision: number;
    isEmpty(): boolean;
    get(key: K): V | undefined;
    getOrDefault<D>(key: K, fallback: D): V | D;
    has(key: K): boolean;
    containsValue(value: V): boolean;
    keySet(): ReadonlySetCollection<K>;
    entrySet(): ReadonlySetCollection<MapEntry<K, V>>;
    valueCollection(): ReadonlyCollection<V>;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[
        K,
        V
    ]>;
    forEach(action: (value: V, key: K, map: ReadonlyMapCollection<K, V>) => void, thisArg?: unknown): void;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): Array<[
        K,
        V
    ]>;
}
interface ReadonlyQueue<E> extends ReadonlyCollection<E> {
    peek(): E | undefined;
}
interface ReadonlySequencedCollection<E> extends ReadonlyCollection<E> {
    getFirst(): E;
    getLast(): E;
    reversed(): ReadonlySequencedCollection<E>;
}
interface ReadonlySequencedMap<K, V> extends ReadonlyMapCollection<K, V> {
    firstEntry(): MapEntry<K, V> | undefined;
    lastEntry(): MapEntry<K, V> | undefined;
    reversed(): ReadonlySequencedMap<K, V>;
    keySet(): ReadonlySequencedSet<K>;
    entrySet(): ReadonlySequencedSet<MapEntry<K, V>>;
    valueCollection(): ReadonlySequencedCollection<V>;
    forEach(action: (value: V, key: K, map: ReadonlyMapCollection<K, V>) => void, thisArg?: unknown): void;
}
interface ReadonlySequencedSet<E> extends ReadonlySetCollection<E>, ReadonlySequencedCollection<E> {
    reversed(): ReadonlySequencedSet<E>;
    forEach(action: (element: E, same: E, set: ReadonlySetCollection<E>) => void, thisArg?: unknown): void;
}
interface ReadonlySetCollection<E> extends ReadonlyCollection<E> {
    keys(): IterableIterator<E>;
    values(): IterableIterator<E>;
    entries(): IterableIterator<[
        E,
        E
    ]>;
    forEach(action: (element: E, same: E, set: ReadonlySetCollection<E>) => void, thisArg?: unknown): void;
}
interface ReadonlySortedMap<K, V> extends ReadonlySequencedMap<K, V> {
    readonly size: number;
    isEmpty(): boolean;
    [Symbol.iterator](): IterableIterator<[
        K,
        V
    ]>;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[
        K,
        V
    ]>;
    comparator(): Comparator<K> | undefined;
    firstEntry(): MapEntry<K, V> | undefined;
    lastEntry(): MapEntry<K, V> | undefined;
    lowerEntry(key: K): MapEntry<K, V> | undefined;
    floorEntry(key: K): MapEntry<K, V> | undefined;
    ceilingEntry(key: K): MapEntry<K, V> | undefined;
    higherEntry(key: K): MapEntry<K, V> | undefined;
    subMap(from: K, to: K, options?: SubSetOptions | null): ReadonlySortedMap<K, V>;
    headMap(to: K, options?: BoundOptions | null): ReadonlySortedMap<K, V>;
    tailMap(from: K, options?: BoundOptions | null): ReadonlySortedMap<K, V>;
    reversed(): ReadonlySortedMap<K, V>;
    keySet(): ReadonlySortedSet<K>;
}
interface ReadonlySortedSet<E> extends ReadonlySequencedSet<E> {
    readonly size: number;
    isEmpty(): boolean;
    [Symbol.iterator](): IterableIterator<E>;
    cursor(): Cursor<E>;
    keys(): IterableIterator<E>;
    values(): IterableIterator<E>;
    entries(): IterableIterator<[
        E,
        E
    ]>;
    forEach(action: (element: E, same: E, set: ReadonlySetCollection<E>) => void, thisArg?: unknown): void;
    comparator(): Comparator<E> | undefined;
    lower(element: E): E | undefined;
    floor(element: E): E | undefined;
    ceiling(element: E): E | undefined;
    higher(element: E): E | undefined;
    subSet(from: E, to: E, options?: SubSetOptions | null): ReadonlySortedSet<E>;
    headSet(to: E, options?: BoundOptions | null): ReadonlySortedSet<E>;
    tailSet(from: E, options?: BoundOptions | null): ReadonlySortedSet<E>;
    reversed(): ReadonlySortedSet<E>;
}
declare const SEQUENCED_COLLECTION_BRAND: unique symbol;
declare const SEQUENCED_MAP_BRAND: unique symbol;
declare const SET_COLLECTION_BRAND: unique symbol;
declare const SORTED_MAP_BRAND: unique symbol;
declare const SORTED_SET_BRAND: unique symbol;
interface SequencedCollection<E> extends Collection<E>, ReadonlySequencedCollection<E> {
    addFirst(element: E): this;
    addLast(element: E): this;
    removeFirst(): E;
    removeLast(): E;
    reversed(): SequencedCollection<E>;
}
interface SequencedMap<K, V> extends MapCollection<K, V>, ReadonlySequencedMap<K, V> {
    pollFirstEntry(): MapEntry<K, V> | undefined;
    pollLastEntry(): MapEntry<K, V> | undefined;
    putFirst(key: K, value: V): this;
    putLast(key: K, value: V): this;
    reversed(): SequencedMap<K, V>;
    keySet(): SequencedSet<K>;
    entrySet(): SequencedSet<MapEntry<K, V>>;
    valueCollection(): SequencedCollection<V>;
    forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void;
}
interface SequencedSet<E> extends SetCollection<E>, SequencedCollection<E>, ReadonlySequencedSet<E> {
    addFirst(element: E): this;
    addLast(element: E): this;
    reversed(): SequencedSet<E>;
    forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void;
}
interface SetCollection<E> extends Collection<E>, ReadonlySetCollection<E> {
    forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void;
}
interface SortedMap<K, V> extends SequencedMap<K, V>, ReadonlySortedMap<K, V> {
    [Symbol.iterator](): IterableIterator<[
        K,
        V
    ]>;
    pollFirstEntry(): MapEntry<K, V> | undefined;
    pollLastEntry(): MapEntry<K, V> | undefined;
    putFirst(key: K, value: V): this;
    putLast(key: K, value: V): this;
    subMap(from: K, to: K, options?: SubSetOptions | null): SortedMap<K, V>;
    headMap(to: K, options?: BoundOptions | null): SortedMap<K, V>;
    tailMap(from: K, options?: BoundOptions | null): SortedMap<K, V>;
    reversed(): SortedMap<K, V>;
    keySet(): SortedSet<K>;
    entrySet(): SequencedSet<MapEntry<K, V>>;
    valueCollection(): SequencedCollection<V>;
    forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void;
}
interface SortedSet<E> extends SequencedSet<E>, ReadonlySortedSet<E> {
    forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void;
    pollFirst(): E | undefined;
    pollLast(): E | undefined;
    subSet(from: E, to: E, options?: SubSetOptions | null): SortedSet<E>;
    headSet(to: E, options?: BoundOptions | null): SortedSet<E>;
    tailSet(from: E, options?: BoundOptions | null): SortedSet<E>;
    reversed(): SortedSet<E>;
}
interface SubSetOptions {
    fromInclusive?: boolean | undefined;
    toInclusive?: boolean | undefined;
}
declare const TREE_MAP_BRAND: unique symbol;
declare const TREE_SET_BRAND: unique symbol;
declare class TreeMap<K, V> implements SortedMap<K, V> {
    private readonly engine;
    constructor(entries?: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>> | null);
    constructor(options: TreeMapOptions<K>);
    constructor(entries: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>> | null | undefined, options?: TreeMapOptions<K>);
    static from<K, V>(entries: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>>, options?: TreeMapOptions<K>): TreeMap<K, V>;
    static [Symbol.hasInstance](value: unknown): boolean;
    get [TREE_MAP_BRAND](): true;
    get [SORTED_MAP_BRAND](): true;
    get [MAP_COLLECTION_BRAND](): true;
    get [SEQUENCED_MAP_BRAND](): true;
    get size(): number;
    get revision(): number;
    get [Symbol.toStringTag](): string;
    comparator(): Comparator<K> | undefined;
    isEmpty(): boolean;
    get(key: K): V | undefined;
    getOrDefault<D>(key: K, fallback: D): V | D;
    has(key: K): boolean;
    containsValue(value: V): boolean;
    set(key: K, value: V): this;
    put(key: K, value: V): V | undefined;
    putAll(entries: Iterable<readonly [
        K,
        V
    ] | MapEntry<K, V>>): void;
    delete(key: K): boolean;
    remove(key: K): V | undefined;
    replace(key: K, value: V): V | undefined;
    replaceAll(fn: (value: V, key: K, map: MapCollection<K, V>) => V): void;
    getOrInsert(key: K, value: V): V;
    getOrInsertComputed(key: K, fn: (key: K) => V): V;
    compute(key: K, fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    computeIfPresent(key: K, fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    merge(key: K, value: V, fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined): V | undefined;
    clear(): void;
    firstEntry(): MapEntry<K, V> | undefined;
    lastEntry(): MapEntry<K, V> | undefined;
    lowerEntry(key: K): MapEntry<K, V> | undefined;
    floorEntry(key: K): MapEntry<K, V> | undefined;
    ceilingEntry(key: K): MapEntry<K, V> | undefined;
    higherEntry(key: K): MapEntry<K, V> | undefined;
    pollFirstEntry(): MapEntry<K, V> | undefined;
    pollLastEntry(): MapEntry<K, V> | undefined;
    putFirst(key: K, value: V): this;
    putLast(key: K, value: V): this;
    subMap(from: K, to: K, options?: SubSetOptions | null): SortedMap<K, V>;
    headMap(to: K, options?: BoundOptions | null): SortedMap<K, V>;
    tailMap(from: K, options?: BoundOptions | null): SortedMap<K, V>;
    reversed(): SortedMap<K, V>;
    keySet(): SortedSet<K>;
    entrySet(): SequencedSet<MapEntry<K, V>>;
    valueCollection(): SequencedCollection<V>;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[
        K,
        V
    ]>;
    forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<[
        K,
        V
    ]>;
    copy(): TreeMap<K, V>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): Array<[
        K,
        V
    ]>;
    [INSPECT](depth: number | null, options: object, inspect: (value: unknown, options: object) => string): string;
}
interface TreeMapOptions<K> {
    comparator?: Comparator<K> | undefined;
}
declare class TreeSet<E> implements SortedSet<E> {
    private readonly engine;
    constructor(elements?: Iterable<E> | null);
    constructor(options: TreeSetOptions<E>);
    constructor(elements: Iterable<E> | null | undefined, options?: TreeSetOptions<E>);
    static from<T>(elements: Iterable<T>, options?: TreeSetOptions<T>): TreeSet<T>;
    static [Symbol.hasInstance](value: unknown): boolean;
    get [TREE_SET_BRAND](): true;
    get [SORTED_SET_BRAND](): true;
    get [SET_COLLECTION_BRAND](): true;
    get [SEQUENCED_COLLECTION_BRAND](): true;
    get [COLLECTION_BRAND](): true;
    get size(): number;
    get revision(): number;
    get [Symbol.toStringTag](): string;
    comparator(): Comparator<E> | undefined;
    isEmpty(): boolean;
    add(element: E): this;
    has(element: E): boolean;
    delete(element: E): boolean;
    addAll(elements: Iterable<E>): boolean;
    removeAll(elements: Iterable<E>): boolean;
    retainAll(elements: Iterable<E>): boolean;
    removeIf(predicate: (element: E) => unknown): boolean;
    clear(): void;
    getFirst(): E;
    getLast(): E;
    removeFirst(): E;
    removeLast(): E;
    addFirst(element: E): this;
    addLast(element: E): this;
    pollFirst(): E | undefined;
    pollLast(): E | undefined;
    lower(element: E): E | undefined;
    floor(element: E): E | undefined;
    ceiling(element: E): E | undefined;
    higher(element: E): E | undefined;
    subSet(from: E, to: E, options?: SubSetOptions | null): SortedSet<E>;
    headSet(to: E, options?: BoundOptions | null): SortedSet<E>;
    tailSet(from: E, options?: BoundOptions | null): SortedSet<E>;
    reversed(): SortedSet<E>;
    keys(): IterableIterator<E>;
    values(): IterableIterator<E>;
    entries(): IterableIterator<[
        E,
        E
    ]>;
    forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void;
    [Symbol.iterator](): IterableIterator<E>;
    cursor(): Cursor<E>;
    toArray(): E[];
    copy(): TreeSet<E>;
    equals(other: unknown): boolean;
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
    toString(): string;
    toJSON(): E[];
    [INSPECT](depth: number | null, options: object, inspect: (value: unknown, options: object) => string): string;
}
interface TreeSetOptions<E> {
    comparator?: Comparator<E> | undefined;
}
declare const UNSUPPORTED_OPERATION_ERROR_BRAND: unique symbol;
declare class UnsupportedOperationError extends TypeError {
    constructor(message?: string);
    get [UNSUPPORTED_OPERATION_ERROR_BRAND](): true;
    static [Symbol.hasInstance](value: unknown): boolean;
}
declare const compareSymbol: unique symbol;
declare function comparing<T, U>(key: (value: T) => U, comparator?: Comparator<U>): Comparator<T>;
declare function equals(a: unknown, b: unknown): boolean;
declare const equalsSymbol: unique symbol;
declare function hashCode(value: unknown): number;
declare const hashCodeSymbol: unique symbol;
declare function isCollection(value: unknown): value is ReadonlyCollection<unknown>;
declare function isDeque(value: unknown): value is ReadonlyDeque<unknown>;
declare function isList(value: unknown): value is ReadonlyList<unknown>;
declare function isMapCollection(value: unknown): value is ReadonlyMapCollection<unknown, unknown>;
declare function isQueue(value: unknown): value is ReadonlyQueue<unknown>;
declare function isSequencedCollection(value: unknown): value is ReadonlySequencedCollection<unknown>;
declare function isSetCollection(value: unknown): value is ReadonlySetCollection<unknown>;
declare function isSortedMap(value: unknown): value is ReadonlySortedMap<unknown, unknown>;
declare function isSortedSet(value: unknown): value is ReadonlySortedSet<unknown>;
declare function naturalOrder<T>(): Comparator<T>;
declare function nullsFirst<T>(comparator?: Comparator<T>): Comparator<T | null | undefined>;
declare function nullsLast<T>(comparator?: Comparator<T>): Comparator<T | null | undefined>;
declare function reverseOrder<T>(comparator?: Comparator<T>): Comparator<T>;
declare const sameValueZeroEquivalence: Equivalence<unknown>;
declare function thenComparing<T>(first: Comparator<T>, ...next: Comparator<T>[]): Comparator<T>;
declare const valueEquivalence: Equivalence<unknown>;
export { ArrayDeque, ArrayList, ClassCastError, ConcurrentModificationError, HashMap, HashSet, IllegalArgumentError, IllegalStateError, IndexOutOfBoundsError, LinkedHashMap, LinkedHashSet, LinkedList, NoSuchElementError, NullElementError, PriorityQueue, TreeMap, TreeSet, UnsupportedOperationError, compareSymbol, comparing, equals, equalsSymbol, hashCode, hashCodeSymbol, isCollection, isDeque, isList, isMapCollection, isQueue, isSequencedCollection, isSetCollection, isSortedMap, isSortedSet, naturalOrder, nullsFirst, nullsLast, reverseOrder, sameValueZeroEquivalence, thenComparing, valueEquivalence };
export type { BoundOptions, Collection, Comparable, Comparator, Cursor, Deque, Equatable, Equivalence, HashFunction, HashMapOptions, HashSetOptions, KeyOf, LinkedHashMapOptions, LinkedHashSetOptions, LinkedListNode, List, ListCursor, MapCollection, MapEntry, PriorityQueueOptions, Queue, ReadonlyCollection, ReadonlyDeque, ReadonlyList, ReadonlyMapCollection, ReadonlyQueue, ReadonlySequencedCollection, ReadonlySequencedMap, ReadonlySequencedSet, ReadonlySetCollection, ReadonlySortedMap, ReadonlySortedSet, SequencedCollection, SequencedMap, SequencedSet, SetCollection, SortedMap, SortedSet, SubSetOptions, TreeMapOptions, TreeSetOptions };

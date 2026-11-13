declare const ARRAY_LIST_BRAND: unique symbol;
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
interface Equatable {
    [equalsSymbol](other: unknown): boolean;
    [hashCodeSymbol](hash: HashFunction): number;
}
interface Equivalence<T> {
    equals(a: T, b: T): boolean;
    hash(value: T): number;
}
type HashFunction = (value: unknown) => number;
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
declare const LIST_BRAND: unique symbol;
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
interface ReadonlyList<E> extends ReadonlySequencedCollection<E> {
    get(index: number): E;
    indexOf(element: E): number;
    lastIndexOf(element: E): number;
    listCursor(index?: number): ListCursor<E>;
    subList(from: number, to: number): ReadonlyList<E>;
    reversed(): ReadonlyList<E>;
    forEach(action: (element: E, index: number, list: ReadonlyList<E>) => void, thisArg?: unknown): void;
}
interface ReadonlySequencedCollection<E> extends ReadonlyCollection<E> {
    getFirst(): E;
    getLast(): E;
    reversed(): ReadonlySequencedCollection<E>;
}
declare const SEQUENCED_COLLECTION_BRAND: unique symbol;
interface SequencedCollection<E> extends Collection<E>, ReadonlySequencedCollection<E> {
    addFirst(element: E): this;
    addLast(element: E): this;
    removeFirst(): E;
    removeLast(): E;
    reversed(): SequencedCollection<E>;
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
declare function isList(value: unknown): value is ReadonlyList<unknown>;
declare function isSequencedCollection(value: unknown): value is ReadonlySequencedCollection<unknown>;
declare function naturalOrder<T>(): Comparator<T>;
declare function nullsFirst<T>(comparator?: Comparator<T>): Comparator<T | null | undefined>;
declare function nullsLast<T>(comparator?: Comparator<T>): Comparator<T | null | undefined>;
declare function reverseOrder<T>(comparator?: Comparator<T>): Comparator<T>;
declare const sameValueZeroEquivalence: Equivalence<unknown>;
declare function thenComparing<T>(first: Comparator<T>, ...next: Comparator<T>[]): Comparator<T>;
declare const valueEquivalence: Equivalence<unknown>;
export { ArrayList, ClassCastError, ConcurrentModificationError, IllegalArgumentError, IllegalStateError, IndexOutOfBoundsError, NoSuchElementError, NullElementError, UnsupportedOperationError, compareSymbol, comparing, equals, equalsSymbol, hashCode, hashCodeSymbol, isCollection, isList, isSequencedCollection, naturalOrder, nullsFirst, nullsLast, reverseOrder, sameValueZeroEquivalence, thenComparing, valueEquivalence };
export type { Collection, Comparable, Comparator, Cursor, Equatable, Equivalence, HashFunction, KeyOf, List, ListCursor, ReadonlyCollection, ReadonlyList, ReadonlySequencedCollection, SequencedCollection };

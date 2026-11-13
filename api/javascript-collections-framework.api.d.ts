declare const CLASS_CAST_ERROR_BRAND: unique symbol;
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
declare function naturalOrder<T>(): Comparator<T>;
declare function nullsFirst<T>(comparator?: Comparator<T>): Comparator<T | null | undefined>;
declare function nullsLast<T>(comparator?: Comparator<T>): Comparator<T | null | undefined>;
declare function reverseOrder<T>(comparator?: Comparator<T>): Comparator<T>;
declare const sameValueZeroEquivalence: Equivalence<unknown>;
declare function thenComparing<T>(first: Comparator<T>, ...next: Comparator<T>[]): Comparator<T>;
declare const valueEquivalence: Equivalence<unknown>;
export { ClassCastError, ConcurrentModificationError, IllegalArgumentError, IllegalStateError, IndexOutOfBoundsError, NoSuchElementError, NullElementError, UnsupportedOperationError, compareSymbol, comparing, equals, equalsSymbol, hashCode, hashCodeSymbol, isCollection, naturalOrder, nullsFirst, nullsLast, reverseOrder, sameValueZeroEquivalence, thenComparing, valueEquivalence };
export type { Collection, Comparable, Comparator, Cursor, Equatable, Equivalence, HashFunction, KeyOf, ReadonlyCollection };

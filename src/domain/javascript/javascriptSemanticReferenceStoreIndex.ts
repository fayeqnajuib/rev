type SemanticStoredProjection = readonly (string | null)[] | undefined;

interface StoredReference<Source> {
  readonly source: Source;
  readonly order: number;
  path: SemanticStoredProjection;
  key: string | undefined;
}

/**
 * One heap owner's possible stores, updated by its publishing producer. Exact
 * first-slot reads skip unrelated stores; semantic matching and capture proofs
 * remain with the consumer. Unknown projections and prototype-changing stores
 * stay candidates for every key. No query result or readiness fact is cached.
 */
export class SemanticReferenceStoreIndex<Source> {
  readonly #entries = new Map<Source, StoredReference<Source>>();
  readonly #exact = new Map<string, Set<StoredReference<Source>>>();
  readonly #unknown = new Set<StoredReference<Source>>();

  has(source: Source): boolean {
    return this.#entries.has(source);
  }

  get(source: Source): SemanticStoredProjection {
    return this.#entries.get(source)?.path;
  }

  set(source: Source, path: SemanticStoredProjection, allKeys = false): void {
    const key = allKeys ? undefined : (path?.[0] ?? undefined);
    let entry = this.#entries.get(source);
    if (entry === undefined) {
      entry = { source, path, key, order: this.#entries.size };
      this.#entries.set(source, entry);
    } else {
      entry.path = path;
      if (entry.key === key) return;
      if (entry.key === undefined) this.#unknown.delete(entry);
      else {
        const previous = this.#exact.get(entry.key);
        previous?.delete(entry);
        if (previous?.size === 0) this.#exact.delete(entry.key);
      }
      entry.key = key;
    }
    if (key === undefined) this.#unknown.add(entry);
    else {
      let selected = this.#exact.get(key);
      if (selected === undefined) {
        selected = new Set();
        this.#exact.set(key, selected);
      }
      selected.add(entry);
    }
  }

  *[Symbol.iterator](): IterableIterator<[Source, SemanticStoredProjection]> {
    for (const entry of this.#entries.values())
      yield [entry.source, entry.path];
  }

  *candidates(
    key: string | null | undefined,
  ): IterableIterator<[Source, SemanticStoredProjection]> {
    if (typeof key !== "string" || this.#exact.size === 0) {
      yield* this;
      return;
    }
    // Widening moves an existing source between buckets. Its publication order
    // still precedes later sources, even when it entered this bucket last.
    const selected = [...this.#unknown, ...(this.#exact.get(key) ?? [])];
    selected.sort((left, right) => left.order - right.order);
    for (const entry of selected) yield [entry.source, entry.path];
  }
}

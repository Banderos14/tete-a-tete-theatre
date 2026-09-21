// Минимальная in-memory модель Firestore Admin SDK для тестов сервисов броней.
//
// Моделирует ровно то, чем пользуются booking/cancellation/expiration/availability:
// collection/doc, where('==' | 'in') + limit, batch и runTransaction.
//
// Гарантия транзакций Firestore — сериализация конфликтующих операций —
// моделируется очередью: транзакции выполняются по одной, записи применяются
// при коммите. Внутри get'ов стоят искусственные паузы, поэтому без очереди
// параллельные операции действительно перемешивались бы.

type Data = Record<string, unknown>;

const clone = <T>(v: T): T => structuredClone(v);
const tick  = () => new Promise<void>(r => setTimeout(r, 0));

export class MemoryFirestore {
  readonly collections = new Map<string, Map<string, Data>>();
  private queue: Promise<unknown> = Promise.resolve();
  private autoId = 0;

  private coll(name: string): Map<string, Data> {
    let c = this.collections.get(name);
    if (!c) { c = new Map(); this.collections.set(name, c); }
    return c;
  }

  collection(name: string) {
    return new MemoryCollection(this, name);
  }

  /** Сырые данные документа — для проверок в тестах. */
  peek(collection: string, id: string): Data | undefined {
    const d = this.coll(collection).get(id);
    return d ? clone(d) : undefined;
  }

  seed(collection: string, id: string, data: Data): void {
    this.coll(collection).set(id, clone(data));
  }

  nextId(): string { return `auto-${++this.autoId}`; }

  readDoc(collection: string, id: string): Data | undefined {
    const d = this.coll(collection).get(id);
    return d ? clone(d) : undefined;
  }

  writeDoc(collection: string, id: string, data: Data, mode: 'set' | 'merge' | 'update' | 'create'): void {
    const c = this.coll(collection);
    const prev = c.get(id);
    if (mode === 'update' && !prev) throw new Error(`NOT_FOUND: ${collection}/${id}`);
    if (mode === 'create' && prev)  throw new Error(`ALREADY_EXISTS: ${collection}/${id}`);
    c.set(id, mode === 'set' || mode === 'create' ? clone(data) : { ...prev, ...clone(data) });
  }

  listDocs(collection: string): Array<[string, Data]> {
    return [...this.coll(collection).entries()].map(([id, d]) => [id, clone(d)]);
  }

  runTransaction<T>(fn: (tx: MemoryTransaction) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const tx = new MemoryTransaction(this);
      const result = await fn(tx);
      await tick(); // сетевой коммит: без очереди другая транзакция успела бы прочитать старое
      tx.commit();
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  batch() {
    const ops: Array<() => void> = [];
    return {
      update: (ref: MemoryDocRef, data: Data) => { ops.push(() => this.writeDoc(ref.collection, ref.id, data, 'update')); },
      set:    (ref: MemoryDocRef, data: Data, opts?: { merge?: boolean }) => {
        ops.push(() => this.writeDoc(ref.collection, ref.id, data, opts?.merge ? 'merge' : 'set'));
      },
      commit: async () => { await tick(); ops.forEach(op => op()); },
    };
  }
}

export class MemoryDocRef {
  constructor(private readonly store: MemoryFirestore, readonly collection: string, readonly id: string) {}

  async get() {
    await tick();
    const data = this.store.readDoc(this.collection, this.id);
    return { id: this.id, ref: this, exists: data !== undefined, data: () => data };
  }
  async set(data: Data, opts?: { merge?: boolean }) {
    await tick();
    this.store.writeDoc(this.collection, this.id, data, opts?.merge ? 'merge' : 'set');
  }
  async update(data: Data) {
    await tick();
    this.store.writeDoc(this.collection, this.id, data, 'update');
  }
}

type Filter = { field: string; op: string; value: unknown };

export class MemoryQuery {
  constructor(
    protected readonly store: MemoryFirestore,
    readonly collection: string,
    private readonly filters: Filter[] = [],
    private readonly max = Infinity,
  ) {}

  where(field: string, op: string, value: unknown): MemoryQuery {
    return new MemoryQuery(this.store, this.collection, [...this.filters, { field, op, value }], this.max);
  }
  limit(n: number): MemoryQuery {
    return new MemoryQuery(this.store, this.collection, this.filters, n);
  }

  async get() {
    await tick();
    const docs = this.store.listDocs(this.collection)
      .filter(([, d]) => this.filters.every(f => {
        if (f.op === '==') return d[f.field] === f.value;
        if (f.op === 'in') return (f.value as unknown[]).includes(d[f.field]);
        throw new Error(`operator ${f.op} is not modelled`);
      }))
      .slice(0, this.max)
      .map(([id, d]) => ({ id, ref: new MemoryDocRef(this.store, this.collection, id), data: () => d }));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

export class MemoryCollection extends MemoryQuery {
  doc(id?: string): MemoryDocRef {
    return new MemoryDocRef(this.store, this.collection, id ?? this.store.nextId());
  }
  async add(data: Data): Promise<MemoryDocRef> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

export class MemoryTransaction {
  private writes: Array<() => void> = [];
  constructor(private readonly store: MemoryFirestore) {}

  get(target: MemoryDocRef | MemoryQuery) {
    return target.get();
  }
  set(ref: MemoryDocRef, data: Data, opts?: { merge?: boolean }) {
    this.writes.push(() => this.store.writeDoc(ref.collection, ref.id, data, opts?.merge ? 'merge' : 'set'));
  }
  update(ref: MemoryDocRef, data: Data) {
    this.writes.push(() => this.store.writeDoc(ref.collection, ref.id, data, 'update'));
  }
  create(ref: MemoryDocRef, data: Data) {
    this.writes.push(() => this.store.writeDoc(ref.collection, ref.id, data, 'create'));
  }
  commit() {
    this.writes.forEach(w => w());
  }
}

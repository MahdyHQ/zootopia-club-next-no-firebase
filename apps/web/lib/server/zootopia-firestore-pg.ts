import "server-only";

import postgres from "postgres";

import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";

function readDatabaseUrl() {
  const raw =
    process.env.SUPABASE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";
  return raw.length > 0 ? raw : null;
}

export function hasZootopiaPostgresPersistence() {
  return Boolean(readDatabaseUrl());
}

export function shouldUseZootopiaPostgresPersistence() {
  return hasSupabaseAdminRuntime() && hasZootopiaPostgresPersistence();
}

let sqlSingleton: ReturnType<typeof postgres> | null = null;

export function getZootopiaSql() {
  if (sqlSingleton) {
    return sqlSingleton;
  }

  const url = readDatabaseUrl();
  if (!url) {
    throw new Error("ZOOTOPIA_DATABASE_URL_MISSING");
  }

  sqlSingleton = postgres(url, {
    max: 8,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  return sqlSingleton;
}

type Sql = ReturnType<typeof postgres>;

/** Connection or transaction-scoped sql handle from `postgres` (begin callback). */
type SqlExecutor = Sql;

function safeJsonField(field: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
    throw new Error(`Unsupported JSON field: ${field}`);
  }

  return field;
}

function bodyPathFragment(sql: Sql, field: string) {
  const key = safeJsonField(field);
  return sql.unsafe(`body->>'${key}'`);
}

function deriveOwnerUid(collection: string, row: Record<string, unknown>): string | null {
  if (typeof row.ownerUid === "string" && row.ownerUid) {
    return row.ownerUid;
  }

  if (collection === "users" && typeof row.uid === "string" && row.uid) {
    return row.uid;
  }

  return null;
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    if (pv === undefined) {
      delete out[key];
      continue;
    }
    const bv = base[key];
    if (
      pv &&
      typeof pv === "object" &&
      !Array.isArray(pv) &&
      bv &&
      typeof bv === "object" &&
      !Array.isArray(bv)
    ) {
      out[key] = deepMerge(bv as Record<string, unknown>, pv as Record<string, unknown>);
    } else {
      out[key] = pv;
    }
  }

  return out;
}

export class PgDocumentRef {
  constructor(
    private readonly rootSql: SqlExecutor,
    readonly parentCollection: string,
    readonly id: string,
  ) {}

  async _getWithSql(sql: SqlExecutor, forUpdate: boolean): Promise<PgDocSnapshot> {
    const rows = await sql`
      select id, body
      from zc_entities
      where collection = ${this.parentCollection} and id = ${this.id}
      ${forUpdate ? sql`for update` : sql``}
    `;

    const row = rows[0] as { id: string; body: Record<string, unknown> } | undefined;
    if (!row) {
      return new PgDocSnapshot(this.rootSql, this.parentCollection, this.id, false, null);
    }

    return new PgDocSnapshot(
      this.rootSql,
      this.parentCollection,
      row.id,
      true,
      row.body,
    );
  }

  async get(): Promise<PgDocSnapshot> {
    return this._getWithSql(this.rootSql, false);
  }

  async _setWithSql(
    sql: SqlExecutor,
    data: object,
    options?: { merge?: boolean },
  ): Promise<void> {
    const merge = options?.merge === true;
    const patch = data as Record<string, unknown>;
    let nextBody = patch;

    if (merge) {
      const existing = await this._getWithSql(sql, true);
      const prev = existing.exists ? (existing.raw() as Record<string, unknown>) : {};
      nextBody = deepMerge(prev, patch);
    }

    const ownerUid = deriveOwnerUid(this.parentCollection, nextBody);
    const jsonBody = JSON.parse(JSON.stringify(nextBody)) as Record<string, unknown>;

    await sql`
      insert into zc_entities (collection, id, owner_uid, body, updated_at)
      values (
        ${this.parentCollection},
        ${this.id},
        ${ownerUid},
        ${sql.json(jsonBody as never)},
        now()
      )
      on conflict (collection, id) do update set
        owner_uid = excluded.owner_uid,
        body = excluded.body,
        updated_at = now()
    `;
  }

  async set(data: object, options?: { merge?: boolean }): Promise<void> {
    await this._setWithSql(this.rootSql, data, options);
  }

  async _deleteWithSql(sql: SqlExecutor): Promise<void> {
    await sql`
      delete from zc_entities
      where collection = ${this.parentCollection} and id = ${this.id}
    `;
  }

  async delete(): Promise<void> {
    await this._deleteWithSql(this.rootSql);
  }
}

export class PgDocSnapshot {
  constructor(
    private readonly rootSql: SqlExecutor,
    private readonly parentCollection: string,
    public readonly id: string,
    public readonly exists: boolean,
    private readonly payload: Record<string, unknown> | null,
  ) {}

  /** Raw JSON body as stored (for merges). */
  raw(): Record<string, unknown> {
    if (!this.payload) {
      throw new Error("DOCUMENT_MISSING");
    }

    return this.payload;
  }

  data(): Record<string, unknown> {
    return this.raw();
  }

  get ref(): PgDocumentRef {
    return new PgDocumentRef(this.rootSql, this.parentCollection, this.id);
  }
}

type WhereClause = { field: string; op: "==" | "<="; value: string };

export class PgQuery {
  private readonly clauses: WhereClause[];
  private readonly orderSpecs: { field: string; direction: "asc" | "desc" }[];
  private readonly limitCount: number | null;

  constructor(
    private readonly rootSql: SqlExecutor,
    private readonly parentCollection: string,
    clauses: WhereClause[],
    orderSpecs: { field: string; direction: "asc" | "desc" }[],
    limitCount: number | null,
  ) {
    this.clauses = clauses;
    this.orderSpecs = orderSpecs;
    this.limitCount = limitCount;
  }

  where(field: string, op: "==" | "<=", value: unknown): PgQuery {
    return new PgQuery(
      this.rootSql,
      this.parentCollection,
      [...this.clauses, { field, op, value: String(value) }],
      this.orderSpecs,
      this.limitCount,
    );
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): PgQuery {
    return new PgQuery(
      this.rootSql,
      this.parentCollection,
      this.clauses,
      [...this.orderSpecs, { field, direction }],
      this.limitCount,
    );
  }

  limit(n: number): PgQuery {
    return new PgQuery(this.rootSql, this.parentCollection, this.clauses, this.orderSpecs, n);
  }

  async _getWithSql(sqlConn: SqlExecutor, forUpdate: boolean): Promise<PgQuerySnapshot> {
    let query = sqlConn`
      select id, body
      from zc_entities
      where collection = ${this.parentCollection}
    `;

    for (const c of this.clauses) {
      if (c.field === "ownerUid" && c.op === "==") {
        query = sqlConn`${query} and owner_uid = ${c.value}`;
      } else if (c.op === "==") {
        const path = bodyPathFragment(sqlConn, c.field);
        query = sqlConn`${query} and ${path} = ${c.value}`;
      } else if (c.op === "<=") {
        const path = bodyPathFragment(sqlConn, c.field);
        query = sqlConn`${query} and ${path} <= ${c.value}`;
      }
    }

    if (this.orderSpecs.length > 0) {
      query = sqlConn`${query} order by`;
      for (let i = 0; i < this.orderSpecs.length; i++) {
        const spec = this.orderSpecs[i]!;
        const path = bodyPathFragment(sqlConn, spec.field);
        const dirToken = spec.direction === "desc" ? sqlConn`desc` : sqlConn`asc`;
        query =
          i === 0
            ? sqlConn`${query} ${path} ${dirToken} nulls last`
            : sqlConn`${query}, ${path} ${dirToken} nulls last`;
      }
    }

    if (this.limitCount !== null) {
      query = sqlConn`${query} limit ${this.limitCount}`;
    }

    if (forUpdate) {
      query = sqlConn`${query} for update`;
    }

    const rows = (await query) as unknown as {
      id: string;
      body: Record<string, unknown>;
    }[];

    const docs = rows.map(
      (row) => new PgQueryDocSnapshot(this.rootSql, this.parentCollection, row.id, row.body),
    );

    return new PgQuerySnapshot(docs);
  }

  async get(): Promise<PgQuerySnapshot> {
    return this._getWithSql(this.rootSql, false);
  }
}

export class PgQueryDocSnapshot {
  constructor(
    private readonly rootSql: SqlExecutor,
    readonly parentCollection: string,
    public readonly id: string,
    private readonly payload: Record<string, unknown>,
  ) {}

  data(): Record<string, unknown> {
    return this.payload;
  }

  get ref(): PgDocumentRef {
    return new PgDocumentRef(this.rootSql, this.parentCollection, this.id);
  }
}

export class PgQuerySnapshot {
  constructor(public readonly docs: PgQueryDocSnapshot[]) {}

  get size() {
    return this.docs.length;
  }
}

export class PgCollectionRef {
  constructor(
    private readonly rootSql: SqlExecutor,
    readonly id: string,
  ) {}

  doc(documentId: string): PgDocumentRef {
    return new PgDocumentRef(this.rootSql, this.id, documentId);
  }

  where(field: string, op: "==" | "<=", value: unknown): PgQuery {
    return new PgQuery(this.rootSql, this.id, [{ field, op, value: String(value) }], [], null);
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): PgQuery {
    return new PgQuery(this.rootSql, this.id, [], [{ field, direction }], null);
  }

  limit(n: number): PgQuery {
    return new PgQuery(this.rootSql, this.id, [], [], n);
  }

  async get(): Promise<PgQuerySnapshot> {
    const q = new PgQuery(this.rootSql, this.id, [], [], null);
    return q.get();
  }
}

export class PgTransaction {
  constructor(private readonly txSql: SqlExecutor) {}

  async get(documentRef: PgDocumentRef): Promise<PgDocSnapshot>;
  async get(query: PgQuery): Promise<PgQuerySnapshot>;
  async get(target: PgDocumentRef | PgQuery): Promise<PgDocSnapshot | PgQuerySnapshot> {
    if (target instanceof PgDocumentRef) {
      return target._getWithSql(this.txSql, true);
    }

    return target._getWithSql(this.txSql, true);
  }

  set(ref: PgDocumentRef, data: object, options?: { merge?: boolean }) {
    return ref._setWithSql(this.txSql, data, options);
  }

  delete(ref: PgDocumentRef) {
    return ref._deleteWithSql(this.txSql);
  }
}

export class PgFirestore {
  constructor(private readonly rootSql: SqlExecutor) {}

  collection(name: string): PgCollectionRef {
    return new PgCollectionRef(this.rootSql, name);
  }

  runTransaction<T>(fn: (transaction: PgTransaction) => Promise<T>): Promise<T> {
    return this.rootSql.begin(async (sql) =>
      fn(new PgTransaction(sql as unknown as Sql)),
    ) as Promise<T>;
  }
}

export function getZootopiaFirestore() {
  return new PgFirestore(getZootopiaSql());
}

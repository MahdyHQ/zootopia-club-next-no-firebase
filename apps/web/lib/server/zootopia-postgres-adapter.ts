/**
 * SUPABASE POSTGRES ADAPTER
 *
 * Provides a Supabase Postgres database interface through the `zc_entities` table.
 * The class/API surface uses a document-store pattern (collection/doc/get/set) for
 * compatibility with the repository layer's existing adapter contracts.
 *
 * Active backend: Supabase Postgres (`zc_entities` table via `postgres` client)
 * Data persistence: Supabase Postgres only.
 *
 * Connection strategy
 * ───────────────────
 * • Uses SUPABASE_DATABASE_URL (preferred: port 6543 transaction-mode pooler)
 *   or DATABASE_URL as fallback.
 * • Singleton is stored on `globalThis` so Next.js hot-reloads do NOT create
 *   extra pools and exhaust PgBouncer's session-mode client limit.
 * • `prepare: false` is mandatory for PgBouncer compatibility.
 * • Pool is kept intentionally small (max 3) to stay well inside Supabase's
 *   default pool_size of 15.
 */

import "server-only";

import postgres from "postgres";

import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";

// ─── Types ───────────────────────────────────────────────────────────────────

type Sql = ReturnType<typeof postgres>;
type SqlExecutor = Sql;

export type ZootopiaPersistenceRuntimeState = {
  usingPostgres: boolean;
  hasSupabaseAdminRuntime: boolean;
  hasDatabaseUrl: boolean;
  requiresDurablePersistence: boolean;
  memoryFallbackAllowedInProduction: boolean;
};

type WhereClause = { field: string; op: "==" | "<="; value: string };
type OrderSpec = { field: string; direction: "asc" | "desc" };

// ─── Globals ─────────────────────────────────────────────────────────────────

/**
 * Attaching the singleton to `globalThis` prevents Next.js dev-mode hot reloads
 * from leaking stale connection pools and hitting MaxClientsInSessionMode.
 */
declare global {
  // eslint-disable-next-line no-var
  var __zootopia_sql_singleton__: ReturnType<typeof postgres> | undefined;
}

// ─── Environment helpers ──────────────────────────────────────────────────────

function readDatabaseUrl(): string | null {
  const raw =
    process.env.SUPABASE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";
  return raw.length > 0 ? raw : null;
}

function readBooleanEnvFlag(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isProductionNodeEnv(): boolean {
  return String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

// ─── Public persistence flags ─────────────────────────────────────────────────

export function hasZootopiaPostgresPersistence(): boolean {
  return Boolean(readDatabaseUrl());
}

export function isProductionMemoryFallbackAllowed(): boolean {
  return readBooleanEnvFlag(process.env.ZOOTOPIA_ALLOW_PRODUCTION_MEMORY_FALLBACK);
}

export function requiresDurableZootopiaPersistence(): boolean {
  return isProductionNodeEnv() && !isProductionMemoryFallbackAllowed();
}

export function getZootopiaPersistenceRuntimeState(): ZootopiaPersistenceRuntimeState {
  const hasAdminRuntime = hasSupabaseAdminRuntime();
  const hasDatabaseUrl = hasZootopiaPostgresPersistence();

  return {
    usingPostgres: hasAdminRuntime && hasDatabaseUrl,
    hasSupabaseAdminRuntime: hasAdminRuntime,
    hasDatabaseUrl,
    requiresDurablePersistence: requiresDurableZootopiaPersistence(),
    memoryFallbackAllowedInProduction: isProductionMemoryFallbackAllowed(),
  };
}

export function shouldUseZootopiaPostgresPersistence(): boolean {
  return getZootopiaPersistenceRuntimeState().usingPostgres;
}

// ─── Connection pool ──────────────────────────────────────────────────────────

/**
 * Returns the shared `postgres` SQL client.
 *
 * FIX — MaxClientsInSessionMode
 * ─────────────────────────────
 * 1. Singleton is stored on `globalThis` so it survives Next.js hot reloads.
 *    Previously a new pool was created on every reload, exhausting PgBouncer.
 * 2. `prepare: false` is required when connecting through PgBouncer (Supabase
 *    uses PgBouncer for its connection pooler).
 * 3. `max: 3` keeps total connections well inside Supabase's default pool_size.
 *    Tune upward only on a dedicated/large Supabase plan.
 * 4. Point SUPABASE_DATABASE_URL at port **6543** (transaction-mode pooler)
 *    rather than port 5432 (session mode) for the best concurrency headroom.
 */
export function getZootopiaSql(): Sql {
  if (globalThis.__zootopia_sql_singleton__) {
    return globalThis.__zootopia_sql_singleton__;
  }

  const url = readDatabaseUrl();
  if (!url) {
    throw new Error(
      "ZOOTOPIA_DATABASE_URL_MISSING: set SUPABASE_DATABASE_URL (port 6543 for " +
        "transaction-mode pooler) or DATABASE_URL in your environment.",
    );
  }

  const sql = postgres(url, {
    // ─ Pool size ────────────────────────────────────────────────────────────
    // Keep this at or below (supabase_pool_size / expected_server_instances).
    // Default Supabase pool_size is 15; 3 leaves room for migrations / admin.
    max: 3,

    // ─ PgBouncer compatibility ───────────────────────────────────────────────
    // Named prepared statements are NOT supported in transaction/session pooling.
    prepare: false,

    // ─ Timeouts ─────────────────────────────────────────────────────────────
    idle_timeout: 20,      // seconds before an idle connection is released
    connect_timeout: 15,   // seconds to wait for a new connection

    // ─ Robustness ───────────────────────────────────────────────────────────
    max_lifetime: 1800,    // recycle connections every 30 min (avoids stale sockets)
    connection: {
      application_name: "zootopia-adapter",
    },

    onnotice: () => {
      /* suppress noisy NOTICE messages in production logs */
    },
  });

  // Store on globalThis so Next.js hot reloads reuse the same pool.
  globalThis.__zootopia_sql_singleton__ = sql;

  return sql;
}

// ─── Internal utilities ───────────────────────────────────────────────────────

function safeJsonField(field: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
    throw new Error(`Unsupported JSON field name: "${field}"`);
  }
  return field;
}

function bodyPathFragment(sql: Sql, field: string) {
  const key = safeJsonField(field);
  return sql.unsafe(`body->>'${key}'`);
}

function deriveOwnerUid(collection: string, row: Record<string, unknown>): string | null {
  if (typeof row.ownerUid === "string" && row.ownerUid) return row.ownerUid;
  if (collection === "users" && typeof row.uid === "string" && row.uid) return row.uid;
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
      out[key] = deepMerge(
        bv as Record<string, unknown>,
        pv as Record<string, unknown>,
      );
    } else {
      out[key] = pv;
    }
  }

  return out;
}

// ─── Document reference ───────────────────────────────────────────────────────

export class PgDocumentRef {
  constructor(
    private readonly rootSql: SqlExecutor,
    readonly parentCollection: string,
    readonly id: string,
  ) {}

  async _getWithSql(sql: SqlExecutor, forUpdate: boolean): Promise<PgDocSnapshot> {
    const rows = await sql`
      SELECT id, body
      FROM   zc_entities
      WHERE  collection = ${this.parentCollection}
        AND  id         = ${this.id}
      ${forUpdate ? sql`FOR UPDATE` : sql``}
    `;

    const row = rows[0] as { id: string; body: Record<string, unknown> } | undefined;

    if (!row) {
      return new PgDocSnapshot(this.rootSql, this.parentCollection, this.id, false, null);
    }

    return new PgDocSnapshot(this.rootSql, this.parentCollection, row.id, true, row.body);
  }

  async get(): Promise<PgDocSnapshot> {
    return this._getWithSql(this.rootSql, false);
  }

  async _setWithSql(
    sql: SqlExecutor,
    data: object,
    options?: { merge?: boolean },
  ): Promise<void> {
    const patch = data as Record<string, unknown>;
    let nextBody = patch;

    if (options?.merge === true) {
      const existing = await this._getWithSql(sql, true);
      const prev = existing.exists ? (existing.raw() as Record<string, unknown>) : {};
      nextBody = deepMerge(prev, patch);
    }

    const ownerUid = deriveOwnerUid(this.parentCollection, nextBody);
    const jsonBody = JSON.parse(JSON.stringify(nextBody)) as Record<string, unknown>;

    await sql`
      INSERT INTO zc_entities (collection, id, owner_uid, body, updated_at)
      VALUES (
        ${this.parentCollection},
        ${this.id},
        ${ownerUid},
        ${sql.json(jsonBody as never)},
        NOW()
      )
      ON CONFLICT (collection, id) DO UPDATE SET
        owner_uid  = EXCLUDED.owner_uid,
        body       = EXCLUDED.body,
        updated_at = NOW()
    `;
  }

  async set(data: object, options?: { merge?: boolean }): Promise<void> {
    await this._setWithSql(this.rootSql, data, options);
  }

  async _deleteWithSql(sql: SqlExecutor): Promise<void> {
    await sql`
      DELETE FROM zc_entities
      WHERE  collection = ${this.parentCollection}
        AND  id         = ${this.id}
    `;
  }

  async delete(): Promise<void> {
    await this._deleteWithSql(this.rootSql);
  }
}

// ─── Document snapshot ────────────────────────────────────────────────────────

export class PgDocSnapshot {
  constructor(
    private readonly rootSql: SqlExecutor,
    private readonly parentCollection: string,
    public readonly id: string,
    public readonly exists: boolean,
    private readonly payload: Record<string, unknown> | null,
  ) {}

  /** Raw JSON body as stored (used for merge operations). */
  raw(): Record<string, unknown> {
    if (!this.payload) throw new Error("DOCUMENT_MISSING");
    return this.payload;
  }

  data(): Record<string, unknown> {
    return this.raw();
  }

  get ref(): PgDocumentRef {
    return new PgDocumentRef(this.rootSql, this.parentCollection, this.id);
  }
}

// ─── Query ────────────────────────────────────────────────────────────────────

export class PgQuery {
  constructor(
    private readonly rootSql: SqlExecutor,
    private readonly parentCollection: string,
    private readonly clauses: WhereClause[],
    private readonly orderSpecs: OrderSpec[],
    private readonly limitCount: number | null,
  ) {}

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
    return new PgQuery(
      this.rootSql,
      this.parentCollection,
      this.clauses,
      this.orderSpecs,
      n,
    );
  }

  async _getWithSql(sqlConn: SqlExecutor, forUpdate: boolean): Promise<PgQuerySnapshot> {
    let query = sqlConn`
      SELECT id, body
      FROM   zc_entities
      WHERE  collection = ${this.parentCollection}
    `;

    for (const c of this.clauses) {
      if (c.field === "ownerUid" && c.op === "==") {
        query = sqlConn`${query} AND owner_uid = ${c.value}`;
      } else if (c.op === "==") {
        const path = bodyPathFragment(sqlConn, c.field);
        query = sqlConn`${query} AND ${path} = ${c.value}`;
      } else if (c.op === "<=") {
        const path = bodyPathFragment(sqlConn, c.field);
        query = sqlConn`${query} AND ${path} <= ${c.value}`;
      }
    }

    if (this.orderSpecs.length > 0) {
      query = sqlConn`${query} ORDER BY`;
      for (let i = 0; i < this.orderSpecs.length; i++) {
        const spec = this.orderSpecs[i]!;
        const path = bodyPathFragment(sqlConn, spec.field);
        const dir  = spec.direction === "desc" ? sqlConn`DESC` : sqlConn`ASC`;
        query =
          i === 0
            ? sqlConn`${query} ${path} ${dir} NULLS LAST`
            : sqlConn`${query}, ${path} ${dir} NULLS LAST`;
      }
    }

    if (this.limitCount !== null) {
      query = sqlConn`${query} LIMIT ${this.limitCount}`;
    }

    if (forUpdate) {
      query = sqlConn`${query} FOR UPDATE`;
    }

    const rows = (await query) as unknown as {
      id: string;
      body: Record<string, unknown>;
    }[];

    const docs = rows.map(
      (row) =>
        new PgQueryDocSnapshot(this.rootSql, this.parentCollection, row.id, row.body),
    );

    return new PgQuerySnapshot(docs);
  }

  async get(): Promise<PgQuerySnapshot> {
    return this._getWithSql(this.rootSql, false);
  }
}

// ─── Query snapshots ──────────────────────────────────────────────────────────

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

  get size(): number {
    return this.docs.length;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }
}

// ─── Collection reference ─────────────────────────────────────────────────────

export class PgCollectionRef {
  constructor(
    private readonly rootSql: SqlExecutor,
    readonly id: string,
  ) {}

  doc(documentId: string): PgDocumentRef {
    return new PgDocumentRef(this.rootSql, this.id, documentId);
  }

  where(field: string, op: "==" | "<=", value: unknown): PgQuery {
    return new PgQuery(
      this.rootSql,
      this.id,
      [{ field, op, value: String(value) }],
      [],
      null,
    );
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): PgQuery {
    return new PgQuery(this.rootSql, this.id, [], [{ field, direction }], null);
  }

  limit(n: number): PgQuery {
    return new PgQuery(this.rootSql, this.id, [], [], n);
  }

  async get(): Promise<PgQuerySnapshot> {
    return new PgQuery(this.rootSql, this.id, [], [], null).get();
  }
}

// ─── Transaction ──────────────────────────────────────────────────────────────

export class PgTransaction {
  constructor(private readonly txSql: SqlExecutor) {}

  async get(ref: PgDocumentRef): Promise<PgDocSnapshot>;
  async get(query: PgQuery): Promise<PgQuerySnapshot>;
  async get(
    target: PgDocumentRef | PgQuery,
  ): Promise<PgDocSnapshot | PgQuerySnapshot> {
    if (target instanceof PgDocumentRef) {
      return target._getWithSql(this.txSql, true);
    }
    return target._getWithSql(this.txSql, true);
  }

  set(ref: PgDocumentRef, data: object, options?: { merge?: boolean }): Promise<void> {
    return ref._setWithSql(this.txSql, data, options);
  }

  delete(ref: PgDocumentRef): Promise<void> {
    return ref._deleteWithSql(this.txSql);
  }
}

// ─── Database handle ──────────────────────────────────────────────────────────

/**
 * Postgres database handle with collection / transaction access.
 * Uses a document-store API shape (collection / doc / get / set) for
 * repository-layer compatibility.
 */
export class PgDatabase {
  constructor(private readonly rootSql: SqlExecutor) {}

  collection(name: string): PgCollectionRef {
    return new PgCollectionRef(this.rootSql, name);
  }

  runTransaction<T>(fn: (tx: PgTransaction) => Promise<T>): Promise<T> {
    return this.rootSql.begin(
      async (sql) => fn(new PgTransaction(sql as unknown as Sql)),
    ) as Promise<T>;
  }

  /**
   * Lightweight connectivity check — useful in health-check routes.
   * Returns `true` if the database is reachable, `false` otherwise.
   */
  async ping(): Promise<boolean> {
    try {
      await this.rootSql`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Returns the shared Supabase Postgres database handle.
 *
 * Tip: point SUPABASE_DATABASE_URL at Supabase's **transaction-mode** pooler
 * (port 6543) to maximise concurrent request throughput:
 *   postgres://[user]:[password]@[host]:6543/[db]?pgbouncer=true
 */
export function getZootopiaDatabase(): PgDatabase {
  return new PgDatabase(getZootopiaSql());
}
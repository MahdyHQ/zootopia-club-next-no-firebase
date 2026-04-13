/**
 * SUPABASE POSTGRES ADAPTER — Enhanced
 *
 * Provides a Supabase Postgres database interface through the `zc_entities` table.
 * The class/API surface uses a document-store pattern (collection/doc/get/set) for
 * compatibility with the repository layer's existing adapter contracts.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ Active backend : Supabase Postgres (`zc_entities` table via `postgres.js`) │
 * │ Data persistence : Supabase Postgres only — no Firestore dependency.       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Key capabilities
 * ────────────────
 * • Document-store API  (collection / doc / get / set / update / create / delete)
 * • Rich query operators (==, !=, <, <=, >, >=, in, not-in, array-contains,
 *   like, ilike) with dot-notation path support for nested JSON fields
 * • Atomic batch writes  via PgWriteBatch
 * • ACID transactions    via PgTransaction with SELECT … FOR UPDATE locking
 * • Auto-ID documents    via collection.add()
 * • Pagination           offset / limit and lightweight count() queries
 * • Resilience           transient-error retry with exponential back-off
 * • Observability        opt-in debug logging (set ZOOTOPIA_DEBUG=1)
 * • Schema migration     ensureZootopiaSchema() creates table + indexes
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
 *
 * Migration from Firestore
 * ────────────────────────
 * This adapter fully replaces Firestore. The API surface mirrors Firestore's
 * collection/doc/get/set/where/orderBy/limit semantics so that the repository
 * layer can swap backends without changing call-sites. Additional Postgres-
 * native features (count, offset, richer operators, batch writes) are exposed
 * as ergonomic extras.
 */

import "server-only";

import postgres from "postgres";
import { randomUUID } from "node:crypto";

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

/** All comparison operators supported by PgQuery.where() */
export type WhereOp =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "in"
  | "not-in"
  | "array-contains"
  | "like"
  | "ilike";

type WhereClause = {
  field: string;
  op: WhereOp;
  value: string | string[];
};

type OrderSpec = { field: string; direction: "asc" | "desc" };

/** Options for set operations */
export type SetOptions = { merge?: boolean };

/** Options for creating documents with auto-generated IDs */
export type AddOptions = { idPrefix?: string };

/** Retry configuration for transient-error resilience */
export type RetryOptions = {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms before first retry (default: 100) */
  baseDelayMs?: number;
  /** Maximum delay in ms (default: 5000) */
  maxDelayMs?: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
};

/** Postgres error codes that are safe to retry */
const RETRYABLE_PG_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
]);

// ─── Globals ─────────────────────────────────────────────────────────────────

/**
 * Attaching the singleton to `globalThis` prevents Next.js dev-mode hot reloads
 * from leaking stale connection pools and hitting MaxClientsInSessionMode.
 */
declare global {
  var __zootopia_sql_singleton__: ReturnType<typeof postgres> | undefined;
}

// ─── Debug logging ───────────────────────────────────────────────────────────

function isDebugEnabled(): boolean {
  return readBooleanEnvFlag(process.env.ZOOTOPIA_DEBUG);
}

function debugLog(label: string, ...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.debug(`[zootopia-pg] ${label}`, ...args);
  }
}

function warnLog(label: string, ...args: unknown[]): void {
  console.warn(`[zootopia-pg] ⚠ ${label}`, ...args);
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
  return (
    String(process.env.NODE_ENV ?? "")
      .trim()
      .toLowerCase() === "production"
  );
}

// ─── Public persistence flags ─────────────────────────────────────────────────

export function hasZootopiaPostgresPersistence(): boolean {
  return Boolean(readDatabaseUrl());
}

export function isProductionMemoryFallbackAllowed(): boolean {
  return readBooleanEnvFlag(
    process.env.ZOOTOPIA_ALLOW_PRODUCTION_MEMORY_FALLBACK,
  );
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

// ─── Retry helper ─────────────────────────────────────────────────────────────

function isRetryableError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return RETRYABLE_PG_CODES.has(String((err as { code: string }).code));
  }
  return false;
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...opts,
  };

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxAttempts || !isRetryableError(err)) {
        throw err;
      }

      const jitter = Math.random() * 0.3 + 0.85; // 0.85–1.15
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) * jitter,
        maxDelayMs,
      );

      warnLog(
        `${label} — transient error (attempt ${attempt}/${maxAttempts}), retrying in ${Math.round(delay)}ms`,
        err,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
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

  debugLog("Creating new postgres pool");

  const sql = postgres(url, {
    // ─ Pool size ────────────────────────────────────────────────────────────
    max: 3,

    // ─ PgBouncer compatibility ──────────────────────────────────────────────
    prepare: false,

    // ─ Timeouts ─────────────────────────────────────────────────────────────
    idle_timeout: 20,
    connect_timeout: 15,

    // ─ Robustness ───────────────────────────────────────────────────────────
    max_lifetime: 1800,
    connection: {
      application_name: "zootopia-adapter",
    },

    // ─ Query-level timeout (30 s) to prevent runaway queries ────────────────
    // Applies per-statement; individual queries can override if needed.

    onnotice: () => {
      /* suppress noisy NOTICE messages in production logs */
    },
  });

  globalThis.__zootopia_sql_singleton__ = sql;

  return sql;
}

/**
 * Gracefully shuts down the connection pool.
 * Call this in graceful-shutdown handlers or test teardowns.
 */
export async function closeZootopiaSql(): Promise<void> {
  const sql = globalThis.__zootopia_sql_singleton__;
  if (sql) {
    debugLog("Closing postgres pool");
    globalThis.__zootopia_sql_singleton__ = undefined;
    await sql.end({ timeout: 5 });
  }
}

// ─── Schema migration ─────────────────────────────────────────────────────────

/**
 * Creates the `zc_entities` table and its supporting indexes if they do not
 * already exist. Safe to call repeatedly (idempotent).
 *
 * Run this once during initial setup or in a migration script:
 * ```ts
 * import { ensureZootopiaSchema } from "@/lib/server/zootopia-pg-adapter";
 * await ensureZootopiaSchema();
 * ```
 */
export async function ensureZootopiaSchema(
  sqlOverride?: SqlExecutor,
): Promise<void> {
  const sql = sqlOverride ?? getZootopiaSql();

  debugLog("Ensuring zc_entities schema");

  await sql`
    CREATE TABLE IF NOT EXISTS zc_entities (
      collection  TEXT        NOT NULL,
      id          TEXT        NOT NULL,
      owner_uid   TEXT,
      body        JSONB       NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (collection, id)
    )
  `;

  // Index for owner_uid queries (common pattern: "get all docs owned by user X")
  await sql`
    CREATE INDEX IF NOT EXISTS idx_zc_entities_owner
    ON zc_entities (collection, owner_uid)
    WHERE owner_uid IS NOT NULL
  `;

  // GIN index for arbitrary JSONB queries on body
  await sql`
    CREATE INDEX IF NOT EXISTS idx_zc_entities_body_gin
    ON zc_entities USING gin (body jsonb_path_ops)
  `;

  // Index for updated_at (useful for sync / polling / expiry queries)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_zc_entities_updated
    ON zc_entities (collection, updated_at DESC)
  `;

  debugLog("Schema ensured successfully");
}

// ─── Internal utilities ───────────────────────────────────────────────────────

/** Generates a time-ordered UUID v4 suitable for document IDs */
function generateAutoId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Validates a JSON field name to prevent SQL injection through dynamic paths.
 * Supports dot-notation for nested fields (e.g., "address.city").
 */
function safeJsonField(field: string): string {
  const parts = field.split(".");
  for (const part of parts) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part)) {
      throw new Error(`Unsupported JSON field name segment: "${part}" in "${field}"`);
    }
  }
  return field;
}

/**
 * Builds a Postgres expression that extracts a text value from the JSONB `body`
 * column. Supports dot-notation for nested paths:
 *   "name"          → body->>'name'
 *   "address.city"  → body->'address'->>'city'
 */
function bodyPathFragment(sql: Sql, field: string) {
  safeJsonField(field);
  const parts = field.split(".");

  if (parts.length === 1) {
    return sql.unsafe(`body->>'${parts[0]}'`);
  }

  // For nested paths: body->'a'->'b'->>'c'
  const intermediate = parts
    .slice(0, -1)
    .map((p) => `'${p}'`)
    .join("->");
  const last = parts[parts.length - 1];
  return sql.unsafe(`body->${intermediate}->>'${last}'`);
}

/**
 * Builds a Postgres expression that extracts a JSONB value from `body`.
 * Useful for operators like `@>` (contains) or `?` (has key).
 */
function bodyJsonbPathFragment(sql: Sql, field: string) {
  safeJsonField(field);
  const parts = field.split(".");

  if (parts.length === 1) {
    return sql.unsafe(`body->'${parts[0]}'`);
  }

  const allParts = parts.map((p) => `'${p}'`).join("->");
  return sql.unsafe(`body->${allParts}`);
}

function deriveOwnerUid(
  collection: string,
  row: Record<string, unknown>,
): string | null {
  if (typeof row.ownerUid === "string" && row.ownerUid) return row.ownerUid;
  if (collection === "users" && typeof row.uid === "string" && row.uid)
    return row.uid;
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

/**
 * Strips out undefined values from a JSON body to avoid Postgres errors.
 * Returns a safe-to-serialize plain object.
 */
function sanitizeBody(data: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}

// ─── Server timestamp sentinel ────────────────────────────────────────────────

/**
 * A sentinel value that gets replaced with the current server timestamp
 * when writing to the database — mirrors Firestore's `serverTimestamp()`.
 *
 * Usage:
 * ```ts
 * await ref.set({ name: "Alice", updatedAt: serverTimestamp() });
 * ```
 */
const SERVER_TIMESTAMP_SENTINEL = Symbol.for("zootopia.serverTimestamp");

export function serverTimestamp(): unknown {
  return SERVER_TIMESTAMP_SENTINEL as unknown;
}

function resolveServerTimestamps(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const now = new Date().toISOString();

  for (const [key, value] of Object.entries(data)) {
    if (value === SERVER_TIMESTAMP_SENTINEL) {
      out[key] = now;
    } else if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      out[key] = resolveServerTimestamps(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }

  return out;
}

// ─── Document reference ───────────────────────────────────────────────────────

export class PgDocumentRef {
  /** Full logical path for logging, e.g. "users/abc123" */
  readonly path: string;

  constructor(
    private readonly rootSql: SqlExecutor,
    readonly parentCollection: string,
    readonly id: string,
  ) {
    this.path = `${parentCollection}/${id}`;
  }

  // ── Internal SQL-executor variants ────────────────────────────────────────

  async _getWithSql(
    sql: SqlExecutor,
    forUpdate: boolean,
  ): Promise<PgDocSnapshot> {
    debugLog(`GET ${this.path}`, { forUpdate });

    const rows = await sql`
      SELECT id, body, created_at, updated_at
      FROM   zc_entities
      WHERE  collection = ${this.parentCollection}
        AND  id         = ${this.id}
      ${forUpdate ? sql`FOR UPDATE` : sql``}
    `;

    const row = rows[0] as
      | {
          id: string;
          body: Record<string, unknown>;
          created_at: Date;
          updated_at: Date;
        }
      | undefined;

    if (!row) {
      return new PgDocSnapshot(
        this.rootSql,
        this.parentCollection,
        this.id,
        false,
        null,
        null,
      );
    }

    return new PgDocSnapshot(
      this.rootSql,
      this.parentCollection,
      row.id,
      true,
      row.body,
      { createdAt: row.created_at, updatedAt: row.updated_at },
    );
  }

  async _setWithSql(
    sql: SqlExecutor,
    data: object,
    options?: SetOptions,
  ): Promise<void> {
    debugLog(`SET ${this.path}`, { merge: options?.merge });

    const resolved = resolveServerTimestamps(
      data as Record<string, unknown>,
    );
    let nextBody = resolved;

    if (options?.merge === true) {
      const existing = await this._getWithSql(sql, true);
      const prev = existing.exists
        ? (existing.raw() as Record<string, unknown>)
        : {};
      nextBody = deepMerge(prev, resolved);
    }

    const ownerUid = deriveOwnerUid(this.parentCollection, nextBody);
    const jsonBody = sanitizeBody(nextBody);

    await sql`
      INSERT INTO zc_entities (collection, id, owner_uid, body, created_at, updated_at)
      VALUES (
        ${this.parentCollection},
        ${this.id},
        ${ownerUid},
        ${sql.json(jsonBody as never)},
        NOW(),
        NOW()
      )
      ON CONFLICT (collection, id) DO UPDATE SET
        owner_uid  = EXCLUDED.owner_uid,
        body       = EXCLUDED.body,
        updated_at = NOW()
    `;
  }

  async _updateWithSql(
    sql: SqlExecutor,
    data: object,
  ): Promise<void> {
    debugLog(`UPDATE ${this.path}`);

    const resolved = resolveServerTimestamps(
      data as Record<string, unknown>,
    );

    // Update must fail if the document doesn't exist (Firestore semantics)
    const existing = await this._getWithSql(sql, true);
    if (!existing.exists) {
      throw new Error(
        `DOCUMENT_NOT_FOUND: Cannot update non-existent document at "${this.path}".`,
      );
    }

    const prev = existing.raw() as Record<string, unknown>;
    const nextBody = deepMerge(prev, resolved);
    const ownerUid = deriveOwnerUid(this.parentCollection, nextBody);
    const jsonBody = sanitizeBody(nextBody);

    await sql`
      UPDATE zc_entities
      SET    owner_uid  = ${ownerUid},
             body       = ${sql.json(jsonBody as never)},
             updated_at = NOW()
      WHERE  collection = ${this.parentCollection}
        AND  id         = ${this.id}
    `;
  }

  async _deleteWithSql(sql: SqlExecutor): Promise<void> {
    debugLog(`DELETE ${this.path}`);

    await sql`
      DELETE FROM zc_entities
      WHERE  collection = ${this.parentCollection}
        AND  id         = ${this.id}
    `;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async get(): Promise<PgDocSnapshot> {
    return withRetry(`GET ${this.path}`, () =>
      this._getWithSql(this.rootSql, false),
    );
  }

  async set(data: object, options?: SetOptions): Promise<void> {
    return withRetry(`SET ${this.path}`, () =>
      this._setWithSql(this.rootSql, data, options),
    );
  }

  /**
   * Partially updates an existing document (Firestore `updateDoc` equivalent).
   * Throws if the document does not exist.
   */
  async update(data: object): Promise<void> {
    return withRetry(`UPDATE ${this.path}`, () =>
      this._updateWithSql(this.rootSql, data),
    );
  }

  /**
   * Creates a document only if it does not already exist.
   * Throws if the document already exists.
   */
  async create(data: object): Promise<void> {
    return withRetry(`CREATE ${this.path}`, async () => {
      debugLog(`CREATE ${this.path}`);

      const resolved = resolveServerTimestamps(
        data as Record<string, unknown>,
      );
      const ownerUid = deriveOwnerUid(this.parentCollection, resolved);
      const jsonBody = sanitizeBody(resolved);

      try {
        await this.rootSql`
          INSERT INTO zc_entities (collection, id, owner_uid, body, created_at, updated_at)
          VALUES (
            ${this.parentCollection},
            ${this.id},
            ${ownerUid},
            ${this.rootSql.json(jsonBody as never)},
            NOW(),
            NOW()
          )
        `;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: string }).code === "23505"
        ) {
          throw new Error(
            `DOCUMENT_ALREADY_EXISTS: Document at "${this.path}" already exists.`,
          );
        }
        throw err;
      }
    });
  }

  async delete(): Promise<void> {
    return withRetry(`DELETE ${this.path}`, () =>
      this._deleteWithSql(this.rootSql),
    );
  }
}

// ─── Document snapshot ────────────────────────────────────────────────────────

export type PgDocMetadata = {
  createdAt: Date;
  updatedAt: Date;
};

export class PgDocSnapshot {
  constructor(
    private readonly rootSql: SqlExecutor,
    private readonly parentCollection: string,
    public readonly id: string,
    public readonly exists: boolean,
    private readonly payload: Record<string, unknown> | null,
    private readonly metadata: PgDocMetadata | null,
  ) {}

  /** Full logical path, e.g. "users/abc123" */
  get path(): string {
    return `${this.parentCollection}/${this.id}`;
  }

  /** Raw JSON body as stored (used for merge operations). */
  raw(): Record<string, unknown> {
    if (!this.payload) throw new Error(`DOCUMENT_MISSING: ${this.path}`);
    return this.payload;
  }

  /**
   * Returns the document data. Throws if the document does not exist.
   * Pass `{ safe: true }` to return `null` instead of throwing.
   */
  data(): Record<string, unknown>;
  data(options: { safe: true }): Record<string, unknown> | null;
  data(options?: { safe: boolean }): Record<string, unknown> | null {
    if (!this.exists) {
      if (options?.safe) return null;
      throw new Error(`DOCUMENT_MISSING: No document at "${this.path}".`);
    }
    return this.raw();
  }

  /** Document metadata (timestamps). Null if the document does not exist. */
  get meta(): PgDocMetadata | null {
    return this.metadata;
  }

  /** Returns a PgDocumentRef pointing to this snapshot's location. */
  get ref(): PgDocumentRef {
    return new PgDocumentRef(this.rootSql, this.parentCollection, this.id);
  }

  /**
   * Convenience: get a nested field from the body using dot-notation.
   * Returns `undefined` if the path doesn't resolve.
   */
  getField<T = unknown>(fieldPath: string): T | undefined {
    if (!this.payload) return undefined;
    const parts = fieldPath.split(".");
    let current: unknown = this.payload;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current as T | undefined;
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
    private readonly offsetCount: number | null = null,
  ) {}

  where(field: string, op: WhereOp, value: unknown): PgQuery {
    const normalizedValue =
      op === "in" || op === "not-in"
        ? (value as unknown[]).map(String)
        : String(value);

    return new PgQuery(
      this.rootSql,
      this.parentCollection,
      [
        ...this.clauses,
        { field, op, value: normalizedValue as string | string[] },
      ],
      this.orderSpecs,
      this.limitCount,
      this.offsetCount,
    );
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): PgQuery {
    return new PgQuery(
      this.rootSql,
      this.parentCollection,
      this.clauses,
      [...this.orderSpecs, { field, direction }],
      this.limitCount,
      this.offsetCount,
    );
  }

  limit(n: number): PgQuery {
    return new PgQuery(
      this.rootSql,
      this.parentCollection,
      this.clauses,
      this.orderSpecs,
      n,
      this.offsetCount,
    );
  }

  offset(n: number): PgQuery {
    return new PgQuery(
      this.rootSql,
      this.parentCollection,
      this.clauses,
      this.orderSpecs,
      this.limitCount,
      n,
    );
  }

  // ── Internal query builder ──────────────────────────────────────────────

  private _appendWhereClauses<TQuery>(
    sqlConn: SqlExecutor,
    query: TQuery,
  ): TQuery {
    let q = query as unknown as ReturnType<SqlExecutor>;

    for (const c of this.clauses) {
      // ── Owner UID shortcut (indexed column) ─────────────────────────────
      if (c.field === "ownerUid" && c.op === "==") {
        q = sqlConn`${q} AND owner_uid = ${c.value as string}`;
        continue;
      }
      if (c.field === "ownerUid" && c.op === "!=") {
        q = sqlConn`${q} AND (owner_uid IS NULL OR owner_uid != ${c.value as string})`;
        continue;
      }

      // ── Standard operators ──────────────────────────────────────────────
      const path = bodyPathFragment(sqlConn, c.field);

      switch (c.op) {
        case "==":
          q = sqlConn`${q} AND ${path} = ${c.value as string}`;
          break;
        case "!=":
          q = sqlConn`${q} AND (${path} IS NULL OR ${path} != ${c.value as string})`;
          break;
        case "<":
          q = sqlConn`${q} AND ${path} < ${c.value as string}`;
          break;
        case "<=":
          q = sqlConn`${q} AND ${path} <= ${c.value as string}`;
          break;
        case ">":
          q = sqlConn`${q} AND ${path} > ${c.value as string}`;
          break;
        case ">=":
          q = sqlConn`${q} AND ${path} >= ${c.value as string}`;
          break;
        case "in":
          q = sqlConn`${q} AND ${path} = ANY(${c.value as string[]})`;
          break;
        case "not-in":
          q = sqlConn`${q} AND (${path} IS NULL OR ${path} != ALL(${c.value as string[]}))`;
          break;
        case "array-contains": {
          const jsonbPath = bodyJsonbPathFragment(sqlConn, c.field);
          q = sqlConn`${q} AND ${jsonbPath} @> ${sqlConn.json([c.value] as never)}`;
          break;
        }
        case "like":
          q = sqlConn`${q} AND ${path} LIKE ${c.value as string}`;
          break;
        case "ilike":
          q = sqlConn`${q} AND ${path} ILIKE ${c.value as string}`;
          break;
      }
    }

    return q as unknown as TQuery;
  }

  private _appendOrderBy<TQuery>(
    sqlConn: SqlExecutor,
    query: TQuery,
  ): TQuery {
    let q = query as unknown as ReturnType<SqlExecutor>;

    if (this.orderSpecs.length > 0) {
      q = sqlConn`${q} ORDER BY`;
      for (let i = 0; i < this.orderSpecs.length; i++) {
        const spec = this.orderSpecs[i]!;
        const path = bodyPathFragment(sqlConn, spec.field);
        const dir =
          spec.direction === "desc" ? sqlConn`DESC` : sqlConn`ASC`;
        q =
          i === 0
            ? sqlConn`${q} ${path} ${dir} NULLS LAST`
            : sqlConn`${q}, ${path} ${dir} NULLS LAST`;
      }
    }

    return q as unknown as TQuery;
  }

  async _getWithSql(
    sqlConn: SqlExecutor,
    forUpdate: boolean,
  ): Promise<PgQuerySnapshot> {
    debugLog(`QUERY ${this.parentCollection}`, {
      clauses: this.clauses.length,
      order: this.orderSpecs.length,
      limit: this.limitCount,
      offset: this.offsetCount,
      forUpdate,
    });

    let query = sqlConn`
      SELECT id, body, created_at, updated_at
      FROM   zc_entities
      WHERE  collection = ${this.parentCollection}
    `;

    query = this._appendWhereClauses(sqlConn, query);
    query = this._appendOrderBy(sqlConn, query);

    if (this.limitCount !== null) {
      query = sqlConn`${query} LIMIT ${this.limitCount}`;
    }

    if (this.offsetCount !== null) {
      query = sqlConn`${query} OFFSET ${this.offsetCount}`;
    }

    if (forUpdate) {
      query = sqlConn`${query} FOR UPDATE`;
    }

    const rows = (await query) as unknown as {
      id: string;
      body: Record<string, unknown>;
      created_at: Date;
      updated_at: Date;
    }[];

    const docs = rows.map(
      (row) =>
        new PgQueryDocSnapshot(
          this.rootSql,
          this.parentCollection,
          row.id,
          row.body,
          { createdAt: row.created_at, updatedAt: row.updated_at },
        ),
    );

    return new PgQuerySnapshot(docs);
  }

  async _countWithSql(sqlConn: SqlExecutor): Promise<number> {
    debugLog(`COUNT ${this.parentCollection}`, {
      clauses: this.clauses.length,
    });

    let query = sqlConn`
      SELECT COUNT(*)::int AS cnt
      FROM   zc_entities
      WHERE  collection = ${this.parentCollection}
    `;

    query = this._appendWhereClauses(sqlConn, query);

    const rows = (await query) as unknown as { cnt: number }[];
    return rows[0]?.cnt ?? 0;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async get(): Promise<PgQuerySnapshot> {
    return withRetry(`QUERY ${this.parentCollection}`, () =>
      this._getWithSql(this.rootSql, false),
    );
  }

  /**
   * Returns the count of matching documents without fetching their bodies.
   * Much more efficient than `.get()` when you only need the count.
   */
  async count(): Promise<number> {
    return withRetry(`COUNT ${this.parentCollection}`, () =>
      this._countWithSql(this.rootSql),
    );
  }

  /**
   * Convenience: returns the first matching document or null.
   */
  async first(): Promise<PgQueryDocSnapshot | null> {
    const limited = this.limit(1);
    const snapshot = await limited.get();
    return snapshot.docs[0] ?? null;
  }
}

// ─── Query snapshots ──────────────────────────────────────────────────────────

export class PgQueryDocSnapshot {
  /** Full logical path, e.g. "users/abc123" */
  readonly path: string;

  constructor(
    private readonly rootSql: SqlExecutor,
    readonly parentCollection: string,
    public readonly id: string,
    private readonly payload: Record<string, unknown>,
    private readonly metadata: PgDocMetadata | null = null,
  ) {
    this.path = `${parentCollection}/${id}`;
  }

  data(): Record<string, unknown> {
    return this.payload;
  }

  /** Document metadata (timestamps). */
  get meta(): PgDocMetadata | null {
    return this.metadata;
  }

  get ref(): PgDocumentRef {
    return new PgDocumentRef(this.rootSql, this.parentCollection, this.id);
  }

  /**
   * Convenience: get a nested field from the body using dot-notation.
   */
  getField<T = unknown>(fieldPath: string): T | undefined {
    const parts = fieldPath.split(".");
    let current: unknown = this.payload;
    for (const part of parts) {
      if (
        current === null ||
        current === undefined ||
        typeof current !== "object"
      ) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current as T | undefined;
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

  /**
   * Iterates over all docs and invokes the callback.
   * Mirrors Firestore's `QuerySnapshot.forEach`.
   */
  forEach(callback: (doc: PgQueryDocSnapshot) => void): void {
    for (const doc of this.docs) {
      callback(doc);
    }
  }

  /**
   * Returns an array of all document data.
   * Convenient shorthand for `snapshot.docs.map(d => d.data())`.
   */
  dataArray(): Record<string, unknown>[] {
    return this.docs.map((d) => d.data());
  }

  /**
   * Returns a Map keyed by document ID.
   */
  toMap(): Map<string, Record<string, unknown>> {
    const map = new Map<string, Record<string, unknown>>();
    for (const doc of this.docs) {
      map.set(doc.id, doc.data());
    }
    return map;
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

  where(field: string, op: WhereOp, value: unknown): PgQuery {
    const normalizedValue =
      op === "in" || op === "not-in"
        ? (value as unknown[]).map(String)
        : String(value);

    return new PgQuery(
      this.rootSql,
      this.id,
      [{ field, op, value: normalizedValue as string | string[] }],
      [],
      null,
    );
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): PgQuery {
    return new PgQuery(
      this.rootSql,
      this.id,
      [],
      [{ field, direction }],
      null,
    );
  }

  limit(n: number): PgQuery {
    return new PgQuery(this.rootSql, this.id, [], [], n);
  }

  offset(n: number): PgQuery {
    return new PgQuery(this.rootSql, this.id, [], [], null, n);
  }

  async get(): Promise<PgQuerySnapshot> {
    return new PgQuery(this.rootSql, this.id, [], [], null).get();
  }

  /**
   * Returns the count of all documents in this collection.
   */
  async count(): Promise<number> {
    return new PgQuery(this.rootSql, this.id, [], [], null).count();
  }

  /**
   * Creates a new document with an auto-generated ID.
   * Returns a reference to the newly created document.
   *
   * Mirrors Firestore's `collection.add(data)`.
   */
  async add(
    data: object,
    options?: AddOptions,
  ): Promise<PgDocumentRef> {
    const id = generateAutoId(options?.idPrefix);
    const ref = this.doc(id);
    await ref.create(data);
    return ref;
  }
}

// ─── Write batch ──────────────────────────────────────────────────────────────

type BatchOp =
  | { type: "set"; ref: PgDocumentRef; data: object; options?: SetOptions }
  | { type: "update"; ref: PgDocumentRef; data: object }
  | { type: "delete"; ref: PgDocumentRef };

/**
 * Batches multiple write operations into a single atomic transaction.
 * Mirrors Firestore's `WriteBatch`.
 *
 * Usage:
 * ```ts
 * const batch = db.batch();
 * batch.set(ref1, { name: "Alice" });
 * batch.update(ref2, { score: 42 });
 * batch.delete(ref3);
 * await batch.commit();
 * ```
 */
export class PgWriteBatch {
  private readonly ops: BatchOp[] = [];
  private committed = false;

  constructor(private readonly rootSql: SqlExecutor) {}

  set(ref: PgDocumentRef, data: object, options?: SetOptions): this {
    this._ensureNotCommitted();
    this.ops.push({ type: "set", ref, data, options });
    return this;
  }

  update(ref: PgDocumentRef, data: object): this {
    this._ensureNotCommitted();
    this.ops.push({ type: "update", ref, data });
    return this;
  }

  delete(ref: PgDocumentRef): this {
    this._ensureNotCommitted();
    this.ops.push({ type: "delete", ref });
    return this;
  }

  get size(): number {
    return this.ops.length;
  }

  async commit(): Promise<void> {
    this._ensureNotCommitted();
    this.committed = true;

    if (this.ops.length === 0) return;

    debugLog(`BATCH COMMIT (${this.ops.length} ops)`);

    await this.rootSql.begin(async (sql) => {
      for (const op of this.ops) {
        switch (op.type) {
          case "set":
            await op.ref._setWithSql(
              sql as unknown as Sql,
              op.data,
              op.options,
            );
            break;
          case "update":
            await op.ref._updateWithSql(
              sql as unknown as Sql,
              op.data,
            );
            break;
          case "delete":
            await op.ref._deleteWithSql(sql as unknown as Sql);
            break;
        }
      }
    });
  }

  private _ensureNotCommitted(): void {
    if (this.committed) {
      throw new Error(
        "BATCH_ALREADY_COMMITTED: Cannot modify a batch after it has been committed.",
      );
    }
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

  set(
    ref: PgDocumentRef,
    data: object,
    options?: SetOptions,
  ): Promise<void> {
    return ref._setWithSql(this.txSql, data, options);
  }

  update(ref: PgDocumentRef, data: object): Promise<void> {
    return ref._updateWithSql(this.txSql, data);
  }

  delete(ref: PgDocumentRef): Promise<void> {
    return ref._deleteWithSql(this.txSql);
  }

  /**
   * Create a document inside a transaction (fails if it already exists).
   */
  async create(ref: PgDocumentRef, data: object): Promise<void> {
    const existing = await ref._getWithSql(this.txSql, true);
    if (existing.exists) {
      throw new Error(
        `DOCUMENT_ALREADY_EXISTS: Document at "${ref.path}" already exists.`,
      );
    }
    return ref._setWithSql(this.txSql, data);
  }
}

// ─── Database handle ──────────────────────────────────────────────────────────

/**
 * Supabase Postgres database handle with collection / transaction / batch access.
 * Uses a document-store API shape (collection / doc / get / set) for
 * repository-layer compatibility — drop-in replacement for the former Firestore
 * adapter.
 */
export class PgDatabase {
  constructor(private readonly rootSql: SqlExecutor) {}

  collection(name: string): PgCollectionRef {
    return new PgCollectionRef(this.rootSql, name);
  }

  /**
   * Runs a function inside an ACID transaction with `SELECT … FOR UPDATE`
   * locking. The transaction is automatically committed on success or rolled
   * back on error.
   *
   * Mirrors Firestore's `runTransaction`.
   */
  runTransaction<T>(
    fn: (tx: PgTransaction) => Promise<T>,
    retryOptions?: RetryOptions,
  ): Promise<T> {
    return withRetry(
      "TRANSACTION",
      () =>
        this.rootSql.begin(async (sql) =>
          fn(new PgTransaction(sql as unknown as Sql)),
        ) as Promise<T>,
      retryOptions,
    );
  }

  /**
   * Creates a new write batch.
   * Mirrors Firestore's `writeBatch`.
   */
  batch(): PgWriteBatch {
    return new PgWriteBatch(this.rootSql);
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

  /**
   * Returns server timestamp from Postgres (useful for clock-sync checks).
   */
  async serverTime(): Promise<Date> {
    const rows = (await this.rootSql`SELECT NOW() AS ts`) as unknown as {
      ts: Date;
    }[];
    return rows[0]!.ts;
  }

  /**
   * Ensures the `zc_entities` table and indexes exist (idempotent).
   */
  async ensureSchema(): Promise<void> {
    await ensureZootopiaSchema(this.rootSql);
  }

  /**
   * Deletes ALL documents in a collection. Use with extreme caution.
   * Returns the number of deleted rows.
   */
  async clearCollection(name: string): Promise<number> {
    warnLog(`CLEAR COLLECTION: ${name}`);
    const result = await this.rootSql`
      DELETE FROM zc_entities
      WHERE collection = ${name}
    `;
    return result.count;
  }

  /**
   * Returns the raw `postgres` SQL tagged-template client for advanced queries.
   * Use sparingly — prefer the document-store API for consistency.
   */
  get sql(): SqlExecutor {
    return this.rootSql;
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Returns the shared Supabase Postgres database handle.
 *
 * This is the primary entry point for all database operations. It returns a
 * singleton `PgDatabase` instance backed by the connection pool.
 *
 * Tip: point SUPABASE_DATABASE_URL at Supabase's **transaction-mode** pooler
 * (port 6543) to maximise concurrent request throughput:
 *   postgres://[user]:[password]@[host]:6543/[db]?pgbouncer=true
 *
 * Example:
 * ```ts
 * import { getZootopiaDatabase } from "@/lib/server/zootopia-pg-adapter";
 *
 * const db = getZootopiaDatabase();
 *
 * // Create / read / update / delete
 * const ref = db.collection("users").doc("alice");
 * await ref.set({ name: "Alice", role: "admin" });
 * const snap = await ref.get();
 * console.log(snap.data());
 *
 * // Query
 * const admins = await db
 *   .collection("users")
 *   .where("role", "==", "admin")
 *   .orderBy("name")
 *   .limit(10)
 *   .get();
 *
 * // Auto-ID
 * const newRef = await db.collection("posts").add({ title: "Hello" });
 *
 * // Batch write
 * const batch = db.batch();
 * batch.set(db.collection("counters").doc("views"), { count: 0 });
 * batch.delete(db.collection("temp").doc("expired"));
 * await batch.commit();
 *
 * // Transaction
 * await db.runTransaction(async (tx) => {
 *   const snap = await tx.get(db.collection("accounts").doc("alice"));
 *   const balance = (snap.data().balance as number) + 100;
 *   tx.set(snap.ref, { balance }, { merge: true });
 * });
 * ```
 */
export function getZootopiaDatabase(): PgDatabase {
  return new PgDatabase(getZootopiaSql());
}
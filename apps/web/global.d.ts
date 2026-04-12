import type postgres from "postgres";

declare global {
  // Keep a single Postgres client on globalThis so Next.js hot reloads do not create extra pools.
  var __zootopia_sql_singleton__: ReturnType<typeof postgres> | undefined;
}

export {};

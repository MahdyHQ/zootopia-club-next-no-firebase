# apps/api

Future extraction target for standalone backend responsibilities.

The current runtime keeps active traffic inside `apps/web` route handlers so the monorepo still has one canonical Next.js app while preserving `apps/api` as a deliberate future backend boundary.

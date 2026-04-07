import "server-only";

type RateLimitWindow = {
  count: number;
  resetAtMs: number;
};

type RateLimitStore = Map<string, RateLimitWindow>;

type RateLimitInput = {
  request: Request;
  scope: string;
  maxRequests: number;
  windowMs: number;
};

type RateLimitAllowed = {
  allowed: true;
  remaining: number;
  resetAtMs: number;
};

type RateLimitBlocked = {
  allowed: false;
  retryAfterSeconds: number;
  resetAtMs: number;
};

export type RateLimitResult = RateLimitAllowed | RateLimitBlocked;

const RATE_LIMIT_STORE_PRUNE_THRESHOLD = 2000;

declare global {
  var __ZOOTOPIA_RATE_LIMIT_STORE__: RateLimitStore | undefined;
}

function getRateLimitStore() {
  if (!globalThis.__ZOOTOPIA_RATE_LIMIT_STORE__) {
    globalThis.__ZOOTOPIA_RATE_LIMIT_STORE__ = new Map();
  }

  return globalThis.__ZOOTOPIA_RATE_LIMIT_STORE__;
}

function getForwardedIp(value: string | null) {
  if (!value) {
    return "";
  }

  return value.split(",")[0]?.trim() ?? "";
}

function buildClientFingerprint(request: Request) {
  const ip =
    getForwardedIp(request.headers.get("x-forwarded-for")) ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown-ip";
  const userAgent = request.headers.get("user-agent")?.trim() || "unknown-agent";

  return `${ip}|${userAgent.slice(0, 120)}`;
}

function pruneExpiredWindows(store: RateLimitStore, nowMs: number) {
  if (store.size < RATE_LIMIT_STORE_PRUNE_THRESHOLD) {
    return;
  }

  for (const [key, window] of store) {
    if (window.resetAtMs <= nowMs) {
      store.delete(key);
    }
  }
}

/* This guard is intentionally lightweight and in-memory. It adds request-throttling friction
   for auth surfaces without changing the existing server-authoritative session model.
   Future agents should preserve the server-side gate (and can later move to Redis/managed limits
   if global cross-instance rate limits become a requirement). */
export function checkRequestRateLimit(input: RateLimitInput): RateLimitResult {
  const nowMs = Date.now();
  const store = getRateLimitStore();
  pruneExpiredWindows(store, nowMs);

  const key = `${input.scope}:${buildClientFingerprint(input.request)}`;
  const currentWindow = store.get(key);

  if (!currentWindow || currentWindow.resetAtMs <= nowMs) {
    const resetAtMs = nowMs + input.windowMs;
    const remaining = Math.max(0, input.maxRequests - 1);
    store.set(key, {
      count: 1,
      resetAtMs,
    });

    return {
      allowed: true,
      remaining,
      resetAtMs,
    };
  }

  if (currentWindow.count >= input.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((currentWindow.resetAtMs - nowMs) / 1000)),
      resetAtMs: currentWindow.resetAtMs,
    };
  }

  currentWindow.count += 1;
  store.set(key, currentWindow);

  return {
    allowed: true,
    remaining: Math.max(0, input.maxRequests - currentWindow.count),
    resetAtMs: currentWindow.resetAtMs,
  };
}

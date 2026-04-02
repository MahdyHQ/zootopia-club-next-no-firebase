import { apiAppDescriptor } from "./app.js";

export function describeApiRuntime() {
  return `Phase-1 runtime is owned by apps/web route handlers. ${apiAppDescriptor.name} remains a thin future extraction boundary.`;
}

if (process.argv[1]?.endsWith("server.js")) {
  process.stdout.write(`${describeApiRuntime()}\n`);
}

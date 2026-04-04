import "server-only";

import { hasFirebaseAdminRuntime } from "@/lib/server/firebase-admin";

export function hasGoogleAiRuntime() {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

export function hasQwenRuntime() {
  return Boolean(process.env.DASHSCOPE_API_KEY);
}

export function getRuntimeFlags() {
  return {
    firebaseAdmin: hasFirebaseAdminRuntime(),
    googleAi: hasGoogleAiRuntime(),
    qwen: hasQwenRuntime(),
  };
}

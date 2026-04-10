import type { ApiFailure, ApiFieldErrors, ApiSuccess } from "@zootopia/shared-types";
import { NextResponse } from "next/server";

export function applyNoStore<T extends NextResponse>(response: T): T {
  /* Auth/session JSON payloads must never be cached by intermediary layers.
     This helper is applied selectively by auth route handlers. */
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export function apiSuccess<T>(data: T, status = 200) {
  const payload: ApiSuccess<T> = {
    ok: true,
    data,
  };

  return NextResponse.json(payload, { status });
}

export function apiError(
  code: string,
  message: string,
  status = 400,
  fieldErrors?: ApiFieldErrors,
) {
  const payload: ApiFailure = {
    ok: false,
    error: {
      code,
      message,
      fieldErrors,
    },
  };

  return NextResponse.json(payload, { status });
}

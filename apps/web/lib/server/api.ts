import type { ApiFailure, ApiFieldErrors, ApiSuccess } from "@zootopia/shared-types";
import { NextResponse } from "next/server";

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

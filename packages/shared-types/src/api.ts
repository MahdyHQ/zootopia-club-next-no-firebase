export type ApiFieldErrors = Record<string, string>;

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: ApiFieldErrors;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

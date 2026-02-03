/**
 * Internal HTTP request helper. Resolves URL, sets auth headers, handles JSON and errors.
 * @see TS_NODE_SDK_PLAN.md Section 4.2
 */

import {
  SketricGenAPIError,
  SketricGenAuthenticationError,
  SketricGenNetworkError,
  SketricGenTimeoutError,
} from './errors.js';

export type AuthKind = 'api-key' | 'x-api-key';

export interface RequestOptions {
  url: string;
  method: 'GET' | 'POST';
  auth: AuthKind;
  apiKey: string;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface StreamRequestOptions {
  url: string;
  method: 'POST';
  auth: AuthKind;
  apiKey: string;
  body: unknown;
  timeoutMs?: number;
  /** When true, do not apply timeout so SSE stream is not aborted. */
  noTimeout?: boolean;
}

/**
 * Build error message from response body: body.message ?? body.detail ?? fallback.
 */
function getErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string') {
    return (body as { message: string }).message;
  }
  if (body && typeof body === 'object' && 'detail' in body && typeof (body as { detail: unknown }).detail === 'string') {
    return (body as { detail: string }).detail;
  }
  return fallback;
}

function getRequestId(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'requestId' in body && typeof (body as { requestId: unknown }).requestId === 'string') {
    return (body as { requestId: string }).requestId;
  }
  return undefined;
}

/**
 * Perform a JSON request and return parsed JSON. Throws typed errors on status >= 400 or network/timeout.
 */
export async function request<T>(options: RequestOptions): Promise<T> {
  const { url, method, auth, apiKey, body, timeoutMs } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(auth === 'api-key' ? { 'API-KEY': apiKey } : { 'X-API-KEY': apiKey }),
  };

  const controller = new AbortController();
  const timeoutId =
    timeoutMs != null && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
  const signal = options.signal ?? controller.signal;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

    if (timeoutId != null) clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    let parsedBody: unknown;
    let rawText = '';
    try {
      rawText = await response.text();
      parsedBody = isJson && rawText ? JSON.parse(rawText) : rawText;
    } catch {
      parsedBody = 'Unknown error';
    }

    if (response.status >= 400) {
      const message = getErrorMessage(parsedBody, rawText || 'Unknown error');
      const requestId = getRequestId(parsedBody);
      if (response.status === 401) {
        throw new SketricGenAuthenticationError(
          message,
          401,
          parsedBody,
          requestId
        );
      }
      throw new SketricGenAPIError(
        message,
        response.status,
        parsedBody,
        requestId
      );
    }

    return parsedBody as T;
  } catch (err) {
    if (timeoutId != null) clearTimeout(timeoutId);
    if (err instanceof SketricGenAPIError || err instanceof SketricGenAuthenticationError) {
      throw err;
    }
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new SketricGenTimeoutError('Request timed out');
      }
      throw new SketricGenNetworkError(err.message, err);
    }
    throw new SketricGenNetworkError(String(err), err);
  }
}

/**
 * Perform a request that returns a streaming body (e.g. SSE). Does not parse JSON.
 * When noTimeout is true, timeout is not applied so the stream is not aborted.
 */
export async function requestStream(
  options: StreamRequestOptions
): Promise<{ response: Response; body: ReadableStream<Uint8Array> | null }> {
  const { url, method, auth, apiKey, body, timeoutMs, noTimeout } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(auth === 'api-key' ? { 'API-KEY': apiKey } : { 'X-API-KEY': apiKey }),
  };

  const controller = new AbortController();
  const timeoutId =
    !noTimeout && timeoutMs != null && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (timeoutId != null) clearTimeout(timeoutId);

    if (response.status >= 400) {
      const contentType = response.headers.get('content-type') ?? '';
      const isJson = contentType.includes('application/json');
      const rawText = await response.text();
      const parsedBody = isJson && rawText ? JSON.parse(rawText) : rawText;
      const message = getErrorMessage(parsedBody, rawText || 'Unknown error');
      const requestId = getRequestId(parsedBody);
      if (response.status === 401) {
        throw new SketricGenAuthenticationError(
          message,
          401,
          parsedBody,
          requestId
        );
      }
      throw new SketricGenAPIError(
        message,
        response.status,
        parsedBody,
        requestId
      );
    }

    return { response, body: response.body };
  } catch (err) {
    if (timeoutId != null) clearTimeout(timeoutId);
    if (err instanceof SketricGenAPIError || err instanceof SketricGenAuthenticationError) {
      throw err;
    }
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new SketricGenTimeoutError('Request timed out');
      }
      throw new SketricGenNetworkError(err.message, err);
    }
    throw new SketricGenNetworkError(String(err), err);
  }
}

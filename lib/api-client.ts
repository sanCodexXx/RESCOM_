export class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function request<T = any>(
  path: string,
  space: string,
  method = 'GET',
  data?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  if (!navigator.onLine) throw new RequestError('RESCOM is offline.', 0);

  let response: Response;
  try {
    response = await fetch('/api/' + path + (path.includes('?') ? '&' : '?') + 'space=' + encodeURIComponent(space), {
      method,
      headers: { ...headers, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: data === undefined ? undefined : JSON.stringify(data),
      cache: 'no-store',
      signal: AbortSignal.timeout(6500),
    });
  } catch {
    throw new RequestError('RESCOM could not be reached. Check your connection and try again.', 0);
  }

  if (response.redirected) throw new RequestError('Sign in to reconnect to RESCOM.', 401);
  const payload = await response.json().catch(() => null) as ({ error?: string } & object) | null;
  if (!response.ok || !payload) {
    throw new RequestError(payload?.error || 'RESCOM could not complete the request.', response.ok ? 502 : response.status);
  }
  return payload as T;
}

export function unavailable(error: unknown) {
  return error instanceof RequestError && (error.status === 0 || error.status >= 500);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api';

type Options = Omit<RequestInit, 'body'> & { body?: unknown };

let refreshing: Promise<boolean> | null = null;

const callRefresh = async (): Promise<boolean> => {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        // allow the next 401 to trigger a fresh attempt
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
};

const doFetch = async (path: string, options: Options, retry = true): Promise<Response> => {
  const { body, headers, ...rest } = options;
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const ok = await callRefresh();
    if (ok) return doFetch(path, options, false);
  }
  return res;
};

const parseError = async (res: Response): Promise<ApiError> => {
  let message = `Request failed (${res.status})`;
  let code: string | undefined;
  let details: unknown;
  try {
    const data = await res.json();
    if (data?.error) {
      message = data.error.message ?? message;
      code = data.error.code;
      details = data.error.details;
    }
  } catch {
    /* non-JSON body */
  }
  return new ApiError(message, res.status, code, details);
};

const request = async <T>(path: string, options: Options): Promise<T> => {
  const res = await doFetch(path, options);
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
};

const qs = (params?: Record<string, string | number | boolean | undefined | null>): string => {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined | null>) =>
    request<T>(`${path}${qs(params)}`, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Download a binary report, triggering a login redirect on auth failure. */
  download: async (path: string, params?: Record<string, string | number | boolean | undefined | null>) => {
    const res = await doFetch(`${path}${qs(params)}`, { method: 'GET' });
    if (!res.ok) throw await parseError(res);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] ?? path.split('/').pop() ?? 'download';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};

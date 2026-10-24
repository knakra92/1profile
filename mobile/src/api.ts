import * as SecureStore from 'expo-secure-store';

// The iOS simulator shares the host's network, so localhost reaches the dev API.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8077';

const TOKEN_KEY = 'oneprofile.token';
let token: string | null = null;
let onUnauthorized: () => void = () => {};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function setToken(value: string | null) {
  token = value;
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: {
        'Content-Type': 'application/json',
        // Lets the AI agents show times in the user's timezone.
        'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, `Can't reach 1Profile server at ${API_URL}`);
  }
  if (res.status === 401 && token) onUnauthorized();
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail[0]?.msg : res.statusText;
    throw new ApiError(res.status, message || `Request failed (${res.status})`);
  }
  return data as T;
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

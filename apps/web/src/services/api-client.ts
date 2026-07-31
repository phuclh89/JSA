import type { ApiErrorResponse } from '@jsams/shared-types';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly correlationId?: string,
    public readonly details: unknown[] = [],
  ) {
    super(message);
  }
}

type TokenProvider = () => string | undefined;
let accessTokenProvider: TokenProvider = () => undefined;
export function setAccessTokenProvider(provider: TokenProvider): void {
  accessTokenProvider = provider;
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenProvider: TokenProvider = () => undefined,
  ) {}

  async get<T>(path: string, signal?: AbortSignal, acceptedStatuses: number[] = []): Promise<T> {
    return this.request<T>(path, { method: 'GET', signal }, acceptedStatuses);
  }

  async post<T, B = unknown>(path: string, body: B): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  async postWithHeaders<T, B = unknown>(
    path: string,
    body: B,
    headers: Record<string, string>,
  ): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    });
  }

  async postEmpty<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'POST' });
  }

  async postForm<T>(path: string, body: FormData): Promise<T> {
    return this.request<T>(path, { method: 'POST', body });
  }

  async put<T, B = unknown>(path: string, body: B): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }
  async patch<T, B = unknown>(path: string, body: B): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }
  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    acceptedStatuses: number[] = [],
  ): Promise<T> {
    const token = this.tokenProvider();
    const correlationId = globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}`;
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...init.headers,
        Accept: 'application/json',
        ...(init.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        'X-Correlation-ID': correlationId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(import.meta.env.VITE_AUTH_MODE === 'development'
          ? { 'X-Dev-User': import.meta.env.VITE_DEV_USER || 'admin' }
          : {}),
      },
    });
    if (!response.ok && !acceptedStatuses.includes(response.status)) {
      const payload = (await response.json().catch(() => undefined)) as
        ApiErrorResponse | undefined;
      throw new ApiClientError(
        response.status,
        payload?.error?.code ?? 'HTTP_ERROR',
        payload?.error?.message ?? 'The request failed',
        payload?.correlationId ?? response.headers.get('X-Correlation-ID') ?? undefined,
        payload?.error?.details ?? [],
      );
    }
    if (response.status === 204) return undefined as T;
    const responseText = await response.text();
    if (!responseText.trim()) return undefined as T;
    return JSON.parse(responseText) as T;
  }
}

export const apiClient = new ApiClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1',
  () => accessTokenProvider(),
);

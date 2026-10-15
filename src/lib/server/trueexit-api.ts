export interface TrueExitWorkspace {
  id: string;
  account_id: string;
  name: string;
  personal: boolean;
  account_owner: boolean;
  role: 'admin' | 'member' | null;
}

export interface CurrentUser {
  user_id: string;
  owned_account_ids: string[];
  personal_workspace_id: string | null;
}

export class TrueExitApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null = null
  ) {
    super(message);
    this.name = 'TrueExitApiError';
  }
}

interface RuntimeEnvironment {
  TRUEEXIT_API_BASE_URL?: string;
}

export function getApiBaseUrl(runtime: unknown): string {
  const env = (runtime as { env?: RuntimeEnvironment } | undefined)?.env;
  const value = env?.TRUEEXIT_API_BASE_URL?.trim();

  if (!value) {
    throw new Error('TRUEEXIT_API_BASE_URL is not configured for this deployment.');
  }

  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('TRUEEXIT_API_BASE_URL must use HTTPS outside local development.');
  }

  return url.toString().replace(/\/$/, '');
}

async function request<T>(baseUrl: string, accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    redirect: 'manual'
  });

  if (!response.ok) {
    let message = `TrueExit API request failed (${response.status}).`;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      if (body.error?.code) message = `TrueExit API error: ${body.error.code}.`;
    } catch {
      // Do not expose upstream response bodies or credentials in the UI.
    }
    throw new TrueExitApiError(message, response.status, response.headers.get('X-Request-Id'));
  }

  return (await response.json()) as T;
}

export async function getCurrentUser(baseUrl: string, accessToken: string) {
  return request<CurrentUser>(baseUrl, accessToken, '/v1/me');
}

export async function getWorkspaces(baseUrl: string, accessToken: string) {
  return request<{ data: TrueExitWorkspace[]; page?: { next_cursor: string | null } }>(
    baseUrl,
    accessToken,
    '/v1/workspaces?limit=100'
  );
}

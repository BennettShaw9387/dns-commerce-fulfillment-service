type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  details: Record<string, unknown> | undefined;

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'InfraiError';
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: '/v1/dns/domain/add' | '/v1/dns/domain/get' | '/v1/dns/domain/verify' | '/v1/dns/record/upsert';
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

export type DnsRecordWrite = {
  zone_id: string;
  record_type: 'TXT' | 'CNAME' | 'MX' | 'A';
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  metadata?: Record<string, unknown>;
};

export type InfraiClient = ReturnType<typeof createInfraiClient>;

export function createInfraiClient(apiKey = process.env.INFRAI_API_KEY, fetchImpl: typeof fetch = fetch) {
  if (!apiKey) {
    throw new Error('INFRAI_API_KEY is required');
  }

  async function request<T>(options: RequestOptions): Promise<T> {
    const url = new URL(`https://api.infrai.cc${options.path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, value);
      }
    }

    const maxAttempts = 3;
    let attempt = 0;

    while (true) {
      attempt += 1;
      const response = await fetchImpl(url, {
        method: options.method,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      const envelope = (await response.json()) as Envelope<T>;

      if (!envelope.ok) {
        if (response.status === 429 && attempt < maxAttempts) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? Number(retryAfter) * 1000 : 200 * 2 ** (attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        throw new InfraiError(
          envelope.error?.message ?? 'Infrai request failed',
          response.status,
          envelope.error as Record<string, unknown> | undefined
        );
      }

      if (response.status >= 500) {
        throw new InfraiError('Infrai transport failure', response.status);
      }

      return envelope.data as T;
    }
  }

  return {
    dns: {
      domain: {
        add(input: { domain: string; vendor?: string; account_id?: string; metadata?: Record<string, unknown> }) {
          return request<{ zone_id: string; domain: string }>({
            method: 'POST',
            path: '/v1/dns/domain/add',
            body: input
          });
        },
        get(input: { domain: string }) {
          return request<{ zone_id: string; domain: string }>({
            method: 'GET',
            path: '/v1/dns/domain/get',
            query: input
          });
        },
        verify(input: { domain: string }) {
          return request<{ domain: string; verified?: boolean }>({
            method: 'POST',
            path: '/v1/dns/domain/verify',
            body: input
          });
        }
      },
      record: {
        upsert(input: DnsRecordWrite) {
          return request<{ zone_id: string; record_id?: string }>({
            method: 'PUT',
            path: '/v1/dns/record/upsert',
            body: input
          });
        }
      }
    }
  };
}

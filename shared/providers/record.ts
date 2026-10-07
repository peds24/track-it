import { makeProvider, pureCalls } from './registry';
import type { FakeResponse, KeyName, ProviderCase } from './types';

const KEYS: KeyName[] = ['TMDB_API_KEY', 'GOOGLE_BOOKS_API_KEY', 'METRON_USERNAME', 'METRON_PASSWORD'];

type RecordedRequest = { method: string; url: string; headers: Record<string, string>; body: unknown };

/** Runs one case: env set exactly as given, fetch faked from `responses`. */
export async function recordCase(c: ProviderCase): Promise<Record<string, unknown>> {
  const savedEnv = Object.fromEntries(KEYS.map((k) => [k, process.env[`EXPO_PUBLIC_${k}`]]));
  const savedFetch = global.fetch;
  const queue: FakeResponse[] = [...(c.responses ?? [])];
  const requests: RecordedRequest[] = [];
  for (const k of KEYS) {
    if (c.env?.[k] !== undefined) process.env[`EXPO_PUBLIC_${k}`] = c.env[k];
    else delete process.env[`EXPO_PUBLIC_${k}`];
  }
  global.fetch = (async (url: string, init?: RequestInit) => {
    requests.push({
      method: init?.method ?? 'GET',
      url,
      headers: (init?.headers as Record<string, string> | undefined) ?? {},
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    const next = queue.shift();
    if (!next) throw new Error('no recorded response');
    if ('networkError' in next) throw new TypeError('Network request failed');
    const status = next.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => next.body } as Response;
  }) as typeof fetch;
  try {
    const target = c.provider ? makeProvider(c.provider) : null;
    const fn = target ? (target[c.call] as ((...a: unknown[]) => unknown) | undefined)?.bind(target) : pureCalls[c.call];
    if (!fn) throw new Error(`No ${c.provider ?? 'pure'} call "${c.call}" (case "${c.name}")`);
    try {
      const result = await fn(...(JSON.parse(JSON.stringify(c.args)) as unknown[]));
      return { ...c, requests, unusedResponses: queue.length, result: JSON.parse(JSON.stringify(result ?? null)) };
    } catch (e) {
      return { ...c, requests, unusedResponses: queue.length, throws: (e as Error).message };
    }
  } finally {
    global.fetch = savedFetch;
    for (const k of KEYS) {
      if (savedEnv[k] === undefined) delete process.env[`EXPO_PUBLIC_${k}`];
      else process.env[`EXPO_PUBLIC_${k}`] = savedEnv[k];
    }
  }
}

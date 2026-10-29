import {
  ApiRequestItem,
  EnvVariable,
  HttpMethod,
  KeyValueItem,
} from '../types/api';

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function createKV(key = '', value = '', enabled = true, description = ''): KeyValueItem {
  return { id: uid('kv'), key, value, enabled, description };
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMs(ms: number): string {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Extract `{{var}}` and `${var}` variable names from any string.
 */
export function extractTemplateVariables(input: string): string[] {
  if (!input) return [];
  const vars = new Set<string>();
  const doubleBrace = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = doubleBrace.exec(input)) !== null) {
    if (match[1]) vars.add(match[1].trim());
  }
  const dollarBrace = /\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g;
  while ((match = dollarBrace.exec(input)) !== null) {
    if (match[1]) vars.add(match[1].trim());
  }
  return Array.from(vars);
}

/**
 * Interpolate `{{var}}` and `${var}` placeholders using enabled environment variables.
 */
export function interpolateString(input: string, envVars: EnvVariable[]): string {
  if (!input) return '';
  const map = new Map<string, string>();
  for (const v of envVars) {
    if (v.enabled && v.key.trim()) {
      map.set(v.key.trim(), v.value);
    }
  }
  return input
    .replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, name) => {
      const key = String(name).trim();
      return map.has(key) ? map.get(key)! : full;
    })
    .replace(/\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g, (full, name) => {
      const key = String(name).trim();
      return map.has(key) ? map.get(key)! : full;
    });
}

/**
 * Decode a JWT token without external libraries if valid 3-part base64url JWT.
 */
export function tryDecodeJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  isExpired?: boolean;
  expiresAt?: string;
} | null {
  if (!token) return null;
  const cleaned = token.replace(/^Bearer\s+/i, '').trim();
  const parts = cleaned.split('.');
  if (parts.length !== 3) return null;
  try {
    const decodePart = (b64url: string) => {
      const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const jsonStr = decodeURIComponent(
        atob(padded)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonStr);
    };
    const header = decodePart(parts[0]);
    const payload = decodePart(parts[1]);
    if (typeof header !== 'object' || typeof payload !== 'object' || !header || !payload) {
      return null;
    }
    let isExpired: boolean | undefined;
    let expiresAt: string | undefined;
    if (typeof payload.exp === 'number') {
      const expMs = payload.exp * 1000;
      isExpired = Date.now() > expMs;
      expiresAt = new Date(expMs).toISOString();
    }
    return { header, payload, isExpired, expiresAt };
  } catch {
    return null;
  }
}

/**
 * Build final resolved URL, headers, and body string ready for Node proxy execution.
 */
export function buildExecutableRequest(
  req: ApiRequestItem,
  envVars: EnvVariable[]
): {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string | null;
} {
  let rawUrl = interpolateString(req.url.trim(), envVars);

  // Append enabled query parameters
  const activeParams = (req.params || []).filter((p) => p.enabled && p.key.trim());
  if (
    req.auth.type === 'apikey' &&
    req.auth.apiKeyIn === 'query' &&
    req.auth.apiKeyName?.trim()
  ) {
    activeParams.push({
      id: 'auth_q',
      key: interpolateString(req.auth.apiKeyName.trim(), envVars),
      value: interpolateString(req.auth.apiKeyValue || '', envVars),
      enabled: true,
    });
  }

  if (activeParams.length > 0) {
    const [basePart, hashPart] = rawUrl.split('#');
    const qIndex = basePart.indexOf('?');
    const pathOnly = qIndex > -1 ? basePart.slice(0, qIndex) : basePart;
    const existingQuery = qIndex > -1 ? basePart.slice(qIndex + 1) : '';
    const searchParams = new URLSearchParams(existingQuery);
    for (const p of activeParams) {
      const k = interpolateString(p.key.trim(), envVars);
      const v = interpolateString(p.value, envVars);
      // Avoid duplicating identical key=value already in rawUrl
      if (searchParams.get(k) !== v) {
        searchParams.set(k, v);
      }
    }
    const qs = searchParams.toString();
    rawUrl = `${pathOnly}${qs ? `?${qs}` : ''}${hashPart ? `#${hashPart}` : ''}`;
  }

  const headers: Record<string, string> = {};
  for (const h of req.headers || []) {
    if (h.enabled && h.key.trim()) {
      headers[interpolateString(h.key.trim(), envVars)] = interpolateString(h.value, envVars);
    }
  }

  // Apply Auth headers
  if (req.auth.type === 'bearer' && req.auth.bearerToken?.trim()) {
    const tok = interpolateString(req.auth.bearerToken.trim(), envVars);
    headers['Authorization'] = /^Bearer\s+/i.test(tok) ? tok : `Bearer ${tok}`;
  } else if (req.auth.type === 'basic' && (req.auth.basicUser || req.auth.basicPass)) {
    const u = interpolateString(req.auth.basicUser || '', envVars);
    const p = interpolateString(req.auth.basicPass || '', envVars);
    headers['Authorization'] = `Basic ${btoa(`${u}:${p}`)}`;
  } else if (
    req.auth.type === 'apikey' &&
    req.auth.apiKeyIn !== 'query' &&
    req.auth.apiKeyName?.trim()
  ) {
    headers[interpolateString(req.auth.apiKeyName.trim(), envVars)] = interpolateString(
      req.auth.apiKeyValue || '',
      envVars
    );
  }

  // Build Body
  let body: string | null = null;
  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');

  if (!['GET', 'HEAD'].includes(req.method)) {
    if (req.body.mode === 'json' && req.body.rawText.trim()) {
      body = interpolateString(req.body.rawText, envVars);
      if (!hasContentType) headers['Content-Type'] = 'application/json';
    } else if (req.body.mode === 'urlencoded') {
      const params = new URLSearchParams();
      for (const item of req.body.urlencoded || []) {
        if (item.enabled && item.key.trim()) {
          params.append(
            interpolateString(item.key.trim(), envVars),
            interpolateString(item.value, envVars)
          );
        }
      }
      body = params.toString();
      if (!hasContentType) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (req.body.mode === 'graphql' && req.body.graphqlQuery.trim()) {
      let varsObj: Record<string, unknown> = {};
      if (req.body.graphqlVariables.trim()) {
        try {
          varsObj = JSON.parse(interpolateString(req.body.graphqlVariables, envVars));
        } catch {
          varsObj = {};
        }
      }
      body = JSON.stringify({
        query: interpolateString(req.body.graphqlQuery, envVars),
        variables: varsObj,
      });
      if (!hasContentType) headers['Content-Type'] = 'application/json';
    } else if (req.body.mode === 'raw' && req.body.rawText.trim()) {
      body = interpolateString(req.body.rawText, envVars);
      if (!hasContentType) headers['Content-Type'] = 'text/plain; charset=utf-8';
    }
  }

  return {
    method: req.method,
    url: rawUrl,
    headers,
    body,
  };
}

export const METHOD_STYLES: Record<
  HttpMethod,
  { badge: string; text: string; border: string; dot: string }
> = {
  GET: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    text: 'text-emerald-400',
    border: 'border-emerald-500/40',
    dot: 'bg-emerald-400',
  },
  POST: {
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    text: 'text-indigo-400',
    border: 'border-indigo-500/40',
    dot: 'bg-indigo-400',
  },
  PUT: {
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    dot: 'bg-amber-400',
  },
  PATCH: {
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    text: 'text-cyan-400',
    border: 'border-cyan-500/40',
    dot: 'bg-cyan-400',
  },
  DELETE: {
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    text: 'text-rose-400',
    border: 'border-rose-500/40',
    dot: 'bg-rose-400',
  },
  HEAD: {
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    text: 'text-purple-400',
    border: 'border-purple-500/40',
    dot: 'bg-purple-400',
  },
  OPTIONS: {
    badge: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    text: 'text-fuchsia-400',
    border: 'border-fuchsia-500/40',
    dot: 'bg-fuchsia-400',
  },
};

export function getStatusBadgeStyle(status: number): string {
  if (!status || status === 0) return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  if (status >= 200 && status < 300) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (status >= 300 && status < 400) return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
  if (status >= 400 && status < 500) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
}

export function createBlankRequest(partial?: Partial<ApiRequestItem>): ApiRequestItem {
  return {
    id: uid('req'),
    name: 'New API Request',
    folderPath: [],
    method: 'GET',
    url: 'https://dummyjson.com/users/1',
    params: [],
    headers: [createKV('Accept', 'application/json', true)],
    auth: { type: 'none' },
    body: {
      mode: 'none',
      rawText: '{\n  \n}',
      urlencoded: [],
      graphqlQuery: '',
      graphqlVariables: '{}',
    },
    ...partial,
  };
}

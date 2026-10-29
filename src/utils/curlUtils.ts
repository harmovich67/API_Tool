import { ApiRequestItem, EnvVariable, HttpMethod } from '../types/api';
import { buildExecutableRequest, createBlankRequest, createKV } from './helpers';

const VALID_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * Parse a cURL command string into an ApiRequestItem.
 */
export function parseCurlCommand(curlInput: string): ApiRequestItem | null {
  const cleaned = curlInput
    .replace(/\\\r?\n/g, ' ')
    .replace(/\^\r?\n/g, ' ')
    .trim();

  if (!/^curl\s+/i.test(cleaned)) return null;

  // Tokenize respecting single and double quotes
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (quote) {
      if (ch === '\\' && cleaned[i + 1] === quote) {
        current += quote;
        i++;
      } else if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (/\s/.test(ch)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
  }
  if (current) tokens.push(current);

  let method: HttpMethod | null = null;
  let url = '';
  const headers: { key: string; value: string }[] = [];
  let bodyRaw = '';
  let basicUser = '';
  let basicPass = '';

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if ((t === '-X' || t === '--request') && tokens[i + 1]) {
      const m = tokens[++i].toUpperCase() as HttpMethod;
      if (VALID_METHODS.includes(m)) method = m;
    } else if ((t === '-H' || t === '--header') && tokens[i + 1]) {
      const rawH = tokens[++i];
      const idx = rawH.indexOf(':');
      if (idx > -1) {
        headers.push({
          key: rawH.slice(0, idx).trim(),
          value: rawH.slice(idx + 1).trim(),
        });
      }
    } else if (
      (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary') &&
      tokens[i + 1]
    ) {
      bodyRaw = tokens[++i];
    } else if ((t === '-u' || t === '--user') && tokens[i + 1]) {
      const creds = tokens[++i];
      const idx = creds.indexOf(':');
      basicUser = idx > -1 ? creds.slice(0, idx) : creds;
      basicPass = idx > -1 ? creds.slice(idx + 1) : '';
    } else if (t === '--url' && tokens[i + 1]) {
      url = tokens[++i];
    } else if (!t.startsWith('-') && !url && /^https?:\/\//i.test(t)) {
      url = t;
    } else if (!t.startsWith('-') && !url && t.includes('.') && !t.includes('=')) {
      url = `https://${t}`;
    }
  }

  if (!url) return null;
  if (!method) {
    method = bodyRaw ? 'POST' : 'GET';
  }

  let auth: ApiRequestItem['auth'] = { type: 'none' };
  const remainingHeaders = [];
  for (const h of headers) {
    if (h.key.toLowerCase() === 'authorization' && /^Bearer\s+/i.test(h.value)) {
      auth = { type: 'bearer', bearerToken: h.value.replace(/^Bearer\s+/i, '').trim() };
    } else {
      remainingHeaders.push(createKV(h.key, h.value, true));
    }
  }
  if (basicUser || basicPass) {
    auth = { type: 'basic', basicUser, basicPass };
  }

  let isJson = false;
  if (bodyRaw) {
    try {
      const parsed = JSON.parse(bodyRaw);
      bodyRaw = JSON.stringify(parsed, null, 2);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  return createBlankRequest({
    name: `Imported cURL (${method})`,
    method,
    url,
    headers: remainingHeaders,
    auth,
    body: {
      mode: bodyRaw ? (isJson ? 'json' : 'raw') : 'none',
      rawText: bodyRaw || '{\n  \n}',
      urlencoded: [],
      graphqlQuery: '',
      graphqlVariables: '{}',
    },
  });
}

/**
 * Generate ready-to-copy code snippets for cURL, Fetch, Axios, and Python.
 */
export function generateCodeSnippet(
  req: ApiRequestItem,
  envVars: EnvVariable[],
  target: 'curl' | 'fetch' | 'axios' | 'python'
): string {
  const exec = buildExecutableRequest(req, envVars);

  if (target === 'curl') {
    const lines = [`curl -X ${exec.method} '${exec.url}'`];
    for (const [k, v] of Object.entries(exec.headers)) {
      lines.push(`  -H '${k}: ${v.replace(/'/g, "'\\''")}'`);
    }
    if (exec.body) {
      lines.push(`  --data-raw '${exec.body.replace(/'/g, "'\\''")}'`);
    }
    return lines.join(' \\\n');
  }

  if (target === 'fetch') {
    const opts: Record<string, unknown> = {
      method: exec.method,
      headers: exec.headers,
    };
    let bodyLine = '';
    if (exec.body) {
      bodyLine = `,\n  body: ${JSON.stringify(exec.body)}`;
    }
    return `const response = await fetch(${JSON.stringify(exec.url)}, {\n  method: '${exec.method}',\n  headers: ${JSON.stringify(opts.headers, null, 4).replace(/\n/g, '\n  ')}${bodyLine}\n});\n\nconst data = await response.json();\nconsole.log(response.status, data);`;
  }

  if (target === 'axios') {
    let parsedData: unknown = exec.body;
    if (exec.body) {
      try {
        parsedData = JSON.parse(exec.body);
      } catch {
        parsedData = exec.body;
      }
    }
    return `import axios from 'axios';\n\nconst response = await axios({\n  method: '${exec.method.toLowerCase()}',\n  url: ${JSON.stringify(exec.url)},\n  headers: ${JSON.stringify(exec.headers, null, 4).replace(/\n/g, '\n  ')}${
      exec.body ? `,\n  data: ${JSON.stringify(parsedData, null, 4).replace(/\n/g, '\n  ')}` : ''
    }\n});\n\nconsole.log(response.status, response.data);`;
  }

  // Python requests
  return `import requests\n\nurl = ${JSON.stringify(exec.url)}\nheaders = ${JSON.stringify(exec.headers, null, 2)}\n${
    exec.body ? `payload = ${JSON.stringify(exec.body)}\n\nresponse = requests.request("${exec.method}", url, headers=headers, data=payload)` : `\nresponse = requests.request("${exec.method}", url, headers=headers)`
  }\nprint(response.status_code)\nprint(response.text)`;
}


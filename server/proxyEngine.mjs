import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import zlib from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';

// Prefer IPv4 first to prevent 20s IPv6 blackhole timeouts on dual-stack domains (e.g. Cloudflare)
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB cap

/**
 * Parse Set-Cookie raw header strings into structured cookie objects.
 */
function parseSetCookies(rawCookies = []) {
  const list = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
  return list.map((raw) => {
    const parts = String(raw).split(';').map((p) => p.trim());
    const [nameVal, ...attrs] = parts;
    const eqIdx = nameVal.indexOf('=');
    const name = eqIdx > -1 ? nameVal.slice(0, eqIdx).trim() : nameVal;
    const value = eqIdx > -1 ? nameVal.slice(eqIdx + 1).trim() : '';
    const cookie = {
      name,
      value,
      domain: '',
      path: '/',
      expires: '',
      httpOnly: false,
      secure: false,
      sameSite: '',
      raw: String(raw),
    };
    for (const attr of attrs) {
      const lower = attr.toLowerCase();
      if (lower === 'httponly') cookie.httpOnly = true;
      else if (lower === 'secure') cookie.secure = true;
      else if (lower.startsWith('path=')) cookie.path = attr.slice(5);
      else if (lower.startsWith('domain=')) cookie.domain = attr.slice(7);
      else if (lower.startsWith('expires=')) cookie.expires = attr.slice(8);
      else if (lower.startsWith('max-age=') && !cookie.expires) cookie.expires = `Max-Age: ${attr.slice(8)}s`;
      else if (lower.startsWith('samesite=')) cookie.sameSite = attr.slice(9);
    }
    return cookie;
  });
}

/**
 * Safely decompress HTTP response buffers based on Content-Encoding.
 */
function decompressBuffer(buffer, encodingHeader = '') {
  if (!buffer || buffer.length === 0) return buffer;
  const enc = String(encodingHeader).toLowerCase().trim();
  try {
    if (enc.includes('br')) {
      return zlib.brotliDecompressSync(buffer);
    }
    if (enc.includes('gzip') || enc.includes('x-gzip')) {
      return zlib.gunzipSync(buffer);
    }
    if (enc.includes('deflate')) {
      try {
        return zlib.inflateSync(buffer);
      } catch {
        return zlib.inflateRawSync(buffer);
      }
    }
  } catch {
    // Fallback to raw buffer if server sent mismatched Content-Encoding
    return buffer;
  }
  return buffer;
}

/**
 * Execute a single HTTP/HTTPS hop with socket-level timing telemetry.
 */
function executeSingleHop({
  method = 'GET',
  targetUrl,
  headers = {},
  bodyBuffer = null,
  timeoutMs = 25000,
  allowInsecureTls = true,
}) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (err) {
      return reject(Object.assign(new Error(`Invalid URL: ${targetUrl}`), { code: 'ERR_INVALID_URL' }));
    }

    const isHttps = parsedUrl.protocol === 'https:';
    if (!isHttps && parsedUrl.protocol !== 'http:') {
      return reject(
        Object.assign(new Error(`Unsupported protocol: ${parsedUrl.protocol}`), {
          code: 'ERR_UNSUPPORTED_PROTOCOL',
        })
      );
    }

    const transport = isHttps ? https : http;
    const tStart = performance.now();
    let tDns = null;
    let tTcp = null;
    let tTls = null;
    let tTtfb = null;
    let tlsInfo = null;

    const cleanHeaders = {};
    for (const [k, v] of Object.entries(headers || {})) {
      if (!k || v === undefined || v === null) continue;
      const lower = k.toLowerCase();
      if (lower === 'host' || lower === 'content-length') continue;
      cleanHeaders[k] = String(v);
    }

    if (!Object.keys(cleanHeaders).some((k) => k.toLowerCase() === 'user-agent')) {
      cleanHeaders['User-Agent'] = 'Nexus-API-Studio/1.0 (Node.js Proxy Engine)';
    }
    if (!Object.keys(cleanHeaders).some((k) => k.toLowerCase() === 'accept-encoding')) {
      cleanHeaders['Accept-Encoding'] = 'gzip, deflate, br';
    }
    if (!Object.keys(cleanHeaders).some((k) => k.toLowerCase() === 'accept')) {
      cleanHeaders['Accept'] = '*/*';
    }
    if (bodyBuffer && bodyBuffer.length > 0) {
      cleanHeaders['Content-Length'] = String(bodyBuffer.length);
    }

    const reqOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: method.toUpperCase(),
      headers: cleanHeaders,
      timeout: timeoutMs,
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 800,
      ...(isHttps ? { rejectUnauthorized: !allowInsecureTls } : {}),
    };

    const req = transport.request(reqOptions, (res) => {
      tTtfb = performance.now();

      if (isHttps && res.socket && typeof res.socket.getPeerCertificate === 'function') {
        try {
          const cert = res.socket.getPeerCertificate();
          const cipher = typeof res.socket.getCipher === 'function' ? res.socket.getCipher() : null;
          tlsInfo = {
            authorized: Boolean(res.socket.authorized),
            authorizationError: res.socket.authorizationError || null,
            protocol: typeof res.socket.getProtocol === 'function' ? res.socket.getProtocol() : 'TLS',
            cipher: cipher ? cipher.name : '',
            issuer: cert?.issuer?.O || cert?.issuer?.CN || '',
            subject: cert?.subject?.CN || '',
            validFrom: cert?.valid_from || '',
            validTo: cert?.valid_to || '',
          };
        } catch {
          // Ignore TLS metadata errors
        }
      }

      const chunks = [];
      let receivedBytes = 0;
      let truncated = false;

      res.on('data', (chunk) => {
        if (receivedBytes < MAX_BODY_BYTES) {
          const remaining = MAX_BODY_BYTES - receivedBytes;
          chunks.push(chunk.length > remaining ? chunk.subarray(0, remaining) : chunk);
        } else {
          truncated = true;
        }
        receivedBytes += chunk.length;
      });

      res.on('end', () => {
        const tEnd = performance.now();
        const rawBuffer = Buffer.concat(chunks);
        const decompressed = decompressBuffer(rawBuffer, res.headers['content-encoding']);

        const dnsEnd = tDns ?? tTcp ?? tTtfb ?? tEnd;
        const tcpEnd = tTcp ?? tTls ?? tTtfb ?? tEnd;
        const tlsEnd = isHttps ? (tTls ?? tTtfb ?? tEnd) : tcpEnd;

        const timings = {
          dnsMs: Math.max(0, Number((dnsEnd - tStart).toFixed(2))),
          tcpMs: Math.max(0, Number((tcpEnd - dnsEnd).toFixed(2))),
          tlsMs: isHttps ? Math.max(0, Number((tlsEnd - tcpEnd).toFixed(2))) : 0,
          ttfbMs: Math.max(0, Number(((tTtfb ?? tEnd) - tlsEnd).toFixed(2))),
          downloadMs: Math.max(0, Number((tEnd - (tTtfb ?? tEnd)).toFixed(2))),
          totalMs: Math.max(0, Number((tEnd - tStart).toFixed(2))),
        };

        const flatHeaders = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) {
            flatHeaders[k] = v.join(', ');
          } else if (v !== undefined) {
            flatHeaders[k] = String(v);
          }
        }

        resolve({
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers: flatHeaders,
          rawSetCookie: res.headers['set-cookie'] || [],
          buffer: decompressed,
          compressedBytes: receivedBytes,
          truncated,
          timings,
          tls: tlsInfo,
          sentHeaders: cleanHeaders,
        });
      });
    });

    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        tDns = performance.now();
      });
      socket.on('connect', () => {
        tTcp = performance.now();
      });
      socket.on('secureConnect', () => {
        tTls = performance.now();
      });
    });

    req.on('timeout', () => {
      req.destroy(Object.assign(new Error(`Request timed out after ${timeoutMs}ms`), { code: 'ETIMEDOUT' }));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (bodyBuffer && bodyBuffer.length > 0 && !['GET', 'HEAD'].includes(method.toUpperCase())) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

/**
 * Execute an HTTP request with optional redirect tracking, JSON/binary decoding, and error diagnostics.
 */
export async function executeApiRequest(payload = {}) {
  const {
    method = 'GET',
    url = '',
    headers = {},
    body = null,
    followRedirects = true,
    maxRedirects = 5,
    timeoutMs = 25000,
    allowInsecureTls = true,
  } = payload;

  const trimmedUrl = String(url || '').trim();
  if (!trimmedUrl) {
    return {
      ok: false,
      error: 'URL is empty',
      errorCode: 'ERR_EMPTY_URL',
      status: 0,
      statusText: 'Invalid Request',
      headers: {},
      setCookies: [],
      bodyText: '',
      contentType: '',
      sizeBytes: 0,
      timings: { dnsMs: 0, tcpMs: 0, tlsMs: 0, ttfbMs: 0, downloadMs: 0, totalMs: 0 },
      redirects: [],
      finalUrl: '',
      timestamp: Date.now(),
    };
  }

  const normalizedUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
  const redirects = [];
  let currentUrl = normalizedUrl;
  let currentMethod = String(method || 'GET').toUpperCase();
  let currentBodyBuffer =
    body !== null && body !== undefined && body !== '' && !['GET', 'HEAD'].includes(currentMethod)
      ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf-8')
      : null;

  const overallStart = performance.now();

  try {
    let hopResult = null;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      hopResult = await executeSingleHop({
        method: currentMethod,
        targetUrl: currentUrl,
        headers,
        bodyBuffer: currentBodyBuffer,
        timeoutMs,
        allowInsecureTls,
      });

      const isRedirect = [301, 302, 303, 307, 308].includes(hopResult.status);
      const locationHeader = hopResult.headers['location'];

      if (followRedirects && isRedirect && locationHeader && hop < maxRedirects) {
        const nextUrl = new URL(locationHeader, currentUrl).toString();
        redirects.push({
          status: hopResult.status,
          from: currentUrl,
          to: nextUrl,
          durationMs: hopResult.timings.totalMs,
        });
        currentUrl = nextUrl;
        if (
          hopResult.status === 303 ||
          ((hopResult.status === 301 || hopResult.status === 302) && currentMethod === 'POST')
        ) {
          currentMethod = 'GET';
          currentBodyBuffer = null;
        }
        continue;
      }
      break;
    }

    const totalWallMs = Number((performance.now() - overallStart).toFixed(2));
    const contentType = String(hopResult.headers['content-type'] || '').toLowerCase();
    const isBinaryImage =
      contentType.startsWith('image/') ||
      contentType.startsWith('audio/') ||
      contentType.startsWith('video/') ||
      contentType.includes('application/pdf') ||
      contentType.includes('application/octet-stream');

    let bodyText = '';
    let bodyJson = undefined;
    let isBase64 = false;

    if (isBinaryImage) {
      isBase64 = true;
      const mime = contentType.split(';')[0].trim() || 'application/octet-stream';
      bodyText = `data:${mime};base64,${hopResult.buffer.toString('base64')}`;
    } else {
      bodyText = hopResult.buffer.toString('utf-8');
      const trimmedBody = bodyText.trim();
      if (
        contentType.includes('json') ||
        trimmedBody.startsWith('{') ||
        trimmedBody.startsWith('[')
      ) {
        try {
          bodyJson = JSON.parse(trimmedBody);
        } catch {
          // Keep as plain text if invalid JSON
        }
      }
    }

    const timings =
      redirects.length > 0
        ? { ...hopResult.timings, totalMs: totalWallMs }
        : hopResult.timings;

    return {
      ok: true,
      status: hopResult.status,
      statusText: hopResult.statusText,
      headers: hopResult.headers,
      setCookies: parseSetCookies(hopResult.rawSetCookie),
      bodyText,
      bodyJson,
      isBase64,
      truncated: hopResult.truncated,
      contentType,
      sizeBytes: hopResult.buffer.length,
      compressedBytes: hopResult.compressedBytes,
      timings,
      redirects,
      tls: hopResult.tls,
      finalUrl: currentUrl,
      timestamp: Date.now(),
      requestSnapshot: {
        method: String(method || 'GET').toUpperCase(),
        url: normalizedUrl,
        headers: hopResult.sentHeaders,
        body: typeof body === 'string' ? body.slice(0, 10000) : undefined,
      },
    };
  } catch (err) {
    const totalWallMs = Number((performance.now() - overallStart).toFixed(2));
    return {
      ok: false,
      error: err?.message || 'Network execution failed',
      errorCode: err?.code || 'ERR_NETWORK',
      status: 0,
      statusText: err?.code || 'Network Error',
      headers: {},
      setCookies: [],
      bodyText: '',
      contentType: '',
      sizeBytes: 0,
      timings: { dnsMs: 0, tcpMs: 0, tlsMs: 0, ttfbMs: 0, downloadMs: 0, totalMs: totalWallMs },
      redirects,
      finalUrl: currentUrl,
      timestamp: Date.now(),
      requestSnapshot: {
        method: String(method || 'GET').toUpperCase(),
        url: normalizedUrl,
        headers,
      },
    };
  }
}

/**
 * Concurrently probe an array of URLs for link health, latency, redirects, TLS, and status codes.
 */
export async function probeLinksBatch({ urls = [], headers = {}, timeoutMs = 10000, concurrency = 6 }) {
  const uniqueUrls = Array.from(new Set((urls || []).filter(Boolean))).slice(0, 120);
  const results = new Array(uniqueUrls.length);
  let cursor = 0;

  async function worker() {
    while (cursor < uniqueUrls.length) {
      const idx = cursor++;
      const rawUrl = uniqueUrls[idx];

      // First try HEAD for lightweight probing; fallback to GET if server rejects HEAD (405/403/501/0)
      let res = await executeApiRequest({
        method: 'HEAD',
        url: rawUrl,
        headers,
        followRedirects: true,
        maxRedirects: 4,
        timeoutMs,
        allowInsecureTls: true,
      });

      if (!res.ok || [404, 405, 501, 400, 403].includes(res.status)) {
        res = await executeApiRequest({
          method: 'GET',
          url: rawUrl,
          headers,
          followRedirects: true,
          maxRedirects: 4,
          timeoutMs,
          allowInsecureTls: true,
        });
      }

      results[idx] = {
        url: rawUrl,
        finalUrl: res.finalUrl,
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        error: res.error,
        errorCode: res.errorCode,
        latencyMs: res.timings?.totalMs ?? 0,
        contentType: res.contentType || '',
        server: res.headers?.['server'] || '',
        redirectCount: res.redirects?.length || 0,
        tlsAuthorized: res.tls ? res.tls.authorized : null,
        tlsProtocol: res.tls?.protocol || '',
      };
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, uniqueUrls.length || 1) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Read JSON request body from Node IncomingMessage.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 15 * 1024 * 1024) {
        reject(new Error('Request payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Connect/Express/Vite-compatible middleware handling `/__engine/*` API routes.
 */
export function createProxyMiddleware() {
  return async (req, res, next) => {
    const url = req.url || '';
    if (!url.startsWith('/__engine/')) {
      if (typeof next === 'function') return next();
      return false;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    try {
      if (url.startsWith('/__engine/health') && req.method === 'GET') {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, engine: 'Nexus Node Proxy v1.0', node: process.version }));
        return true;
      }

      if (url.startsWith('/__engine/execute') && req.method === 'POST') {
        const payload = await readJsonBody(req);
        const result = await executeApiRequest(payload);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return true;
      }

      if (url.startsWith('/__engine/probe-links') && req.method === 'POST') {
        const payload = await readJsonBody(req);
        const results = await probeLinksBatch(payload);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, results }));
        return true;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Unknown engine route' }));
      return true;
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: err?.message || 'Internal proxy engine error' }));
      return true;
    }
  };
}

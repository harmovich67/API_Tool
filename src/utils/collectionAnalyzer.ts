import {
  ApiRequestItem,
  CollectionAnalysis,
  EnvVariable,
  ExtractedLink,
  HttpMethod,
  LinkCategory,
  LinkProbeResult,
  ResourceTreeNode,
  SecurityFinding,
} from '../types/api';
import {
  extractTemplateVariables,
  interpolateString,
  tryDecodeJwt,
  uid,
} from './helpers';

const ASSET_EXT_RE = /\.(png|jpe?g|gif|webp|svg|ico|mp4|mp3|pdf|zip|css|js|woff2?)(\?|$)/i;
const WEBHOOK_HINT_RE = /webhook|callback|hook|notify|redirect_?uri|return_?url/i;
const DOCS_AUTH_HINT_RE = /docs|swagger|openapi|redoc|oauth|authorize|token|well-known|github\.com|postman\.com|schema\.getpostman\.com/i;
const SECRET_QUERY_KEY_RE = /^(api_?key|apikey|token|access_?token|secret|password|passwd|pwd|auth|client_?secret)$/i;
const SECRET_VALUE_PATTERN_RE = /^(sk_live_[0-9a-zA-Z]{16,}|ghp_[0-9a-zA-Z]{20,}|AIza[0-9A-Za-z-_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9a-zA-Z-]{15,})/;

function categorizeLink(url: string, contextHint: string, defaultCat: LinkCategory): LinkCategory {
  if (ASSET_EXT_RE.test(url)) return 'asset';
  if (WEBHOOK_HINT_RE.test(contextHint) || WEBHOOK_HINT_RE.test(url)) return 'webhook';
  if (defaultCat === 'endpoint') return 'endpoint';
  if (defaultCat === 'base-server') return 'base-server';
  if (defaultCat === 'response-link') return 'response-link';
  if (DOCS_AUTH_HINT_RE.test(url) || DOCS_AUTH_HINT_RE.test(contextHint)) return 'docs-auth';
  return defaultCat;
}

function parseUrlAnatomy(rawUrl: string, envVars: EnvVariable[]) {
  const variables = extractTemplateVariables(rawUrl);
  const resolvedUrl = interpolateString(rawUrl, envVars).trim();
  const remainingVars = extractTemplateVariables(resolvedUrl);
  const hasUnresolvedVars = remainingVars.length > 0;

  // Replace remaining `{{var}}` temporarily with placeholder domain/segment so `new URL()` can still parse path & query!
  let parseCandidate = resolvedUrl;
  if (/^\{\{[^}]+\}\}/.test(parseCandidate)) {
    parseCandidate = parseCandidate.replace(/^\{\{([^}]+)\}\}/, 'https://var-$1.placeholder.local');
  } else if (!/^https?:\/\//i.test(parseCandidate) && parseCandidate.startsWith('/')) {
    parseCandidate = `https://relative.placeholder.local${parseCandidate}`;
  } else if (!/^https?:\/\//i.test(parseCandidate)) {
    parseCandidate = `https://${parseCandidate}`;
  }
  parseCandidate = parseCandidate.replace(/\{\{([^}]+)\}\}/g, '__var_$1__');

  let protocol = 'https:';
  let host = 'unresolved-host';
  let pathname = '/';
  const queryKeys: string[] = [];

  try {
    const u = new URL(parseCandidate);
    protocol = u.protocol;
    host = u.host.includes('.placeholder.local')
      ? rawUrl.match(/^\{\{[^}]+\}\}/)?.[0] || '(relative)'
      : u.host;
    pathname = decodeURIComponent(u.pathname || '/').replace(/__var_([a-zA-Z0-9_.-]+)__/g, '{{$1}}');
    u.searchParams.forEach((_, k) => {
      const cleanK = k.replace(/__var_([a-zA-Z0-9_.-]+)__/g, '{{$1}}');
      if (!queryKeys.includes(cleanK)) queryKeys.push(cleanK);
    });
  } catch {
    pathname = rawUrl;
  }

  const pathSegments = pathname.split('/').filter(Boolean);
  const pathParams = pathSegments.filter(
    (seg) =>
      seg.startsWith(':') ||
      /^\{[^}]+\}$/.test(seg) ||
      /^\{\{[^}]+\}\}$/.test(seg) ||
      /^\[[^\]]+\]$/.test(seg)
  );

  const isLocalhost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host);
  const isSecure = protocol === 'https:' || isLocalhost || host.startsWith('{{');

  return {
    resolvedUrl,
    protocol,
    host,
    pathname,
    pathSegments,
    pathParams,
    queryKeys,
    variables,
    hasUnresolvedVars,
    isLocalhost,
    isSecure,
  };
}

function buildResourceTree(links: ExtractedLink[]): Record<string, ResourceTreeNode[]> {
  const trees: Record<string, ResourceTreeNode[]> = {};

  for (const link of links) {
    if (link.category !== 'endpoint') continue;
    const hostKey = link.host || 'default';
    if (!trees[hostKey]) trees[hostKey] = [];
    let currentLevel = trees[hostKey];
    let builtPath = '';

    const segments = link.pathSegments.length > 0 ? link.pathSegments : ['/'];
    segments.forEach((seg, idx) => {
      builtPath = seg === '/' ? '/' : `${builtPath}/${seg}`;
      let node = currentLevel.find((n) => n.segment === seg);
      if (!node) {
        node = {
          segment: seg,
          fullPath: builtPath,
          methods: [],
          requestIds: [],
          children: [],
        };
        currentLevel.push(node);
      }
      if (idx === segments.length - 1) {
        for (const m of link.methods) {
          if (!node.methods.includes(m)) node.methods.push(m);
        }
        for (const rid of link.requestIds) {
          if (!node.requestIds.includes(rid)) node.requestIds.push(rid);
        }
      }
      currentLevel = node.children;
    });
  }

  return trees;
}

export function analyzeCollection(
  requests: ApiRequestItem[],
  envVars: EnvVariable[],
  rawJson?: unknown,
  existingProbes?: Map<string, LinkProbeResult>
): CollectionAnalysis {
  const methodCounts: Record<HttpMethod, number> = {
    GET: 0,
    POST: 0,
    PUT: 0,
    PATCH: 0,
    DELETE: 0,
    HEAD: 0,
    OPTIONS: 0,
  };

  const authBreakdown: Record<string, number> = {
    none: 0,
    bearer: 0,
    basic: 0,
    apikey: 0,
  };

  const folderSet = new Set<string>();
  const discoveredVarsSet = new Set<string>();
  const findings: SecurityFinding[] = [];
  const linkMap = new Map<string, ExtractedLink>();
  const endpointSignatureMap = new Map<string, string[]>();
  let savedResponsesCount = 0;

  const registerLink = (
    rawUrlInput: string,
    category: LinkCategory,
    sourceLabel: string,
    method?: HttpMethod,
    requestId?: string
  ) => {
    const cleaned = rawUrlInput.trim().replace(/[.,;)\]]+$/, '');
    if (!cleaned || cleaned.includes('schema.getpostman.com')) return;

    const anatomy = parseUrlAnatomy(cleaned, envVars);
    for (const v of anatomy.variables) discoveredVarsSet.add(v);

    const mapKey = cleaned;
    const existing = linkMap.get(mapKey);
    if (existing) {
      if (!existing.sources.includes(sourceLabel)) existing.sources.push(sourceLabel);
      if (method && !existing.methods.includes(method)) existing.methods.push(method);
      if (requestId && !existing.requestIds.includes(requestId)) existing.requestIds.push(requestId);
      if (category === 'endpoint') existing.category = 'endpoint';
      return;
    }

    const probe = existingProbes?.get(anatomy.resolvedUrl) || existingProbes?.get(cleaned);
    linkMap.set(mapKey, {
      id: uid('lnk'),
      rawUrl: cleaned,
      resolvedUrl: anatomy.resolvedUrl,
      protocol: anatomy.protocol,
      host: anatomy.host,
      pathname: anatomy.pathname,
      pathSegments: anatomy.pathSegments,
      pathParams: anatomy.pathParams,
      queryKeys: anatomy.queryKeys,
      variables: anatomy.variables,
      category,
      sources: [sourceLabel],
      methods: method ? [method] : [],
      requestIds: requestId ? [requestId] : [],
      isSecure: anatomy.isSecure,
      isLocalhost: anatomy.isLocalhost,
      hasUnresolvedVars: anatomy.hasUnresolvedVars,
      probeResult: probe,
    });
  };

  // Scan environment variables for base URLs & secrets
  for (const v of envVars) {
    if (/^https?:\/\//i.test(v.value.trim())) {
      registerLink(v.value.trim(), 'base-server', `Env Variable {{${v.key}}}`);
    }
    const jwt = tryDecodeJwt(v.value);
    if (jwt) {
      findings.push({
        id: uid('fnd'),
        severity: jwt.isExpired ? 'critical' : 'info',
        category: 'secret',
        titleAr: jwt.isExpired
          ? `توكن JWT منتهي الصلاحية في المتغير {{${v.key}}}`
          : `تم اكتشاف وفك تشفير JWT في {{${v.key}}}`,
        titleEn: jwt.isExpired
          ? `Expired JWT Token in variable {{${v.key}}}`
          : `Decoded active JWT Token in {{${v.key}}}`,
        detailAr: jwt.isExpired
          ? `انتهت صلاحية التوكن في ${jwt.expiresAt}. ستفشل الطلبات المحمية بكود 401.`
          : `خوارزمية التوقيع: ${String(jwt.header.alg || 'HS256')}${jwt.expiresAt ? ` — ينتهي في ${jwt.expiresAt}` : ''}`,
        detailEn: jwt.isExpired
          ? `Token expired at ${jwt.expiresAt}. Authenticated requests will likely fail with 401.`
          : `Algorithm: ${String(jwt.header.alg || 'HS256')}${jwt.expiresAt ? ` — Expires: ${jwt.expiresAt}` : ''}`,
        location: `Variable: {{${v.key}}}`,
        decodedJwt: jwt,
      });
    }
  }

  const embeddedUrlRe = /https?:\/\/[^\s"'<>\\]+/gi;

  // Analyze every Request
  for (const req of requests) {
    methodCounts[req.method] = (methodCounts[req.method] || 0) + 1;
    if (req.folderPath.length > 0) {
      folderSet.add(req.folderPath.join(' / '));
    }
    savedResponsesCount += req.savedResponses?.length || 0;

    // Effective auth detection (explicit auth config OR Authorization/API-Key header)
    const authHeader = req.headers.find(
      (h) => h.enabled && /^(authorization|x-api-key|api-key)$/i.test(h.key.trim())
    );
    const effectiveAuthType =
      req.auth.type !== 'none'
        ? req.auth.type
        : authHeader
        ? authHeader.key.toLowerCase() === 'authorization'
          ? 'bearer'
          : 'apikey'
        : 'none';
    authBreakdown[effectiveAuthType] = (authBreakdown[effectiveAuthType] || 0) + 1;

    // Register primary endpoint URL
    if (req.url.trim()) {
      registerLink(req.url.trim(), 'endpoint', req.name, req.method, req.id);
    }

    // Track duplicate endpoints
    const sig = `${req.method} ${req.url.trim().split('?')[0]}`;
    const existingSigs = endpointSignatureMap.get(sig) || [];
    existingSigs.push(req.name);
    endpointSignatureMap.set(sig, existingSigs);

    // Collect template variables across headers, params, auth, body
    const scanTextForVarsAndLinks = (text: string, ctx: string, defCat: LinkCategory) => {
      if (!text) return;
      for (const v of extractTemplateVariables(text)) discoveredVarsSet.add(v);
      const urls = text.match(embeddedUrlRe);
      if (urls) {
        for (const u of urls) {
          registerLink(u, categorizeLink(u, ctx, defCat), `${req.name} (${ctx})`, undefined, req.id);
        }
      }
    };

    for (const p of req.params) {
      scanTextForVarsAndLinks(p.key, 'Query Param', 'docs-auth');
      scanTextForVarsAndLinks(p.value, `Query Param ${p.key}`, 'webhook');
      if (p.enabled && SECRET_QUERY_KEY_RE.test(p.key.trim()) && p.value.trim()) {
        findings.push({
          id: uid('fnd'),
          severity: 'warning',
          category: 'secret',
          titleAr: `تمرير بيانات حساسة (${p.key}) في رابط الـ URL Query`,
          titleEn: `Sensitive credential (${p.key}) passed in URL Query String`,
          detailAr: 'إرسال المفاتيح السرية في الرابط يعرضها للتسريب في سجلات السيرفر والـ Browser History. يُفضل نقلها إلى الـ Headers.',
          detailEn: 'Passing secrets in query parameters exposes them in access logs, proxy logs, and browser history. Prefer HTTP Headers.',
          location: `${req.method} ${req.name}`,
          requestId: req.id,
        });
      }
    }

    for (const h of req.headers) {
      scanTextForVarsAndLinks(h.value, `Header ${h.key}`, 'docs-auth');
      if (h.enabled && h.value.trim() && !h.value.includes('{{')) {
        const jwt = tryDecodeJwt(h.value);
        if (jwt) {
          findings.push({
            id: uid('fnd'),
            severity: jwt.isExpired ? 'critical' : 'warning',
            category: 'secret',
            titleAr: jwt.isExpired
              ? `توكن JWT ثابت ومنتهي الصلاحية داخل الهيدر (${h.key})`
              : `توكن JWT مكشوف بشكل ثابت (Hardcoded) في الهيدر`,
            titleEn: jwt.isExpired
              ? `Hardcoded & Expired JWT in Header (${h.key})`
              : `Hardcoded JWT Token exposed in Header (${h.key})`,
            detailAr: jwt.isExpired
              ? `انتهى هذا التوكن في ${jwt.expiresAt}. انقله لمتغير بيئة {{token}} وحدّثه.`
              : 'يُنصح باستبدال التوكن الثابت بمتغير `{{token}}` قبل مشاركة ملف الـ JSON.',
            detailEn: jwt.isExpired
              ? `Expired at ${jwt.expiresAt}. Move to {{token}} variable and refresh.`
              : 'Replace hardcoded JWTs with `{{token}}` environment variables before sharing collection JSON.',
            location: `${req.method} ${req.name}`,
            requestId: req.id,
            decodedJwt: jwt,
          });
        } else if (SECRET_VALUE_PATTERN_RE.test(h.value.trim())) {
          findings.push({
            id: uid('fnd'),
            severity: 'critical',
            category: 'secret',
            titleAr: `مفتاح API سري حقيقي مكشوف في الهيدر (${h.key})`,
            titleEn: `Live API Secret Key hardcoded in Header (${h.key})`,
            detailAr: 'تم رصد نمط مفتاح سري حي (مثل Stripe / GitHub / Google / AWS). قم بإبطاله أو نقله لمتغير بيئة.',
            detailEn: 'Detected live secret key pattern (Stripe/GitHub/AWS/Google). Rotate or move to environment variables.',
            location: `${req.method} ${req.name}`,
            requestId: req.id,
          });
        }
      }
    }

    // Check Auth Config hardcoded JWT / Secrets
    if (req.auth.type === 'bearer' && req.auth.bearerToken && !req.auth.bearerToken.includes('{{')) {
      const jwt = tryDecodeJwt(req.auth.bearerToken);
      if (jwt) {
        findings.push({
          id: uid('fnd'),
          severity: jwt.isExpired ? 'critical' : 'warning',
          category: 'secret',
          titleAr: jwt.isExpired
            ? 'توكن Bearer JWT ثابت ومنتهي الصلاحية'
            : 'توكن Bearer JWT ثابت (Hardcoded) داخل الطلب',
          titleEn: jwt.isExpired
            ? 'Hardcoded & Expired Bearer JWT'
            : 'Hardcoded Bearer JWT inside request auth',
          detailAr: jwt.isExpired
            ? `انتهت الصلاحية في ${jwt.expiresAt}.`
            : 'يفضل حفظ التوكن في متغير `{{token}}` لسهولة التحديث في كل الطلبات.',
          detailEn: jwt.isExpired
            ? `Expired at ${jwt.expiresAt}.`
            : 'Store bearer tokens in `{{token}}` to update once across all endpoints.',
          location: `${req.method} ${req.name}`,
          requestId: req.id,
          decodedJwt: jwt,
        });
      }
    }

    scanTextForVarsAndLinks(req.body.rawText, 'Request Body', 'webhook');
    scanTextForVarsAndLinks(req.description || '', 'Description', 'docs-auth');

    for (const sr of req.savedResponses || []) {
      scanTextForVarsAndLinks(sr.body, `Saved Response (${sr.status})`, 'response-link');
    }

    // Mutating request without authentication check
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      effectiveAuthType === 'none' &&
      !/login|signin|signup|register|auth|token|forgot|reset|public|webhook|httpbin|jsonplaceholder/i.test(
        `${req.name} ${req.url}`
      )
    ) {
      findings.push({
        id: uid('fnd'),
        severity: 'info',
        category: 'auth',
        titleAr: `عملية تعديل (${req.method}) بدون إعداد مصادقة (Auth)`,
        titleEn: `Mutating endpoint (${req.method}) has no Auth configured`,
        detailAr: 'تأكد مما إذا كان هذا الرابط يتطلب Bearer Token أو API Key لتجنب خطأ 401/403، أو تحقق من حماية السيرفر له.',
        detailEn: 'Verify if this endpoint requires Bearer/API-Key auth, or test it with the No-Auth probe to ensure proper protection.',
        location: `${req.method} ${req.name}`,
        requestId: req.id,
      });
    }
  }

  // Deep scan rawJson for any extra URLs not in requests
  if (rawJson) {
    try {
      const rawDump = JSON.stringify(rawJson);
      const matches = rawDump.match(embeddedUrlRe) || [];
      for (const m of matches.slice(0, 250)) {
        const clean = m.replace(/\\+$/, '');
        registerLink(clean, categorizeLink(clean, 'JSON Metadata', 'docs-auth'), 'Collection JSON');
      }
    } catch {
      // ignore circular
    }
  }

  const links = Array.from(linkMap.values());

  // Check insecure HTTP links
  const insecureLinks = links.filter((l) => !l.isSecure && !l.isLocalhost);
  for (const il of insecureLinks.slice(0, 8)) {
    findings.push({
      id: uid('fnd'),
      severity: 'warning',
      category: 'transport',
      titleAr: `اتصال غير مشفر عبر HTTP (بدون SSL/TLS)`,
      titleEn: `Unencrypted HTTP transport detected`,
      detailAr: `الرابط ${il.rawUrl} يستخدم بروتوكول http:// مما يعرض البيانات للتنصت (MITM). استخدم https://.`,
      detailEn: `URL ${il.rawUrl} uses plain http:// instead of https://, exposing payloads in transit.`,
      location: il.sources[0] || il.host,
      requestId: il.requestIds[0],
    });
  }

  // Check unresolved variables
  const enabledVarMap = new Map<string, string>();
  for (const v of envVars) {
    if (v.enabled && v.key.trim()) enabledVarMap.set(v.key.trim(), v.value);
  }
  const discoveredVariables = Array.from(discoveredVarsSet);
  const unresolvedVariables = discoveredVariables.filter(
    (vName) => !enabledVarMap.has(vName) || !enabledVarMap.get(vName)?.trim()
  );

  if (unresolvedVariables.length > 0) {
    findings.push({
      id: uid('fnd'),
      severity: 'warning',
      category: 'variables',
      titleAr: `${unresolvedVariables.length} متغيرات بدون قيمة حالية (${unresolvedVariables
        .slice(0, 4)
        .map((v) => `{{${v}}}`)
        .join(', ')})`,
      titleEn: `${unresolvedVariables.length} unresolved variables need values (${unresolvedVariables
        .slice(0, 4)
        .map((v) => `{{${v}}}`)
        .join(', ')})`,
      detailAr: 'قم بتعبئة قيم هذه المتغيرات من لوحة المتغيرات (Environment Variables) ليتم تعويض الروابط والتوكنات تلقائياً.',
      detailEn: 'Set values for these placeholders in the Environment Variables panel so URLs and tokens resolve cleanly.',
      location: 'Collection Variables',
    });
  }

  // Duplicate endpoints check
  for (const [sig, names] of endpointSignatureMap.entries()) {
    if (names.length > 1) {
      findings.push({
        id: uid('fnd'),
        severity: 'info',
        category: 'architecture',
        titleAr: `تكرار لنفس الـ Endpoint (${names.length} مرات): ${sig}`,
        titleEn: `Duplicate endpoint definition (${names.length}x): ${sig}`,
        detailAr: `مكرر في الطلبات: ${names.slice(0, 3).join(' ، ')}`,
        detailEn: `Appears in requests: ${names.slice(0, 3).join(', ')}`,
        location: sig,
      });
    }
  }

  const uniqueHosts = Array.from(
    new Set(links.map((l) => l.host).filter((h) => h && h !== 'unresolved-host'))
  );

  // Compute Health & Readiness Score (0 - 100)
  let score = 100;
  for (const f of findings) {
    if (f.severity === 'critical') score -= 14;
    else if (f.severity === 'warning') score -= 6;
    else score -= 1;
  }
  if (requests.length === 0) score = 30;
  const healthScore = Math.max(15, Math.min(100, score));

  return {
    healthScore,
    totalRequests: requests.length,
    totalFolders: folderSet.size,
    methodCounts,
    authBreakdown,
    uniqueHosts,
    links,
    findings,
    unresolvedVariables,
    discoveredVariables,
    resourceTreesByHost: buildResourceTree(links),
    savedResponsesCount,
  };
}


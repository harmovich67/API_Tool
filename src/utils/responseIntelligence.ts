import { ProxyExecutionResult } from '../types/api';

export interface SmartAssertion {
  id: string;
  passed: boolean;
  level: 'pass' | 'warn' | 'fail';
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
}

export interface ExtractedResponseVariable {
  keySuggestion: string;
  jsonPath: string;
  value: string;
  isToken: boolean;
}

export interface ResponseDiagnosis {
  headlineAr: string;
  headlineEn: string;
  adviceAr: string;
  adviceEn: string;
  assertions: SmartAssertion[];
  discoveredLinks: string[];
  variableCandidates: ExtractedResponseVariable[];
  typescriptInterfaces: string;
  dataSummaryAr: string;
  dataSummaryEn: string;
}

const STATUS_DIAGNOSIS: Record<
  number,
  { ar: string; en: string; fixAr: string; fixEn: string }
> = {
  200: {
    ar: 'نجاح الطلب (200 OK) — السيرفر استجاب بالبيانات المطلوبة بنجاح.',
    en: '200 OK — Request succeeded and payload was returned.',
    fixAr: 'تحقق من بنية الـ JSON وتأكد من عدم وجود رسالة خطأ مخفية داخل الجسم.',
    fixEn: 'Verify response schema and ensure no soft-error fields exist inside JSON.',
  },
  201: {
    ar: 'تم الإنشاء بنجاح (201 Created) — تم إنشاء المورد الجديد على السيرفر.',
    en: '201 Created — Resource was successfully created on the server.',
    fixAr: 'يمكنك استخراج الـ id أو الـ Location Header لاستخدامه في الطلبات التالية.',
    fixEn: 'Extract the new resource ID or Location header for chained requests.',
  },
  204: {
    ar: 'نجاح بدون محتوى (204 No Content) — تمت العملية بنجاح ولا يوجد جسم للرد.',
    en: '204 No Content — Action succeeded with an intentionally empty body.',
    fixAr: 'طبيعي جداً في عمليات DELETE أو PUT أو CORS Preflight OPTIONS.',
    fixEn: 'Expected for DELETE, PUT updates, or CORS OPTIONS preflight responses.',
  },
  301: {
    ar: 'تحويل دائم (301 Moved Permanently) — تم نقل الرابط لعنوان جديد.',
    en: '301 Moved Permanently — Endpoint has permanently moved to Location header.',
    fixAr: 'قم بتحديث الرابط في الكوليكشن إلى الرابط الموجود في هيدر Location.',
    fixEn: 'Update your collection endpoint URL to the target in the Location header.',
  },
  302: {
    ar: 'تحويل مؤقت (302 Found) — السيرفر يوجه الطلب إلى رابط آخر.',
    en: '302 Found — Temporary redirect to another URI.',
    fixAr: 'أحياناً يدل على تحويل لصفحة تسجيل الدخول إذا لم يتم إرسال Session/Token.',
    fixEn: 'Often indicates redirect to a login page when session/cookie auth is missing.',
  },
  304: {
    ar: 'لم يتغير المحتوى (304 Not Modified) — النسخة المخبأة (Cache) لا تزال صالحة.',
    en: '304 Not Modified — Cached version matches ETag / If-Modified-Since.',
    fixAr: 'احذف هيدر If-None-Match أو If-Modified-Since لجلب البيانات كاملة.',
    fixEn: 'Remove If-None-Match / If-Modified-Since headers to force full payload.',
  },
  400: {
    ar: 'طلب غير صالح (400 Bad Request) — السيرفر رفض صيغة البيانات أو الحقول المرسلة.',
    en: '400 Bad Request — Server rejected malformed syntax or missing required fields.',
    fixAr: 'راجع الـ JSON Body والـ Query Params وتأكد من مطابقة أنواع البيانات المطلوبة.',
    fixEn: 'Check JSON syntax, required fields, and query parameter types.',
  },
  401: {
    ar: 'غير مصرح (401 Unauthorized) — التوكن مفقود أو منتهي الصلاحية أو غير صحيح.',
    en: '401 Unauthorized — Missing, invalid, or expired authentication credentials.',
    fixAr: 'افحص تبويب Auth وتأكد من صلاحية الـ Bearer JWT أو الـ API Key.',
    fixEn: 'Check Auth tab and verify Bearer token / API key validity and expiration.',
  },
  403: {
    ar: 'ممنوع الوصول (403 Forbidden) — التوكن صحيح لكن لا يملك صلاحية لهذا المورد أو محظور بواسطة WAF.',
    en: '403 Forbidden — Authenticated identity lacks permission, or blocked by WAF/Firewall.',
    fixAr: 'تحقق من صلاحيات المستخدم (Roles/Scopes) أو هيدر User-Agent / Origin.',
    fixEn: 'Verify user role/scopes, IP allowlist, or WAF headers.',
  },
  404: {
    ar: 'غير موجود (404 Not Found) — المسار (Endpoint) أو العنصر المطلوب غير موجود.',
    en: '404 Not Found — Endpoint route or target resource ID does not exist.',
    fixAr: 'تأكد من مسار الرابط (مثلاً /api/v1/...) ومن صحة الـ ID المرسل ونوع الـ Method.',
    fixEn: 'Double-check base path (/api/v1), resource ID, and HTTP method.',
  },
  405: {
    ar: 'الطريقة غير مسموحة (405 Method Not Allowed) — المسار موجود لكن لا يقبل هذا الـ HTTP Method.',
    en: '405 Method Not Allowed — Route exists but rejects this HTTP verb.',
    fixAr: 'راجع هيدر Allow في الرد لمعرفة الطرق المسموحة (مثل POST بدلاً من GET).',
    fixEn: 'Inspect the Allow response header to see supported HTTP methods.',
  },
  422: {
    ar: 'خطأ تحقق من البيانات (422 Unprocessable Entity) — فشل Validation على الحقول المرسلة.',
    en: '422 Unprocessable Entity — Semantic validation failed on request fields.',
    fixAr: 'اقرأ تفاصيل الحقول المرفوضة داخل جسم الرد (errors) وعدّل القيم.',
    fixEn: 'Inspect validation error details inside the JSON response body.',
  },
  429: {
    ar: 'تجاوز حد الطلبات (429 Too Many Requests) — تم تفعيل حماية الـ Rate Limiting.',
    en: '429 Too Many Requests — Rate limit exceeded.',
    fixAr: 'راجع هيدر Retry-After أو X-RateLimit-Reset وانتظر قبل إعادة المحاولة.',
    fixEn: 'Check Retry-After / X-RateLimit-Reset headers and throttle concurrency.',
  },
  500: {
    ar: 'خطأ داخلي في السيرفر (500 Internal Server Error) — حدث استثناء برمجي غير معالج في الباك إند.',
    en: '500 Internal Server Error — Unhandled backend exception or database crash.',
    fixAr: 'راجع سجلات السيرفر (Backend Logs) وتأكد من عدم إرسال قيم null غير متوقعة.',
    fixEn: 'Check backend server logs; this indicates a server-side bug or DB failure.',
  },
  502: {
    ar: 'بوابة سيئة (502 Bad Gateway) — الـ Reverse Proxy (مثل Nginx/Cloudflare) فشل في الاتصال بالسيرفر الخلفي.',
    en: '502 Bad Gateway — Upstream application server returned an invalid response to gateway.',
    fixAr: 'تأكد أن خدمة الباك إند تعمل وليست متوقفة خلف الـ Proxy.',
    fixEn: 'Verify the upstream application process/container is running.',
  },
  503: {
    ar: 'الخدمة غير متاحة (503 Service Unavailable) — السيرفر تحت الصيانة أو مضغوط بالكامل.',
    en: '503 Service Unavailable — Server overloaded or undergoing maintenance.',
    fixAr: 'أعد المحاولة بعد قليل وتحقق من حالة الخدمة (Health Check).',
    fixEn: 'Retry shortly and inspect infrastructure health/scaling.',
  },
  504: {
    ar: 'انتهاء مهلة البوابة (504 Gateway Timeout) — السيرفر الخلفي استغرق وقتاً طويلاً جداً للرد.',
    en: '504 Gateway Timeout — Upstream server failed to respond before proxy timeout.',
    fixAr: 'تحقق من الاستعلامات البطيئة (Slow SQL Queries) أو الخدمات الخارجية المعلقة.',
    fixEn: 'Investigate slow database queries or hanging downstream API calls.',
  },
};

function generateTsInterfaces(data: unknown): string {
  if (data === undefined || data === null) return '// No JSON body to generate TypeScript interfaces';
  const interfaces: string[] = [];
  const seenNames = new Map<string, string>();

  const capitalize = (s: string) =>
    s
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase()) || 'Item';

  function inferType(val: unknown, hintName: string, depth: number): string {
    if (val === null) return 'null';
    if (val === undefined) return 'unknown';
    const t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean') return t;

    if (Array.isArray(val)) {
      if (val.length === 0) return 'unknown[]';
      const elemType = inferType(val[0], `${hintName}Item`, depth + 1);
      return `${elemType}[]`;
    }

    if (t === 'object') {
      if (depth > 5) return 'Record<string, unknown>';
      const entries = Object.entries(val as Record<string, unknown>);
      if (entries.length === 0) return 'Record<string, never>';

      const ifaceName = capitalize(hintName);
      const lines = entries.map(([k, v]) => {
        const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        const propType = inferType(v, k, depth + 1);
        return `  ${safeKey}: ${propType};`;
      });
      const body = `export interface ${ifaceName} {\n${lines.join('\n')}\n}`;
      if (!seenNames.has(ifaceName)) {
        seenNames.set(ifaceName, body);
        interfaces.push(body);
      }
      return ifaceName;
    }
    return 'unknown';
  }

  if (Array.isArray(data)) {
    const itemType = data.length > 0 ? inferType(data[0], 'ResponseItem', 0) : 'unknown';
    interfaces.push(`export type ApiResponse = ${itemType}[];`);
  } else if (typeof data === 'object') {
    inferType(data, 'ApiResponse', 0);
  } else {
    return `export type ApiResponse = ${typeof data};`;
  }

  return interfaces.reverse().join('\n\n');
}

export function analyzeResponse(res: ProxyExecutionResult): ResponseDiagnosis {
  const assertions: SmartAssertion[] = [];
  const discoveredLinksSet = new Set<string>();
  const variableCandidates: ExtractedResponseVariable[] = [];

  if (!res.ok || res.status === 0) {
    const code = res.errorCode || 'ERR_NETWORK';
    let adviceAr = 'تأكد من صحة الدومين، وتشغيل السيرفر المحلي إذا كان localhost، واتصال الإنترنت.';
    let adviceEn = 'Verify domain spelling, internet connectivity, or that your localhost server is running.';
    if (code === 'ECONNREFUSED') {
      adviceAr = 'تم رفض الاتصال (ECONNREFUSED) — السيرفر على هذا البورت متوقف حالياً.';
      adviceEn = 'Connection Refused (ECONNREFUSED) — No service is listening on the target host:port.';
    } else if (code === 'ENOTFOUND') {
      adviceAr = 'فشل DNS (ENOTFOUND) — اسم النطاق (Domain) غير موجود أو يحتوي على متغير غير معوّض.';
      adviceEn = 'DNS Lookup Failed (ENOTFOUND) — Hostname could not be resolved or has unresolved variables.';
    } else if (code === 'ETIMEDOUT') {
      adviceAr = 'انتهت مهلة الانتظار (Timeout) — السيرفر لم يستجب خلال الوقت المحدد.';
      adviceEn = 'Request Timed Out — Server took too long to send response headers.';
    }

    assertions.push({
      id: 'net_ok',
      passed: false,
      level: 'fail',
      titleAr: 'فشل الاتصال بالشبكة / السيرفر',
      titleEn: 'Network Transport Failed',
      detailAr: res.error || code,
      detailEn: res.error || code,
    });

    return {
      headlineAr: `خطأ اتصال بالشبكة (${code})`,
      headlineEn: `Network Connection Error (${code})`,
      adviceAr,
      adviceEn,
      assertions,
      discoveredLinks: [],
      variableCandidates: [],
      typescriptInterfaces: '// No response payload',
      dataSummaryAr: 'لا توجد بيانات بسبب فشل الاتصال',
      dataSummaryEn: 'No payload received due to transport error',
    };
  }

  const known = STATUS_DIAGNOSIS[res.status] || {
    ar: `استجابة HTTP بكود ${res.status} ${res.statusText}`,
    en: `HTTP ${res.status} ${res.statusText} response`,
    fixAr: res.status >= 400 ? 'افحص جسم الرد والهيدرز لمعرفة سبب الخطأ.' : 'استجابة سليمة.',
    fixEn: res.status >= 400 ? 'Inspect response payload and headers for error context.' : 'Response received.',
  };

  // 1. Status Code Assertion
  const is2xx = res.status >= 200 && res.status < 300;
  const is3xx = res.status >= 300 && res.status < 400;
  assertions.push({
    id: 'http_status',
    passed: is2xx || is3xx,
    level: is2xx ? 'pass' : is3xx ? 'warn' : 'fail',
    titleAr: `كود الاستجابة HTTP ${res.status} ${res.statusText}`,
    titleEn: `HTTP Status ${res.status} ${res.statusText}`,
    detailAr: known.ar,
    detailEn: known.en,
  });

  // 2. Soft-Error Trap Detection (200 OK containing `{ error: ... }` or `{ success: false }`)
  if (is2xx && res.bodyJson && typeof res.bodyJson === 'object' && !Array.isArray(res.bodyJson)) {
    const obj = res.bodyJson as Record<string, unknown>;
    const hasFalseSuccess =
      obj.success === false || obj.ok === false || obj.status === 'error' || obj.status === 'fail';
    const hasErrorField =
      (typeof obj.error === 'string' && obj.error.length > 0) ||
      (obj.error && typeof obj.error === 'object') ||
      (Array.isArray(obj.errors) && obj.errors.length > 0);

    if (hasFalseSuccess || hasErrorField) {
      assertions.push({
        id: 'soft_error_trap',
        passed: false,
        level: 'warn',
        titleAr: 'تنبيه ذكي: خطأ منطقي مخفي داخل كود 200 (Soft-Error Trap)!',
        titleEn: 'Smart Alert: Soft-Error Trap detected inside 200 OK!',
        detailAr:
          'السيرفر أرجع كود HTTP 200 لكن الـ JSON يحتوي على حقل خطأ (`error` / `errors` / `success: false`).',
        detailEn:
          'Server returned HTTP 200 OK, yet the JSON body reports failure (`error`, `errors`, or `success: false`).',
      });
    }
  }

  // 3. Latency SLA Assertion
  const totalMs = res.timings?.totalMs || 0;
  assertions.push({
    id: 'latency_sla',
    passed: totalMs < 1200,
    level: totalMs < 400 ? 'pass' : totalMs < 1200 ? 'warn' : 'fail',
    titleAr:
      totalMs < 400
        ? `سرعة استجابة ممتازة (${Math.round(totalMs)} ms)`
        : totalMs < 1200
        ? `سرعة استجابة متوسطة (${Math.round(totalMs)} ms)`
        : `استجابة بطيئة (${Math.round(totalMs)} ms > 1200ms)`,
    titleEn:
      totalMs < 400
        ? `Fast response latency (${Math.round(totalMs)} ms)`
        : totalMs < 1200
        ? `Moderate response latency (${Math.round(totalMs)} ms)`
        : `Slow response latency (${Math.round(totalMs)} ms > 1200ms)`,
    detailAr: `زمن معالجة السيرفر (TTFB): ${Math.round(res.timings?.ttfbMs || 0)} ms`,
    detailEn: `Server TTFB processing: ${Math.round(res.timings?.ttfbMs || 0)} ms`,
  });

  // 4. Content-Type & JSON Integrity Assertion
  const ct = (res.contentType || '').toLowerCase();
  if (ct.includes('json')) {
    const validJson = res.bodyJson !== undefined || res.status === 204 || !res.bodyText.trim();
    assertions.push({
      id: 'json_integrity',
      passed: validJson,
      level: validJson ? 'pass' : 'fail',
      titleAr: validJson ? 'بنية JSON سليمة ومطابقة للهيدر' : 'تعارض: الهيدر JSON لكن النص تالف!',
      titleEn: validJson ? 'Valid JSON matching Content-Type' : 'Malformed JSON despite application/json header',
      detailAr: `Content-Type: ${res.contentType}`,
      detailEn: `Content-Type: ${res.contentType}`,
    });
  }

  // 5. CORS & Security Headers Audit
  const corsOrigin = res.headers['access-control-allow-origin'];
  const hasSecurityHeaders = Boolean(
    res.headers['strict-transport-security'] ||
      res.headers['x-content-type-options'] ||
      res.headers['content-security-policy']
  );
  assertions.push({
    id: 'cors_sec',
    passed: true,
    level: hasSecurityHeaders ? 'pass' : 'warn',
    titleAr: corsOrigin
      ? `يدعم المتصفح CORS (${corsOrigin})`
      : 'لا يوجد هيدر CORS في هذا الرد (يعمل عبر البروكسي الذكي بدون مشاكل)',
    titleEn: corsOrigin
      ? `CORS Enabled (Allow-Origin: ${corsOrigin})`
      : 'No CORS Allow-Origin header (Executed cleanly via Nexus Node Proxy)',
    detailAr: hasSecurityHeaders
      ? 'تم رصد هيدرز الحماية القياسية (HSTS / X-Content-Type-Options).'
      : 'تنبيه أمني بسيط: السيرفر لا يرسل هيدرز HSTS أو X-Content-Type-Options.',
    detailEn: hasSecurityHeaders
      ? 'Standard security headers (HSTS / nosniff) present.'
      : 'Minor hardening note: HSTS / X-Content-Type-Options headers missing.',
  });

  // Extract links from headers (`Location`, `Link`) and body
  if (res.headers['location'] && /^https?:\/\//i.test(res.headers['location'])) {
    discoveredLinksSet.add(res.headers['location']);
  }
  if (res.headers['link']) {
    const linkMatches = res.headers['link'].match(/https?:\/\/[^>\s";]+/gi) || [];
    for (const lm of linkMatches) discoveredLinksSet.add(lm);
  }
  if (!res.isBase64 && res.bodyText) {
    const bodyUrls = res.bodyText.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
    for (const bu of bodyUrls.slice(0, 60)) {
      discoveredLinksSet.add(bu.replace(/[.,;)\]]+$/, ''));
    }
  }

  // Walk JSON response to summarize shape AND detect chainable tokens/IDs
  let dataSummaryAr = `حجم البيانات: ${res.sizeBytes} بايت`;
  let dataSummaryEn = `Payload size: ${res.sizeBytes} bytes`;

  if (res.bodyJson !== undefined) {
    if (Array.isArray(res.bodyJson)) {
      dataSummaryAr = `مصفوفة JSON تحتوي على ${res.bodyJson.length} عنصر`;
      dataSummaryEn = `JSON Array containing ${res.bodyJson.length} items`;
    } else if (res.bodyJson && typeof res.bodyJson === 'object') {
      const keys = Object.keys(res.bodyJson as Record<string, unknown>);
      dataSummaryAr = `كائن JSON يحتوي على ${keys.length} حقول رئيسية (${keys.slice(0, 5).join(', ')})`;
      dataSummaryEn = `JSON Object with ${keys.length} root keys (${keys.slice(0, 5).join(', ')})`;
    }

    const tokenFieldRe = /^(token|access_?token|accesstoken|jwt|id_?token|refresh_?token|api_?key|session_?id)$/i;
    const idFieldRe = /^(id|_id|uuid|user_?id|order_?id)$/i;

    const scanCandidates = (node: unknown, path: string, depth: number) => {
      if (!node || typeof node !== 'object' || depth > 3 || variableCandidates.length >= 10) return;
      if (Array.isArray(node)) {
        if (node[0] && typeof node[0] === 'object') {
          scanCandidates(node[0], `${path}[0]`, depth + 1);
        }
        return;
      }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const nextPath = path ? `${path}.${k}` : k;
        if ((typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '') {
          const strVal = String(v);
          if (tokenFieldRe.test(k)) {
            variableCandidates.push({
              keySuggestion: k === 'access_token' ? 'token' : k,
              jsonPath: nextPath,
              value: strVal,
              isToken: true,
            });
          } else if (idFieldRe.test(k) && depth <= 2) {
            variableCandidates.push({
              keySuggestion: k === 'id' ? 'resourceId' : k,
              jsonPath: nextPath,
              value: strVal,
              isToken: false,
            });
          }
        } else if (v && typeof v === 'object') {
          scanCandidates(v, nextPath, depth + 1);
        }
      }
    };

    scanCandidates(res.bodyJson, '', 0);
  }

  return {
    headlineAr: known.ar,
    headlineEn: known.en,
    adviceAr: known.fixAr,
    adviceEn: known.fixEn,
    assertions,
    discoveredLinks: Array.from(discoveredLinksSet),
    variableCandidates,
    typescriptInterfaces:
      res.bodyJson !== undefined ? generateTsInterfaces(res.bodyJson) : '// Response is not JSON',
    dataSummaryAr,
    dataSummaryEn,
  };
}


import {
  ApiRequestItem,
  EnvVariable,
  HttpMethod,
  ProxyExecutionResult,
  ScenarioRunOutcome,
  ScenarioTestCase,
} from '../types/api';
import { buildExecutableRequest, uid } from './helpers';

/**
 * Generate a comprehensive "All Responses" Scenario Matrix for an endpoint
 * to test 2xx baseline, 401/403 Auth enforcement, 400/422 validation vs 500 crashes,
 * 405 Method Not Allowed, CORS OPTIONS preflight, and query edge-cases!
 */
export function buildAllResponsesScenarios(
  req: ApiRequestItem,
  envVars: EnvVariable[]
): ScenarioTestCase[] {
  const base = buildExecutableRequest(req, envVars);
  const scenarios: ScenarioTestCase[] = [];

  // 1. Happy Path / Baseline Request
  scenarios.push({
    id: uid('scn'),
    category: 'happy',
    nameAr: '1. الطلب الأساسي القياسي (Baseline Request)',
    nameEn: '1. Baseline Standard Request',
    descriptionAr: 'إرسال الطلب بكامل إعداداته الحالية لفحص الاستجابة الطبيعية (2xx).',
    descriptionEn: 'Executes the request as configured to verify standard 2xx response.',
    expectedBehaviorAr: 'متوقع 200 / 201 / 204 مع بيانات سليمة',
    expectedBehaviorEn: 'Expected 200 / 201 / 204 valid response',
    method: base.method,
    url: base.url,
    headers: { ...base.headers },
    body: base.body,
  });

  // 2. Unauthenticated Probe (strip Authorization / API Key)
  const strippedHeaders: Record<string, string> = {};
  let hadAuth = false;
  for (const [k, v] of Object.entries(base.headers)) {
    if (/^(authorization|x-api-key|api-key|x-auth-token|cookie)$/i.test(k)) {
      hadAuth = true;
      continue;
    }
    strippedHeaders[k] = v;
  }
  scenarios.push({
    id: uid('scn'),
    category: 'no-auth',
    nameAr: '2. اختبار بدون مصادقة (No-Auth Security Probe)',
    nameEn: '2. Unauthenticated Access Probe (No Auth)',
    descriptionAr: hadAuth
      ? 'إزالة التوكن/المفتاح للتحقق هل السيرفر يحمي المسار بكود 401/403 أم يسمح بالدخول.'
      : 'إرسال الطلب بدون هيدر Authorization لفحص سلوك الحماية.',
    descriptionEn: 'Strips auth headers to verify whether endpoint enforces 401/403 or is public.',
    expectedBehaviorAr: hadAuth ? 'متوقع 401 أو 403 إذا كان المسار محمياً' : '200 إذا كان عاماً أو 401 إذا كان محمياً',
    expectedBehaviorEn: hadAuth ? 'Expected 401 or 403 for protected endpoint' : '200 if public, 401 if protected',
    method: base.method,
    url: base.url,
    headers: strippedHeaders,
    body: base.body,
  });

  // 3. Invalid / Tampered Bearer Token Probe
  scenarios.push({
    id: uid('scn'),
    category: 'bad-token',
    nameAr: '3. اختبار توكن مزيف / تالف (Invalid JWT Probe)',
    nameEn: '3. Tampered / Invalid Bearer Token Probe',
    descriptionAr: 'إرسال توكن JWT غير صالح لاختبار معالجة الخطأ (401 بدلاً من انهيار السيرفر 500).',
    descriptionEn: 'Sends a malformed Bearer token to ensure clean 401 handling without 500 crashes.',
    expectedBehaviorAr: 'متوقع 401 Unauthorized (أو تجاهل إذا كان عاماً) — وليس 500',
    expectedBehaviorEn: 'Expected 401 Unauthorized (or 2xx if public) — never 500',
    method: base.method,
    url: base.url,
    headers: {
      ...strippedHeaders,
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid_payload.invalid_sig',
    },
    body: base.body,
  });

  // 4. Malformed JSON / Validation Probe (for POST/PUT/PATCH, or force POST check)
  if (['POST', 'PUT', 'PATCH'].includes(base.method)) {
    scenarios.push({
      id: uid('scn'),
      category: 'malformed-body',
      nameAr: '4. اختبار JSON تالف والتحقق من المدخلات (Malformed JSON Fuzz)',
      nameEn: '4. Malformed JSON Payload Resilience',
      descriptionAr: 'إرسال نص JSON مكسور لاختبار هل السيرفر يرجع 400/422 نظيف أم ينهار بـ 500.',
      descriptionEn: 'Sends broken JSON syntax to verify clean 400/422 parser handling vs 500 crash.',
      expectedBehaviorAr: 'متوقع 400 Bad Request أو 422 — عدم حدوث 500',
      expectedBehaviorEn: 'Expected 400 Bad Request / 422 — must not crash with 500',
      method: base.method,
      url: base.url,
      headers: { ...base.headers, 'Content-Type': 'application/json' },
      body: '{"__broken_json": true, "unclosed": [1, 2',
    });
  } else {
    // Query Parameter Boundary Fuzz for GET/DELETE
    const sep = base.url.includes('?') ? '&' : '?';
    scenarios.push({
      id: uid('scn'),
      category: 'query-fuzz',
      nameAr: '4. اختبار معاملات استعلام حدّية (Boundary Query Params)',
      nameEn: '4. Boundary Query Parameters Probe',
      descriptionAr: 'إرسال قيم حدّية (`limit=-1&page=invalid`) لاختبار قوة Validation في السيرفر.',
      descriptionEn: 'Appends boundary query values (`limit=-1&page=invalid`) to test input validation.',
      expectedBehaviorAr: 'متوقع 200 أو 400/422 منظم — عدم حدوث 500',
      expectedBehaviorEn: 'Expected graceful 200 or 400/422 — never 500',
      method: base.method,
      url: `${base.url}${sep}limit=-1&page=invalid_type`,
      headers: { ...base.headers },
      body: null,
    });
  }

  // 5. Wrong HTTP Method Probe (405 Method Not Allowed check)
  const alternateMethod: HttpMethod =
    base.method === 'GET' ? 'PATCH' : base.method === 'DELETE' ? 'POST' : 'DELETE';
  scenarios.push({
    id: uid('scn'),
    category: 'wrong-method',
    nameAr: `5. اختبار طريقة HTTP مغايرة (${alternateMethod})`,
    nameEn: `5. Alternate HTTP Verb Probe (${alternateMethod})`,
    descriptionAr: `اختبار رد السيرفر عند استدعاء نفس الرابط بطريقة ${alternateMethod} (فحص 405 / 404 / Allow Header).`,
    descriptionEn: `Tests endpoint behavior with ${alternateMethod} verb (405 Method Not Allowed check).`,
    expectedBehaviorAr: 'متوقع 405 أو 404 أو 401/403',
    expectedBehaviorEn: 'Expected 405, 404, or 401/403',
    method: alternateMethod,
    url: base.url,
    headers: { ...base.headers },
    body: alternateMethod === 'PATCH' ? '{}' : null,
  });

  // 6. Browser CORS Preflight (OPTIONS) Probe
  scenarios.push({
    id: uid('scn'),
    category: 'cors-preflight',
    nameAr: '6. فحص توافق المتصفحات (CORS Preflight OPTIONS)',
    nameEn: '6. Browser CORS Preflight (OPTIONS)',
    descriptionAr: 'محاكاة طلب متصفح Preflight لفحص هيدرز Access-Control-Allow-Origin & Methods.',
    descriptionEn: 'Simulates browser CORS preflight to inspect Access-Control-Allow-* headers.',
    expectedBehaviorAr: 'متوقع 200 / 204 مع هيدرز Access-Control-Allow-*',
    expectedBehaviorEn: 'Expected 200 / 204 with Access-Control-Allow-* headers',
    method: 'OPTIONS',
    url: base.url,
    headers: {
      Origin: 'https://app.example.com',
      'Access-Control-Request-Method': base.method,
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
    body: null,
  });

  return scenarios;
}

/**
 * Evaluate the outcome of a scenario run into pass / warn / fail with bilingual diagnosis.
 */
export function evaluateScenarioOutcome(
  scenario: ScenarioTestCase,
  res: ProxyExecutionResult,
  hadConfiguredAuth: boolean
): Pick<ScenarioRunOutcome, 'verdict' | 'verdictAr' | 'verdictEn'> {
  if (!res.ok || res.status === 0) {
    return {
      verdict: 'fail',
      verdictAr: `فشل الاتصال (${res.errorCode || 'Network Error'})`,
      verdictEn: `Transport Error (${res.errorCode || 'Network Error'})`,
    };
  }

  if (res.status >= 500) {
    return {
      verdict: 'fail',
      verdictAr: `خطير: السيرفر انهار بكود ${res.status}! يحتاج معالجة استثناءات.`,
      verdictEn: `Critical: Server crashed with ${res.status}! Needs exception handling.`,
    };
  }

  switch (scenario.category) {
    case 'happy': {
      if (res.status >= 200 && res.status < 300) {
        return {
          verdict: 'pass',
          verdictAr: `استجابة ناجحة (${res.status})`,
          verdictEn: `Healthy baseline (${res.status})`,
        };
      }
      return {
        verdict: 'warn',
        verdictAr: `الطلب الأساسي أرجع ${res.status} — راجع الإعدادات أو التوكن`,
        verdictEn: `Baseline returned ${res.status} — check auth or parameters`,
      };
    }

    case 'no-auth': {
      if (res.status === 401 || res.status === 403) {
        return {
          verdict: 'pass',
          verdictAr: `محمي بشكل ممتاز (${res.status} رفض بدون توكن)`,
          verdictEn: `Properly protected (${res.status} when unauthenticated)`,
        };
      }
      if (hadConfiguredAuth && res.status >= 200 && res.status < 300) {
        return {
          verdict: 'warn',
          verdictAr: `تنبيه: المسار قَبِل الطلب (${res.status}) رغم إزالة التوكن! تأكد هل هو عام أم ثغرة صلاحيات.`,
          verdictEn: `Notice: Endpoint returned ${res.status} without auth! Confirm if intentionally public.`,
        };
      }
      return {
        verdict: 'pass',
        verdictAr: `مسار عام (${res.status})`,
        verdictEn: `Public endpoint (${res.status})`,
      };
    }

    case 'bad-token': {
      if (res.status === 401 || res.status === 403) {
        return {
          verdict: 'pass',
          verdictAr: `رفض التوكن المزيف بنجاح (${res.status})`,
          verdictEn: `Rejected tampered JWT cleanly (${res.status})`,
        };
      }
      return {
        verdict: 'warn',
        verdictAr: `السيرفر تجاهل التوكن المزيف وأرجع ${res.status}`,
        verdictEn: `Server ignored invalid Bearer token (${res.status})`,
      };
    }

    case 'malformed-body': {
      if (res.status === 400 || res.status === 422 || res.status === 415) {
        return {
          verdict: 'pass',
          verdictAr: `معالجة ممتازة للـ JSON التالف (${res.status} بدون انهيار)`,
          verdictEn: `Clean malformed JSON rejection (${res.status})`,
        };
      }
      return {
        verdict: 'warn',
        verdictAr: `السيرفر أرجع ${res.status} بدلاً من 400 عند إرسال JSON تالف`,
        verdictEn: `Returned ${res.status} instead of 400 on broken JSON`,
      };
    }

    case 'cors-preflight': {
      const allowOrigin = res.headers['access-control-allow-origin'];
      if (allowOrigin) {
        return {
          verdict: 'pass',
          verdictAr: `يدعم CORS في المتصفح (Origin: ${allowOrigin})`,
          verdictEn: `CORS Preflight supported (Origin: ${allowOrigin})`,
        };
      }
      return {
        verdict: 'warn',
        verdictAr: `لا يرسل هيدر Access-Control-Allow-Origin (سيرفضه المتصفح مباشرة بدون Proxy)`,
        verdictEn: `Missing Access-Control-Allow-Origin (Browser fetch will be blocked by CORS)`,
      };
    }

    default: {
      return {
        verdict: 'pass',
        verdictAr: `استجاب بكود ${res.status} بدون أخطاء 500`,
        verdictEn: `Handled gracefully with HTTP ${res.status}`,
      };
    }
  }
}


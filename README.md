# NEXUS API Studio 🚀

منصة حديثة وذكية لاختبار واجهات البرمجة (APIs)، فحص كل سيناريوهات الردود، وتحليل ملفات الـ JSON Collections والروابط بدون مشاكل CORS.

## التشغيل السريع (Quick Start)

1. اضغط مرتين على `start-studio.bat` لفتح الأداة مباشرة، أو من التيرمينال:
```bash
npm run dev
```
2. افتح المتصفح على: `http://localhost:4080`

## أبرز المميزات الهندسية

- **Node.js Proxy Engine بدون مشاكل CORS**: ينفذ جميع طلبات HTTP/HTTPS من خلال محرك Node مدمج مع قياس دقيق لأزمنة الشبكة (`DNS`, `TCP`, `TLS`, `TTFB`, `Download`) وفحص شهادات SSL وتتبع التحويلات (`301/302`).
- **اختبار كل الردود (All Responses Scenario Matrix ⚡)**: بضغطة واحدة يختبر 6 سيناريوهات تلقائياً على أي Endpoint (`2xx` الأساسي، `No-Auth 401`، توكن JWT تالف، `Malformed JSON 400` للتأكد من عدم انهيار السيرفر بـ `500`، `Wrong HTTP Verb 405`، وفحص `CORS Preflight OPTIONS`).
- **محلل الكوليكشن والروابط الشامل (Universal JSON & Links Analyzer)**:
  - اسحب وأفلت أي ملف `.json` أو `.har` في أي مكان بالنافذة.
  - يدعم تلقائياً: **Postman v2.0 / v2.1**، **OpenAPI 3.x / Swagger 2.0** (مع توليد JSON تجريبي من الـ Schema)، **Insomnia v4**، **HAR 1.2**، **Thunder Client / Hoppscotch**، أو **أي ملف JSON مخصص يحتوي على روابط**.
  - يستخرج جميع الروابط، يحلل بنيتها (`Host`, `HTTPS/HTTP`, `Path Params`, `Query Keys`, `{{Variables}}`)، ويوفر **فحصاً حياً جماعياً لكل الروابط (Live Link Health Prober)** و**اختباراً جماعياً لكل الكوليكشن (Batch Runner)**.
- **ذكاء استكشاف الردود**:
  - عارض شجري تفاعلي `JSON Tree` مع بحث فوري وروابط قابلة للاختبار بضغطة زر.
  - اكتشاف الأخطاء المنطقية المخفية داخل كود `200 OK` (*Soft-Error Trap Detection*).
  - استخراج وحفظ التوكنات والمعرّفات (`token`, `id`) بضغطة واحدة في `{{variables}}`.
  - توليد تلقائي لـ **TypeScript Interfaces** وأكواد جاهزة لـ `cURL` و `Fetch` و `Axios` و `Python`.


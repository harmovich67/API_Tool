import React, { useMemo, useState } from 'react';
import {
  Send,
  Zap,
  Plus,
  Trash2,
  Wand2,
  Check,
  Copy,
  KeyRound,
  Code2,
  BookOpen,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  ApiRequestItem,
  EnvVariable,
  HttpMethod,
  KeyValueItem,
  Language,
  SavedExampleResponse,
} from '../types/api';
import {
  buildExecutableRequest,
  createKV,
  interpolateString,
  METHOD_STYLES,
  tryDecodeJwt,
} from '../utils/helpers';
import { generateCodeSnippet, parseCurlCommand } from '../utils/curlUtils';

interface RequestBuilderProps {
  request: ApiRequestItem;
  envVars: EnvVariable[];
  lang: Language;
  isSending: boolean;
  isRunningMatrix: boolean;
  onChange: (updated: ApiRequestItem) => void;
  onSend: () => void;
  onRunAllResponsesMatrix: () => void;
  onLoadSavedResponse: (saved: SavedExampleResponse) => void;
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const KeyValueTable: React.FC<{
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  keyPlaceholder?: string;
  valPlaceholder?: string;
  lang: Language;
}> = ({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valPlaceholder = 'Value',
  lang,
}) => {
  const updateRow = (id: string, patch: Partial<KeyValueItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeRow = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const addRow = () => {
    onChange([...items, createKV('', '', true)]);
  };

  return (
    <div className="space-y-1.5" dir="ltr">
      {items.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => updateRow(row.id, { enabled: e.target.checked })}
            className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer shrink-0"
          />
          <input
            type="text"
            value={row.key}
            onChange={(e) => updateRow(row.id, { key: e.target.value })}
            placeholder={keyPlaceholder}
            className="w-1/3 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-sky-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/70"
          />
          <input
            type="text"
            value={row.value}
            onChange={(e) => updateRow(row.id, { value: e.target.value })}
            placeholder={valPlaceholder}
            className="flex-1 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/70"
          />
          <button
            type="button"
            onClick={() => removeRow(row.id)}
            className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="mt-1 px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-xs font-medium inline-flex items-center gap-1.5 transition"
      >
        <Plus className="w-3.5 h-3.5 text-indigo-400" />
        <span>{lang === 'ar' ? 'إضافة حقل' : 'Add Row'}</span>
      </button>
    </div>
  );
};

export const RequestBuilder: React.FC<RequestBuilderProps> = ({
  request,
  envVars,
  lang,
  isSending,
  isRunningMatrix,
  onChange,
  onSend,
  onRunAllResponsesMatrix,
  onLoadSavedResponse,
}) => {
  const [activeTab, setActiveTab] = useState<
    'params' | 'auth' | 'headers' | 'body' | 'code' | 'examples'
  >('params');
  const [codeTarget, setCodeTarget] = useState<'curl' | 'fetch' | 'axios' | 'python'>('curl');
  const [copiedCode, setCopiedCode] = useState(false);

  const resolvedPreview = useMemo(
    () => buildExecutableRequest(request, envVars),
    [request, envVars]
  );

  const hasVariablesInUrl =
    request.url.includes('{{') ||
    request.url.includes('${') ||
    request.params.some((p) => p.enabled && p.key);

  const jsonValidation = useMemo(() => {
    if (request.body.mode !== 'json' || !request.body.rawText.trim()) {
      return { valid: true, error: null };
    }
    try {
      const interpolated = interpolateString(request.body.rawText, envVars);
      JSON.parse(interpolated);
      return { valid: true, error: null };
    } catch (e: any) {
      return { valid: false, error: e?.message || 'Invalid JSON' };
    }
  }, [request.body.mode, request.body.rawText, envVars]);

  const decodedAuthJwt = useMemo(() => {
    if (request.auth.type !== 'bearer' || !request.auth.bearerToken) return null;
    const resolvedTok = interpolateString(request.auth.bearerToken, envVars);
    return tryDecodeJwt(resolvedTok);
  }, [request.auth, envVars]);

  const handleUrlChange = (val: string) => {
    // Smart feature: if user pastes a full `curl ...` command directly into URL bar, auto-parse it!
    if (/^curl\s+/i.test(val.trim()) && val.trim().length > 15) {
      const parsed = parseCurlCommand(val);
      if (parsed) {
        onChange({ ...parsed, id: request.id, folderPath: request.folderPath });
        return;
      }
    }
    onChange({ ...request, url: val });
  };

  const prettifyJson = () => {
    try {
      const parsed = JSON.parse(request.body.rawText);
      onChange({
        ...request,
        body: { ...request.body, rawText: JSON.stringify(parsed, null, 2) },
      });
    } catch {
      // Try auto-fixing trailing commas before parsing
      try {
        const cleaned = request.body.rawText.replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(cleaned);
        onChange({
          ...request,
          body: { ...request.body, rawText: JSON.stringify(parsed, null, 2) },
        });
      } catch {
        // leave untouched
      }
    }
  };

  const addHeaderPreset = (key: string, value: string) => {
    const filtered = request.headers.filter((h) => h.key.toLowerCase() !== key.toLowerCase());
    onChange({
      ...request,
      headers: [...filtered, createKV(key, value, true)],
    });
  };

  const activeParamsCount = request.params.filter((p) => p.enabled && p.key.trim()).length;
  const activeHeadersCount = request.headers.filter((h) => h.enabled && h.key.trim()).length;
  const savedExamplesCount = request.savedResponses?.length || 0;

  return (
    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3.5 shadow-xl">
      {/* Editable Request Title & Folder Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          {request.folderPath.length > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-400 border border-slate-700/60 shrink-0">
              {request.folderPath.join(' / ')}
            </span>
          )}
          <input
            type="text"
            value={request.name}
            onChange={(e) => onChange({ ...request, name: e.target.value })}
            className="bg-transparent text-sm font-bold text-slate-100 focus:outline-none focus:bg-slate-900/70 rounded-lg px-2 py-0.5 flex-1 border border-transparent focus:border-slate-700"
            placeholder={lang === 'ar' ? 'اسم الطلب...' : 'Request title...'}
          />
        </div>
        <span className="text-[11px] text-slate-500 hidden sm:inline">
          {lang === 'ar'
            ? 'نصيحة: الصق أمر cURL مباشرة في شريط الرابط للاستيراد الفوري'
            : 'Tip: Paste any cURL command directly into URL bar'}
        </span>
      </div>

      {/* Main Method + URL + Send / Test All Responses Bar */}
      <div className="flex flex-col lg:flex-row items-stretch gap-2" dir="ltr">
        <div className="flex items-stretch flex-1 rounded-xl bg-slate-950/90 border border-slate-800 focus-within:border-indigo-500/80 transition overflow-hidden">
          <select
            value={request.method}
            onChange={(e) => onChange({ ...request, method: e.target.value as HttpMethod })}
            className={`bg-slate-900/90 px-3.5 py-2.5 font-mono text-xs font-extrabold border-r border-slate-800 focus:outline-none cursor-pointer ${
              METHOD_STYLES[request.method].text
            }`}
          >
            {METHODS.map((m) => (
              <option key={m} value={m} className="bg-slate-900 text-slate-100 font-mono">
                {m}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={request.url}
            onChange={(e) => handleUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey || e.key === 'Enter') && e.key === 'Enter') {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="https://api.example.com/v1/resource or {{baseUrl}}/users"
            className="flex-1 bg-transparent px-3.5 py-2.5 font-mono text-xs sm:text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
          />
        </div>

        <div className="flex items-stretch gap-2">
          <button
            type="button"
            disabled={isSending}
            onClick={onSend}
            className="flex-1 lg:flex-initial px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 inline-flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{lang === 'ar' ? 'إرسال (Send)' : 'Send'}</span>
          </button>

          <button
            type="button"
            disabled={isRunningMatrix}
            onClick={onRunAllResponsesMatrix}
            title={
              lang === 'ar'
                ? 'اختبار كل السيناريوهات والردود (200 / 401 بدون توكن / توكن مزيف / 400 JSON تالف / 405 Method / CORS)'
                : 'Auto-probe 6 scenarios (2xx, 401 No-Auth, Bad JWT, 400 Malformed Body, 405 Verb, CORS OPTIONS)'
            }
            className="px-3.5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 disabled:opacity-50 text-emerald-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            {isRunningMatrix ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{lang === 'ar' ? 'اختبار كل الردود' : 'All Responses'}</span>
          </button>
        </div>
      </div>

      {/* Live Resolved URL Preview when {{variables}} or Params exist */}
      {hasVariablesInUrl && (
        <div
          dir="ltr"
          className="text-[11px] font-mono px-3 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800/80 text-slate-400 flex items-center gap-2 overflow-x-auto"
        >
          <span className="text-indigo-400 font-semibold shrink-0">Resolved →</span>
          <span className="text-slate-300 truncate">{resolvedPreview.url}</span>
        </div>
      )}

      {/* Request Configuration Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800/80 pb-1">
        {[
          {
            id: 'params',
            labelAr: 'المعاملات (Params)',
            labelEn: 'Params',
            badge: activeParamsCount || null,
          },
          {
            id: 'auth',
            labelAr: 'المصادقة (Auth)',
            labelEn: 'Auth',
            badge: request.auth.type !== 'none' ? request.auth.type.toUpperCase() : null,
          },
          {
            id: 'headers',
            labelAr: 'الهيدرز (Headers)',
            labelEn: 'Headers',
            badge: activeHeadersCount || null,
          },
          {
            id: 'body',
            labelAr: 'الجسم (Body)',
            labelEn: 'Body',
            badge: request.body.mode !== 'none' ? request.body.mode.toUpperCase() : null,
          },
          {
            id: 'code',
            labelAr: 'توليد كود',
            labelEn: 'Code',
            badge: null,
          },
          ...(savedExamplesCount > 0
            ? [
                {
                  id: 'examples',
                  labelAr: 'أمثلة الردود',
                  labelEn: 'Saved Responses',
                  badge: savedExamplesCount,
                },
              ]
            : []),
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
              activeTab === t.id
                ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <span>{lang === 'ar' ? t.labelAr : t.labelEn}</span>
            {t.badge && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-indigo-300">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content Area */}
      <div className="min-h-[175px] max-h-[300px] overflow-y-auto pr-1">
        {activeTab === 'params' && (
          <KeyValueTable
            items={request.params}
            onChange={(params) => onChange({ ...request, params })}
            keyPlaceholder="Query key (e.g. page, limit)"
            valPlaceholder="Value (e.g. 1 or {{userId}})"
            lang={lang}
          />
        )}

        {activeTab === 'auth' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['none', 'bearer', 'apikey', 'basic'] as const).map((aType) => (
                <button
                  key={aType}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...request,
                      auth: { ...request.auth, type: aType },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    request.auth.type === aType
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {aType === 'none'
                    ? 'No Auth'
                    : aType === 'bearer'
                    ? 'Bearer Token / JWT'
                    : aType === 'apikey'
                    ? 'API Key'
                    : 'Basic Auth'}
                </button>
              ))}
            </div>

            {request.auth.type === 'none' && (
              <p className="text-xs text-slate-500 py-3">
                {lang === 'ar'
                  ? 'هذا الطلب لا يرسل مصادقة تلقائية. اختر Bearer Token أو API Key إذا كان المسار محمياً.'
                  : 'No automatic authentication attached to this request.'}
              </p>
            )}

            {request.auth.type === 'bearer' && (
              <div className="space-y-2.5" dir="ltr">
                <label className="block text-xs text-slate-400 font-medium">
                  Bearer Token (supports <code className="text-indigo-300">{'{{token}}'}</code>)
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={request.auth.bearerToken || ''}
                    onChange={(e) =>
                      onChange({
                        ...request,
                        auth: { ...request.auth, bearerToken: e.target.value },
                      })
                    }
                    placeholder="eyJhbGciOiJIUzI1NiIs... or {{demoToken}}"
                    className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-9 pr-3 py-2 font-mono text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {decodedAuthJwt && (
                  <div
                    className={`rounded-xl p-3 border text-xs font-mono space-y-1.5 ${
                      decodedAuthJwt.isExpired
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                        : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-sans font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        <span>
                          Live JWT Inspector ({String(decodedAuthJwt.header.alg || 'JWT')})
                        </span>
                      </span>
                      {decodedAuthJwt.expiresAt && (
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full ${
                            decodedAuthJwt.isExpired
                              ? 'bg-rose-500/30 text-rose-200'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {decodedAuthJwt.isExpired
                            ? `EXPIRED (${decodedAuthJwt.expiresAt})`
                            : `Valid until ${decodedAuthJwt.expiresAt}`}
                        </span>
                      )}
                    </div>
                    <pre className="text-[11px] text-slate-300 overflow-x-auto bg-slate-950/70 p-2 rounded-lg">
                      {JSON.stringify(decodedAuthJwt.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {request.auth.type === 'apikey' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" dir="ltr">
                <input
                  type="text"
                  value={request.auth.apiKeyName || ''}
                  onChange={(e) =>
                    onChange({
                      ...request,
                      auth: { ...request.auth, apiKeyName: e.target.value },
                    })
                  }
                  placeholder="Header/Param Name (X-API-Key)"
                  className="bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 font-mono text-xs text-sky-300 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  value={request.auth.apiKeyValue || ''}
                  onChange={(e) =>
                    onChange({
                      ...request,
                      auth: { ...request.auth, apiKeyValue: e.target.value },
                    })
                  }
                  placeholder="API Key Value or {{apiKey}}"
                  className="bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 font-mono text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
                />
                <select
                  value={request.auth.apiKeyIn || 'header'}
                  onChange={(e) =>
                    onChange({
                      ...request,
                      auth: {
                        ...request.auth,
                        apiKeyIn: e.target.value as 'header' | 'query',
                      },
                    })
                  }
                  className="bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="header">Send in HTTP Header</option>
                  <option value="query">Send in Query Params</option>
                </select>
              </div>
            )}

            {request.auth.type === 'basic' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" dir="ltr">
                <input
                  type="text"
                  value={request.auth.basicUser || ''}
                  onChange={(e) =>
                    onChange({
                      ...request,
                      auth: { ...request.auth, basicUser: e.target.value },
                    })
                  }
                  placeholder="Username"
                  className="bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 font-mono text-xs text-sky-300 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="password"
                  value={request.auth.basicPass || ''}
                  onChange={(e) =>
                    onChange({
                      ...request,
                      auth: { ...request.auth, basicPass: e.target.value },
                    })
                  }
                  placeholder="Password"
                  className="bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 font-mono text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">
                {lang === 'ar' ? 'إضافة سريعة:' : 'Quick presets:'}
              </span>
              {[
                ['Content-Type', 'application/json'],
                ['Accept', 'application/json'],
                ['Accept-Language', 'ar,en;q=0.9'],
                ['Cache-Control', 'no-cache'],
              ].map(([hk, hv]) => (
                <button
                  key={hk}
                  type="button"
                  onClick={() => addHeaderPreset(hk, hv)}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition"
                >
                  + {hk}
                </button>
              ))}
            </div>
            <KeyValueTable
              items={request.headers}
              onChange={(headers) => onChange({ ...request, headers })}
              keyPlaceholder="Header (e.g. X-Custom-Header)"
              valPlaceholder="Header Value"
              lang={lang}
            />
          </div>
        )}

        {activeTab === 'body' && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['none', 'json', 'urlencoded', 'graphql', 'raw'] as const).map((bMode) => (
                  <button
                    key={bMode}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...request,
                        body: { ...request.body, mode: bMode },
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                      request.body.mode === bMode
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                        : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {bMode === 'none'
                      ? 'None'
                      : bMode === 'json'
                      ? 'JSON'
                      : bMode === 'urlencoded'
                      ? 'Form URL-Encoded'
                      : bMode === 'graphql'
                      ? 'GraphQL'
                      : 'Raw Text / XML'}
                  </button>
                ))}
              </div>

              {request.body.mode === 'json' && (
                <div className="flex items-center gap-2">
                  {!jsonValidation.valid && (
                    <span className="text-[11px] text-amber-300 inline-flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'تحقق من فواصل JSON' : 'Invalid JSON'}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={prettifyJson}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-medium inline-flex items-center gap-1 transition"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>{lang === 'ar' ? 'تنسيق JSON' : 'Prettify'}</span>
                  </button>
                </div>
              )}
            </div>

            {request.body.mode === 'none' && (
              <p className="text-xs text-slate-500 py-3">
                {lang === 'ar'
                  ? 'لا يوجد جسم (Body) لهذا الطلب.'
                  : 'This request does not carry a body payload.'}
              </p>
            )}

            {(request.body.mode === 'json' || request.body.mode === 'raw') && (
              <textarea
                dir="ltr"
                rows={6}
                value={request.body.rawText}
                onChange={(e) =>
                  onChange({
                    ...request,
                    body: { ...request.body, rawText: e.target.value },
                  })
                }
                placeholder={
                  request.body.mode === 'json'
                    ? '{\n  "key": "value"\n}'
                    : 'Raw request payload...'
                }
                className="w-full rounded-xl bg-slate-950/90 border border-slate-800 p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
              />
            )}

            {request.body.mode === 'urlencoded' && (
              <KeyValueTable
                items={request.body.urlencoded}
                onChange={(urlencoded) =>
                  onChange({
                    ...request,
                    body: { ...request.body, urlencoded },
                  })
                }
                keyPlaceholder="Form Field"
                valPlaceholder="Field Value"
                lang={lang}
              />
            )}

            {request.body.mode === 'graphql' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5" dir="ltr">
                <div>
                  <div className="text-[11px] text-slate-400 mb-1">GraphQL Query</div>
                  <textarea
                    rows={5}
                    value={request.body.graphqlQuery}
                    onChange={(e) =>
                      onChange({
                        ...request,
                        body: { ...request.body, graphqlQuery: e.target.value },
                      })
                    }
                    placeholder="query GetUsers($limit: Int) {\n  users(limit: $limit) { id name }\n}"
                    className="w-full rounded-xl bg-slate-950/90 border border-slate-800 p-2.5 font-mono text-xs text-indigo-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 mb-1">GraphQL Variables (JSON)</div>
                  <textarea
                    rows={5}
                    value={request.body.graphqlVariables}
                    onChange={(e) =>
                      onChange({
                        ...request,
                        body: { ...request.body, graphqlVariables: e.target.value },
                      })
                    }
                    placeholder='{\n  "limit": 10\n}'
                    className="w-full rounded-xl bg-slate-950/90 border border-slate-800 p-2.5 font-mono text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'code' && (
          <div className="space-y-2.5" dir="ltr">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {(['curl', 'fetch', 'axios', 'python'] as const).map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setCodeTarget(target)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition ${
                      codeTarget === target
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {target === 'curl'
                      ? 'cURL'
                      : target === 'fetch'
                      ? 'JS Fetch'
                      : target === 'axios'
                      ? 'Axios'
                      : 'Python'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    generateCodeSnippet(request, envVars, codeTarget)
                  );
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 1500);
                }}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs inline-flex items-center gap-1.5 transition"
              >
                {copiedCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy</span>
              </button>
            </div>
            <pre className="rounded-xl bg-slate-950/95 border border-slate-800 p-3 font-mono text-xs text-slate-200 overflow-x-auto">
              {generateCodeSnippet(request, envVars, codeTarget)}
            </pre>
          </div>
        )}

        {activeTab === 'examples' && (
          <div className="space-y-2">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                {lang === 'ar'
                  ? 'الردود المحفوظة/الموثقة داخل ملف الكوليكشن (اضغط لعرض الرد في العارض):'
                  : 'Documented / Saved example responses from collection JSON:'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(request.savedResponses || []).map((sr) => (
                <button
                  key={sr.id}
                  type="button"
                  onClick={() => onLoadSavedResponse(sr)}
                  className="text-left rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-indigo-500/40 p-3 transition flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-200">{sr.name}</div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      HTTP {sr.status} {sr.statusText} • {sr.body.length} chars
                    </div>
                  </div>
                  <Code2 className="w-4 h-4 text-indigo-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  HardDrive,
  Lock,
  ExternalLink,
  Copy,
  Check,
  Download,
  Sparkles,
  Zap,
  PlusCircle,
  Eye,
  FileCode2,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  Language,
  ProxyExecutionResult,
  ScenarioRunOutcome,
} from '../types/api';
import {
  formatBytes,
  formatMs,
  getStatusBadgeStyle,
  METHOD_STYLES,
} from '../utils/helpers';
import { analyzeResponse } from '../utils/responseIntelligence';
import { JsonTreeViewer } from './JsonTreeViewer';

interface ResponseInspectorProps {
  result: ProxyExecutionResult | null;
  matrixOutcomes: ScenarioRunOutcome[];
  isRunningMatrix: boolean;
  followRedirects: boolean;
  onToggleFollowRedirects: (val: boolean) => void;
  onRunMatrix: () => void;
  onSelectScenarioResult: (res: ProxyExecutionResult) => void;
  onTestUrl: (url: string) => void;
  onSaveVariable: (key: string, value: string) => void;
  lang: Language;
  activeTabOverride?: 'pretty' | 'matrix' | null;
  onClearTabOverride?: () => void;
}

export const ResponseInspector: React.FC<ResponseInspectorProps> = ({
  result,
  matrixOutcomes,
  isRunningMatrix,
  followRedirects,
  onToggleFollowRedirects,
  onRunMatrix,
  onSelectScenarioResult,
  onTestUrl,
  onSaveVariable,
  lang,
  activeTabOverride,
  onClearTabOverride,
}) => {
  const [tab, setTab] = useState<
    'pretty' | 'matrix' | 'audit' | 'headers' | 'preview' | 'typescript'
  >('pretty');
  const [headerFilter, setHeaderFilter] = useState('');
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedTs, setCopiedTs] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (activeTabOverride) {
      setTab(activeTabOverride);
      onClearTabOverride?.();
    }
  }, [activeTabOverride, onClearTabOverride]);

  const diagnosis = useMemo(() => (result ? analyzeResponse(result) : null), [result]);

  const handleSaveVar = (key: string, val: string) => {
    onSaveVariable(key, val);
    setSavedNotice(`{{${key}}}`);
    setTimeout(() => setSavedNotice(null), 2200);
  };

  const downloadResponse = () => {
    if (!result) return;
    const ext = result.bodyJson !== undefined ? 'json' : result.contentType.includes('html') ? 'html' : 'txt';
    const content =
      result.bodyJson !== undefined
        ? JSON.stringify(result.bodyJson, null, 2)
        : result.bodyText;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `response-${result.status || 'err'}-${Date.now()}.${ext}`;
    a.click();
  };

  return (
    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3.5 shadow-xl min-h-[430px]">
      {/* Top Status & Telemetry Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-indigo-400" />
            <span>{lang === 'ar' ? 'نتيجة الاستجابة' : 'Response Telemetry'}</span>
          </span>

          {result && (
            <>
              <span
                dir="ltr"
                className={`font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg border ${getStatusBadgeStyle(
                  result.status
                )}`}
              >
                {result.status > 0
                  ? `${result.status} ${result.statusText}`
                  : result.errorCode || 'ERR_NETWORK'}
              </span>

              <span
                dir="ltr"
                className="font-mono text-xs px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 inline-flex items-center gap-1"
              >
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>{formatMs(result.timings?.totalMs || 0)}</span>
              </span>

              <span
                dir="ltr"
                className="font-mono text-xs px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 inline-flex items-center gap-1"
              >
                <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                <span>{formatBytes(result.sizeBytes)}</span>
              </span>

              {result.tls && (
                <span
                  dir="ltr"
                  className={`font-mono text-[11px] px-2 py-1 rounded-lg border inline-flex items-center gap-1 ${
                    result.tls.authorized
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>{result.tls.protocol || 'TLS'}</span>
                </span>
              )}

              {result.redirects && result.redirects.length > 0 && (
                <span className="text-[11px] font-mono px-2 py-1 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300">
                  {result.redirects.length} Redirects
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {savedNotice && (
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
              Saved {savedNotice}!
            </span>
          )}

          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={followRedirects}
              onChange={(e) => onToggleFollowRedirects(e.target.checked)}
              className="rounded accent-indigo-500 w-3.5 h-3.5"
            />
            <span>{lang === 'ar' ? 'تتبع التحويلات (3xx)' : 'Follow Redirects'}</span>
          </label>

          {result && (
            <button
              type="button"
              onClick={downloadResponse}
              title="Download response file"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Smart Diagnostic Summary Banner + 1-Click Variable Chaining */}
      {result && diagnosis && (
        <div className="rounded-xl bg-slate-900/75 border border-slate-800/90 p-3 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>{lang === 'ar' ? diagnosis.headlineAr : diagnosis.headlineEn}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                {lang === 'ar' ? diagnosis.adviceAr : diagnosis.adviceEn} •{' '}
                <span className="text-indigo-300 font-medium">
                  {lang === 'ar' ? diagnosis.dataSummaryAr : diagnosis.dataSummaryEn}
                </span>
              </p>
            </div>
          </div>

          {diagnosis.variableCandidates.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/70">
              <span className="text-[11px] text-emerald-300 font-semibold">
                {lang === 'ar' ? 'حفظ ذكي كمتغير:' : 'Quick Chain Variable:'}
              </span>
              {diagnosis.variableCandidates.slice(0, 5).map((cand) => (
                <button
                  key={cand.jsonPath}
                  type="button"
                  onClick={() => handleSaveVar(cand.keySuggestion, cand.value)}
                  className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1 transition"
                >
                  <PlusCircle className="w-3 h-3" />
                  <span>
                    {cand.jsonPath} → {`{{${cand.keySuggestion}}}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inspector Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800/80 pb-1">
        {[
          {
            id: 'pretty',
            labelAr: 'عارض البيانات (JSON / Pretty)',
            labelEn: 'JSON Tree / Body',
            badge: result?.bodyJson !== undefined ? 'JSON' : null,
          },
          {
            id: 'matrix',
            labelAr: 'مصفوفة كل الردود ⚡',
            labelEn: 'All Responses Matrix ⚡',
            badge: matrixOutcomes.length > 0 ? `${matrixOutcomes.length}` : null,
          },
          {
            id: 'audit',
            labelAr: 'التحليل والروابط والزمن',
            labelEn: 'Smart Audit & Links',
            badge: diagnosis?.discoveredLinks.length ? `${diagnosis.discoveredLinks.length} URLs` : null,
          },
          {
            id: 'headers',
            labelAr: 'الهيدرز والكوكيز',
            labelEn: 'Headers & Cookies',
            badge: result ? Object.keys(result.headers).length : null,
          },
          {
            id: 'preview',
            labelAr: 'معاينة بصرية',
            labelEn: 'Visual Preview',
            badge: result?.isBase64 ? 'IMG' : null,
          },
          {
            id: 'typescript',
            labelAr: 'Raw & TypeScript',
            labelEn: 'Raw & TypeScript',
            badge: 'TS',
          },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
              tab === t.id
                ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <span>{lang === 'ar' ? t.labelAr : t.labelEn}</span>
            {t.badge !== null && t.badge !== undefined && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-indigo-300">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main Tab Body */}
      <div className="flex-1 min-h-[260px] max-h-[520px] overflow-y-auto">
        {/* Empty State (except when viewing All Responses Matrix) */}
        {!result && tab !== 'matrix' && (
          <div className="h-64 flex flex-col items-center justify-center text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
              <Zap className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-200">
              {lang === 'ar'
                ? 'جاهز لاختبار الـ API وفحص كل الردود'
                : 'Ready to execute API & inspect all responses'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {lang === 'ar'
                ? 'اضغط على "إرسال (Send)" لفحص الرد المباشر بدون مشاكل CORS، أو اضغط "اختبار كل الردود" لاختبار 6 سيناريوهات تلقائياً (200، 401، 400، 405، CORS).'
                : 'Click Send for instant CORS-free execution, or All Responses to run a 6-scenario edge-case matrix.'}
            </p>
          </div>
        )}

        {/* TAB 1: JSON TREE / PRETTY BODY */}
        {result && tab === 'pretty' && (
          <div className="h-full">
            {result.bodyJson !== undefined ? (
              <JsonTreeViewer
                data={result.bodyJson}
                lang={lang}
                onTestUrl={onTestUrl}
                onSaveVariable={handleSaveVar}
              />
            ) : result.isBase64 && result.contentType.startsWith('image/') ? (
              <div className="flex flex-col items-center justify-center p-6 bg-slate-950/70 rounded-xl border border-slate-800">
                <img
                  src={result.bodyText}
                  alt="API Response Preview"
                  className="max-h-72 rounded-lg object-contain"
                />
                <span className="text-xs font-mono text-slate-400 mt-2">{result.contentType}</span>
              </div>
            ) : (
              <pre
                dir="ltr"
                className="rounded-xl bg-slate-950/90 border border-slate-800 p-3.5 font-mono text-xs text-slate-200 whitespace-pre-wrap break-all"
              >
                {result.bodyText || (lang === 'ar' ? '(لا يوجد محتوى في جسم الرد)' : '(Empty response body)')}
              </pre>
            )}
          </div>
        )}

        {/* TAB 2: ALL RESPONSES SCENARIO MATRIX */}
        {tab === 'matrix' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900/70 border border-slate-800 p-3">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span>
                    {lang === 'ar'
                      ? 'مصفوفة اختبار كل الردود والسيناريوهات (All Responses Matrix)'
                      : 'Intelligent All-Responses Scenario Matrix'}
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {lang === 'ar'
                    ? 'يختبر استجابة الـ API في الحالات الطبيعية، بدون توكن (401)، توكن مزيف، مدخلات تالفة (400 ضد 500)، Method مختلف (405)، و CORS.'
                    : 'Probes happy path, missing auth (401), invalid JWT, malformed JSON (400 vs 500), wrong verb (405), and CORS OPTIONS.'}
                </p>
              </div>
              <button
                type="button"
                disabled={isRunningMatrix}
                onClick={onRunMatrix}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
              >
                {isRunningMatrix ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                <span>{lang === 'ar' ? 'تشغيل فحص كل الردود' : 'Run All Scenarios'}</span>
              </button>
            </div>

            {matrixOutcomes.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                {lang === 'ar'
                  ? 'اضغط على "تشغيل فحص كل الردود" لاختبار كل حالات الرد على هذا الـ Endpoint.'
                  : 'Click "Run All Scenarios" to test every response behavior of this endpoint.'}
              </div>
            ) : (
              <div className="space-y-2">
                {matrixOutcomes.map((item) => {
                  const res = item.result;
                  return (
                    <div
                      key={item.scenario.id}
                      className="rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-indigo-500/40 p-3 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                              METHOD_STYLES[item.scenario.method].badge
                            }`}
                          >
                            {item.scenario.method}
                          </span>
                          <span className="text-xs font-bold text-slate-100">
                            {lang === 'ar' ? item.scenario.nameAr : item.scenario.nameEn}
                          </span>
                          {item.verdict && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                item.verdict === 'pass'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : item.verdict === 'warn'
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {lang === 'ar' ? item.verdictAr : item.verdictEn}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {lang === 'ar'
                            ? item.scenario.descriptionAr
                            : item.scenario.descriptionEn}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0" dir="ltr">
                        {item.status === 'running' && (
                          <span className="text-xs text-indigo-300 inline-flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Testing...</span>
                          </span>
                        )}
                        {res && (
                          <>
                            <span
                              className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg border ${getStatusBadgeStyle(
                                res.status
                              )}`}
                            >
                              {res.status > 0 ? `${res.status} ${res.statusText}` : 'ERR'}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400 w-16 text-right">
                              {formatMs(res.timings?.totalMs || 0)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectScenarioResult(res);
                                setTab('pretty');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-xs font-sans font-semibold inline-flex items-center gap-1 transition"
                            >
                              <Eye className="w-3 h-3" />
                              <span>{lang === 'ar' ? 'فحص الرد' : 'Inspect'}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SMART AUDIT, WATERFALL TIMINGS & RESPONSE LINKS */}
        {result && diagnosis && tab === 'audit' && (
          <div className="space-y-4">
            {/* Assertions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {diagnosis.assertions.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-xl p-3 border flex items-start gap-2.5 ${
                    a.level === 'pass'
                      ? 'bg-emerald-500/10 border-emerald-500/25'
                      : a.level === 'warn'
                      ? 'bg-amber-500/10 border-amber-500/25'
                      : 'bg-rose-500/10 border-rose-500/25'
                  }`}
                >
                  {a.level === 'pass' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : a.level === 'warn' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-slate-100">
                      {lang === 'ar' ? a.titleAr : a.titleEn}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {lang === 'ar' ? a.detailAr : a.detailEn}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Socket Timing Waterfall */}
            <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-3.5 space-y-2.5">
              <div className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>
                  {lang === 'ar'
                    ? 'تفصيل أزمنة الشبكة والسيرفر (Socket Timing Waterfall)'
                    : 'Socket-Level Timing Waterfall'}
                </span>
                <span className="font-mono text-indigo-300">
                  Total: {formatMs(result.timings.totalMs)}
                </span>
              </div>
              {[
                { label: 'DNS Lookup', ms: result.timings.dnsMs, color: 'bg-sky-400' },
                { label: 'TCP Connect', ms: result.timings.tcpMs, color: 'bg-amber-400' },
                { label: 'TLS Handshake', ms: result.timings.tlsMs, color: 'bg-purple-400' },
                { label: 'TTFB (Server Processing)', ms: result.timings.ttfbMs, color: 'bg-indigo-400' },
                { label: 'Content Download', ms: result.timings.downloadMs, color: 'bg-emerald-400' },
              ].map((phase) => {
                const pct =
                  result.timings.totalMs > 0
                    ? Math.min(100, Math.max(2, (phase.ms / result.timings.totalMs) * 100))
                    : 2;
                return (
                  <div key={phase.label} className="flex items-center gap-3 text-xs" dir="ltr">
                    <span className="w-44 text-slate-400 font-mono text-[11px]">{phase.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${phase.color}`}
                        style={{ width: `${phase.ms > 0 ? pct : 0}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono text-[11px] text-slate-200">
                      {phase.ms.toFixed(1)} ms
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Redirect Hops */}
            {result.redirects && result.redirects.length > 0 && (
              <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-3.5 space-y-2" dir="ltr">
                <div className="text-xs font-bold text-sky-300">Redirect Chain</div>
                {result.redirects.map((hop, idx) => (
                  <div
                    key={idx}
                    className="text-[11px] font-mono flex flex-wrap items-center gap-2 text-slate-300"
                  >
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                      {hop.status}
                    </span>
                    <span className="truncate max-w-xs">{hop.from}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-emerald-300 truncate max-w-xs">{hop.to}</span>
                    <span className="text-slate-500">({Math.round(hop.durationMs)}ms)</span>
                  </div>
                ))}
              </div>
            )}

            {/* Links Discovered Inside This Response */}
            <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-3.5 space-y-2">
              <div className="text-xs font-bold text-slate-200">
                {lang === 'ar'
                  ? `الروابط المستخرجة من هذا الرد (${diagnosis.discoveredLinks.length})`
                  : `Links Extracted from Response (${diagnosis.discoveredLinks.length})`}
              </div>
              {diagnosis.discoveredLinks.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {lang === 'ar'
                    ? 'لم يتم العثور على روابط URL داخل جسم هذا الرد أو الهيدرز.'
                    : 'No URLs detected inside this response payload or headers.'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto" dir="ltr">
                  {diagnosis.discoveredLinks.map((lnk) => (
                    <div
                      key={lnk}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/80 border border-slate-800/80 px-3 py-1.5"
                    >
                      <span className="font-mono text-xs text-emerald-300 truncate">{lnk}</span>
                      <button
                        type="button"
                        onClick={() => onTestUrl(lnk)}
                        className="px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{lang === 'ar' ? 'اختبار الرابط' : 'Test Link'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: HEADERS & COOKIES */}
        {result && tab === 'headers' && (
          <div className="space-y-4" dir="ltr">
            <input
              type="text"
              value={headerFilter}
              onChange={(e) => setHeaderFilter(e.target.value)}
              placeholder="Filter response headers..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
            />

            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-900/90 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 w-1/3">Header</th>
                    <th className="px-3 py-2">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 bg-slate-950/60">
                  {Object.entries(result.headers)
                    .filter(
                      ([k, v]) =>
                        !headerFilter ||
                        k.toLowerCase().includes(headerFilter.toLowerCase()) ||
                        v.toLowerCase().includes(headerFilter.toLowerCase())
                    )
                    .map(([k, v]) => (
                      <tr key={k} className="hover:bg-slate-900/50">
                        <td className="px-3 py-2 text-sky-300 font-medium break-all">{k}</td>
                        <td className="px-3 py-2 text-slate-200 break-all">{v}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {result.setCookies && result.setCookies.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-indigo-300">
                  Set-Cookie Security Breakdown ({result.setCookies.length})
                </div>
                <div className="rounded-xl border border-slate-800 overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-slate-900/90 text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Value</th>
                        <th className="px-3 py-2">HttpOnly</th>
                        <th className="px-3 py-2">Secure</th>
                        <th className="px-3 py-2">SameSite</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 bg-slate-950/60">
                      {result.setCookies.map((c, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-emerald-300">{c.name}</td>
                          <td className="px-3 py-2 text-slate-300 max-w-[200px] truncate">
                            {c.value}
                          </td>
                          <td className="px-3 py-2">
                            {c.httpOnly ? (
                              <span className="text-emerald-400">Yes</span>
                            ) : (
                              <span className="text-amber-400">No</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {c.secure ? (
                              <span className="text-emerald-400">Yes</span>
                            ) : (
                              <span className="text-amber-400">No</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-300">{c.sameSite || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: VISUAL PREVIEW */}
        {result && tab === 'preview' && (
          <div className="h-full">
            {result.isBase64 && result.contentType.startsWith('image/') ? (
              <div className="flex flex-col items-center justify-center p-6 bg-slate-950/80 rounded-xl border border-slate-800">
                <img
                  src={result.bodyText}
                  alt="Visual Response"
                  className="max-h-80 rounded-lg object-contain"
                />
              </div>
            ) : result.contentType.includes('html') ||
              result.bodyText.trim().toLowerCase().startsWith('<!doctype') ||
              result.bodyText.trim().toLowerCase().startsWith('<html') ? (
              <iframe
                title="HTML Response Preview"
                sandbox=""
                srcDoc={result.bodyText}
                className="w-full h-80 rounded-xl bg-white border border-slate-700"
              />
            ) : (
              <div className="text-center py-12 text-xs text-slate-500">
                {lang === 'ar'
                  ? `نوع المحتوى (${result.contentType || 'unknown'}) نصي/JSON — استخدم تبويب JSON Tree لعرضه بأفضل شكل.`
                  : `Content-Type (${result.contentType || 'text'}) is best viewed in JSON Tree / Raw tab.`}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: RAW PAYLOAD & AUTO TYPESCRIPT INTERFACES */}
        {result && diagnosis && tab === 'typescript' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" dir="ltr">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Raw Response Payload</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(result.bodyText);
                    setCopiedRaw(true);
                    setTimeout(() => setCopiedRaw(false), 1500);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1"
                >
                  {copiedRaw ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>Copy Raw</span>
                </button>
              </div>
              <pre className="rounded-xl bg-slate-950/90 border border-slate-800 p-3 font-mono text-xs text-slate-300 max-h-72 overflow-auto whitespace-pre-wrap break-all">
                {result.bodyText || '(Empty)'}
              </pre>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-300 inline-flex items-center gap-1.5">
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>Auto-Generated TypeScript Types</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(diagnosis.typescriptInterfaces);
                    setCopiedTs(true);
                    setTimeout(() => setCopiedTs(false), 1500);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 inline-flex items-center gap-1"
                >
                  {copiedTs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>Copy TS</span>
                </button>
              </div>
              <pre className="rounded-xl bg-slate-950/90 border border-slate-800 p-3 font-mono text-xs text-sky-300 max-h-72 overflow-auto">
                {diagnosis.typescriptInterfaces}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


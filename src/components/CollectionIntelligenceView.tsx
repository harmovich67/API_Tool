import React, { useMemo, useState } from 'react';
import {
  Globe,
  Link2,
  ShieldAlert,
  Play,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  ExternalLink,
  Search,
  Layers,
  Loader2,
  Download,
  Sparkles,
  FolderTree,
  Sliders,
} from 'lucide-react';
import {
  ApiRequestItem,
  BatchRunItemOutcome,
  CollectionAnalysis,
  EnvVariable,
  HttpMethod,
  Language,
  LinkCategory,
  ParsedCollection,
  ResourceTreeNode,
} from '../types/api';
import {
  formatMs,
  getStatusBadgeStyle,
  METHOD_STYLES,
  uid,
} from '../utils/helpers';

interface CollectionIntelligenceViewProps {
  collection: ParsedCollection;
  analysis: CollectionAnalysis;
  envVars: EnvVariable[];
  lang: Language;
  isProbingLinks: boolean;
  batchOutcomes: BatchRunItemOutcome[];
  isRunningBatch: boolean;
  onUpdateEnvVars: (vars: EnvVariable[]) => void;
  onProbeAllLinks: () => void;
  onRunBatchTests: (subsetRequests: ApiRequestItem[]) => void;
  onOpenRequestInStudio: (requestId: string) => void;
  onTestArbitraryUrlInStudio: (url: string, method?: HttpMethod) => void;
  onOpenImportModal: () => void;
}

const CATEGORY_LABELS: Record<LinkCategory, { ar: string; en: string; color: string }> = {
  endpoint: {
    ar: 'API Endpoint',
    en: 'API Endpoint',
    color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  },
  'base-server': {
    ar: 'سيرفر أساسي (Base URL)',
    en: 'Base Server',
    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  webhook: {
    ar: 'Webhook / Callback',
    en: 'Webhook / Callback',
    color: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  asset: {
    ar: 'ملف / وسائط (Asset)',
    en: 'Media / Asset',
    color: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
  'docs-auth': {
    ar: 'توثيق / OAuth',
    en: 'Docs / OAuth',
    color: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  'response-link': {
    ar: 'رابط داخل الرد',
    en: 'Response Link',
    color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
};

const TreeBranch: React.FC<{
  node: ResourceTreeNode;
  depth: number;
  onSelectRequest: (id: string) => void;
}> = ({ node, depth, onSelectRequest }) => {
  const isParam =
    node.segment.startsWith(':') ||
    node.segment.startsWith('{') ||
    node.segment.startsWith('[');

  return (
    <div dir="ltr" className={depth > 0 ? 'pl-4 ml-2 border-l border-slate-800/80' : ''}>
      <div className="flex flex-wrap items-center gap-2 py-1 px-2 rounded-lg hover:bg-slate-800/40">
        <span
          className={`font-mono text-xs ${
            isParam ? 'text-amber-300 font-semibold' : 'text-slate-200'
          }`}
        >
          /{node.segment === '/' ? '' : node.segment}
        </span>

        <div className="flex items-center gap-1">
          {node.methods.map((m, idx) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                const targetId = node.requestIds[idx] || node.requestIds[0];
                if (targetId) onSelectRequest(targetId);
              }}
              className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border cursor-pointer hover:scale-105 transition ${METHOD_STYLES[m].badge}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {node.children.map((child) => (
        <TreeBranch
          key={child.fullPath}
          node={child}
          depth={depth + 1}
          onSelectRequest={onSelectRequest}
        />
      ))}
    </div>
  );
};

export const CollectionIntelligenceView: React.FC<CollectionIntelligenceViewProps> = ({
  collection,
  analysis,
  envVars,
  lang,
  isProbingLinks,
  batchOutcomes,
  isRunningBatch,
  onUpdateEnvVars,
  onProbeAllLinks,
  onRunBatchTests,
  onOpenRequestInStudio,
  onTestArbitraryUrlInStudio,
  onOpenImportModal,
}) => {
  const [subTab, setSubTab] = useState<'overview' | 'links' | 'security' | 'batch'>('links');
  const [linkCatFilter, setLinkCatFilter] = useState<'all' | LinkCategory>('all');
  const [linkHostFilter, setLinkHostFilter] = useState<string>('all');
  const [linkSearch, setLinkSearch] = useState('');
  const [quickVarValues, setQuickVarValues] = useState<Record<string, string>>({});
  const [batchFolderFilter, setBatchFolderFilter] = useState<string>('all');
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  const filteredLinks = useMemo(() => {
    return analysis.links.filter((lnk) => {
      if (linkCatFilter !== 'all' && lnk.category !== linkCatFilter) return false;
      if (linkHostFilter !== 'all' && lnk.host !== linkHostFilter) return false;
      if (linkSearch.trim()) {
        const q = linkSearch.toLowerCase();
        return (
          lnk.rawUrl.toLowerCase().includes(q) ||
          lnk.resolvedUrl.toLowerCase().includes(q) ||
          lnk.sources.some((s) => s.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [analysis.links, linkCatFilter, linkHostFilter, linkSearch]);

  const probeStats = useMemo(() => {
    const probed = analysis.links.filter((l) => l.probeResult);
    let healthy = 0;
    let authProtected = 0;
    let broken = 0;
    for (const l of probed) {
      const s = l.probeResult!.status;
      if (s >= 200 && s < 400) healthy++;
      else if (s === 401 || s === 403 || s === 405) authProtected++;
      else broken++;
    }
    return { totalProbed: probed.length, healthy, authProtected, broken };
  }, [analysis.links]);

  const allFolders = useMemo(() => {
    const s = new Set<string>();
    for (const r of collection.requests) {
      if (r.folderPath.length > 0) s.add(r.folderPath.join(' / '));
    }
    return Array.from(s);
  }, [collection.requests]);

  const filteredBatchRequests = useMemo(() => {
    if (batchFolderFilter === 'all') return collection.requests;
    return collection.requests.filter((r) => r.folderPath.join(' / ') === batchFolderFilter);
  }, [collection.requests, batchFolderFilter]);

  const saveQuickVariable = (varKey: string) => {
    const val = (quickVarValues[varKey] || '').trim();
    if (!val) return;
    const exists = envVars.find((v) => v.key.trim() === varKey);
    if (exists) {
      onUpdateEnvVars(
        envVars.map((v) => (v.id === exists.id ? { ...v, value: val, enabled: true } : v))
      );
    } else {
      onUpdateEnvVars([
        ...envVars,
        {
          id: uid('env'),
          key: varKey,
          value: val,
          enabled: true,
          source: 'Quick Analyzer Fill',
          isSecret: /token|secret|key|pass/i.test(varKey),
        },
      ]);
    }
  };

  const exportFullReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      collectionName: collection.name,
      format: collection.formatLabel,
      healthScore: analysis.healthScore,
      summary: {
        totalEndpoints: analysis.totalRequests,
        totalLinks: analysis.links.length,
        uniqueHosts: analysis.uniqueHosts,
        methodCounts: analysis.methodCounts,
      },
      links: analysis.links,
      securityAndQualityFindings: analysis.findings,
      batchExecutionResults: batchOutcomes.map((b) => ({
        name: b.request.name,
        method: b.request.method,
        url: b.resolvedUrl,
        status: b.result?.status,
        latencyMs: b.result?.timings?.totalMs,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${collection.name.replace(/\s+/g, '-')}-intelligence-report.json`;
    a.click();
  };

  const scoreColor =
    analysis.healthScore >= 80
      ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
      : analysis.healthScore >= 55
      ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
      : 'text-rose-400 border-rose-500/40 bg-rose-500/10';

  return (
    <div className="space-y-4">
      {/* Top Collection Intelligence Hero */}
      <div className="glass-panel-elevated rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 ${scoreColor}`}
          >
            <span className="text-xl font-extrabold leading-none">{analysis.healthScore}</span>
            <span className="text-[9px] uppercase tracking-wider opacity-80 mt-0.5">Score</span>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-white">{collection.name}</h2>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {collection.formatLabel}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              {collection.description ||
                (lang === 'ar'
                  ? 'تحليل معماري وأمني شامل للكوليكشن، المتغيرات، هيكلة المسارات، وفحص حي لجميع الروابط.'
                  : 'Deep architectural, security, variable, and live link health intelligence.')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenImportModal}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition"
          >
            <UploadCloud className="w-4 h-4 text-indigo-400" />
            <span>{lang === 'ar' ? 'رفع JSON آخر' : 'Upload JSON'}</span>
          </button>

          <button
            type="button"
            disabled={isProbingLinks}
            onClick={() => {
              setSubTab('links');
              onProbeAllLinks();
            }}
            className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 transition"
          >
            {isProbingLinks ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Globe className="w-4 h-4" />
            )}
            <span>
              {lang === 'ar'
                ? `فحص حي لكل الروابط (${analysis.links.length})`
                : `Probe All Links (${analysis.links.length})`}
            </span>
          </button>

          <button
            type="button"
            disabled={isRunningBatch}
            onClick={() => {
              setSubTab('batch');
              onRunBatchTests(collection.requests);
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 inline-flex items-center gap-1.5 transition"
          >
            {isRunningBatch ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span>
              {lang === 'ar' ? 'اختبار كل الكوليكشن' : 'Run All Endpoints'}
            </span>
          </button>

          <button
            type="button"
            onClick={exportFullReport}
            title="Export JSON Intelligence Report"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel rounded-xl p-3.5">
          <div className="text-xs text-slate-400">
            {lang === 'ar' ? 'إجمالي الـ Endpoints' : 'Total Endpoints'}
          </div>
          <div className="text-2xl font-extrabold text-white mt-1">{analysis.totalRequests}</div>
          <div className="text-[11px] text-indigo-300 mt-0.5">
            {analysis.totalFolders} {lang === 'ar' ? 'مجلدات تنظيمية' : 'Folders'}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-3.5">
          <div className="text-xs text-slate-400">
            {lang === 'ar' ? 'الروابط المستخرجة والـ Domains' : 'Extracted Links & Hosts'}
          </div>
          <div className="text-2xl font-extrabold text-emerald-300 mt-1">
            {analysis.links.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {analysis.uniqueHosts.length} {lang === 'ar' ? 'نطاق فريد (Host)' : 'Unique Hosts'}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-3.5">
          <div className="text-xs text-slate-400">
            {lang === 'ar' ? 'ملاحظات الفحص الذكي والأمني' : 'Security & Smart Insights'}
          </div>
          <div className="text-2xl font-extrabold text-amber-300 mt-1">
            {analysis.findings.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {analysis.findings.filter((f) => f.severity === 'critical').length}{' '}
            {lang === 'ar' ? 'حرجة' : 'Critical'}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-3.5">
          <div className="text-xs text-slate-400">
            {lang === 'ar' ? 'المتغيرات المكتشفة {{vars}}' : 'Template Variables'}
          </div>
          <div className="text-2xl font-extrabold text-sky-300 mt-1">
            {analysis.discoveredVariables.length}
          </div>
          <div className="text-[11px] text-amber-300 mt-0.5">
            {analysis.unresolvedVariables.length}{' '}
            {lang === 'ar' ? 'تحتاج قيمة' : 'Unresolved'}
          </div>
        </div>
      </div>

      {/* Unresolved Variables Quick-Resolver Banner */}
      {analysis.unresolvedVariables.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <Sliders className="w-4 h-4" />
            <span>
              {lang === 'ar'
                ? 'تعويض سريع للمتغيرات الناقصة في الكوليكشن (لتفعيل الروابط الحقيقية فوراً):'
                : 'Quick-Fill Unresolved Variables in Collection (updates all links live):'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2" dir="ltr">
            {analysis.unresolvedVariables.slice(0, 6).map((vKey) => (
              <div key={vKey} className="flex items-center gap-2">
                <span className="font-mono text-xs px-2.5 py-1.5 rounded-lg bg-slate-900 text-amber-300 border border-amber-500/30 shrink-0">
                  {`{{${vKey}}}`}
                </span>
                <input
                  type="text"
                  value={quickVarValues[vKey] || ''}
                  onChange={(e) =>
                    setQuickVarValues((prev) => ({ ...prev, [vKey]: e.target.value }))
                  }
                  placeholder={
                    /url|host/i.test(vKey)
                      ? 'https://api.yourdomain.com'
                      : 'Enter value...'
                  }
                  className="flex-1 bg-slate-950/90 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => saveQuickVariable(vKey)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 text-xs font-bold transition"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intelligence Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 pb-2">
        {[
          {
            id: 'links',
            icon: Link2,
            ar: `تحليل وفحص الروابط (${analysis.links.length})`,
            en: `Deep Links Analyzer (${analysis.links.length})`,
          },
          {
            id: 'overview',
            icon: FolderTree,
            ar: 'خريطة المسارات والـ Methods',
            en: 'REST Tree & Architecture',
          },
          {
            id: 'security',
            icon: ShieldAlert,
            ar: `الفحص الأمني والذكي (${analysis.findings.length})`,
            en: `Security & Smart Audit (${analysis.findings.length})`,
          },
          {
            id: 'batch',
            icon: Layers,
            ar: `اختبار كل الكوليكشن (${collection.requests.length})`,
            en: `Batch Collection Runner (${collection.requests.length})`,
          },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition ${
                subTab === t.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'bg-slate-900/70 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? t.ar : t.en}</span>
            </button>
          );
        })}
      </div>

      {/* ==================================================================== */}
      {/* SUBTAB 1: DEEP LINKS ANALYZER & LIVE PROBER                          */}
      {/* ==================================================================== */}
      {subTab === 'links' && (
        <div className="glass-panel rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', lang === 'ar' ? 'الكل' : 'All'],
                  ['endpoint', 'Endpoints'],
                  ['base-server', 'Base Servers'],
                  ['webhook', 'Webhooks'],
                  ['asset', 'Assets'],
                  ['docs-auth', 'Docs / Auth'],
                  ['response-link', 'Response Links'],
                ] as const
              ).map(([catKey, label]) => (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setLinkCatFilter(catKey as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    linkCatFilter === catKey
                      ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40'
                      : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                dir="ltr"
                value={linkHostFilter}
                onChange={(e) => setLinkHostFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Hosts ({analysis.uniqueHosts.length})</option>
                {analysis.uniqueHosts.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  dir="ltr"
                  type="text"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder="Search URLs, paths, params..."
                  className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 w-56"
                />
              </div>
            </div>
          </div>

          {/* Live Link Probe Summary Strip */}
          {probeStats.totalProbed > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
              <span className="font-bold text-slate-200">
                {lang === 'ar' ? 'نتيجة الفحص الحي للروابط:' : 'Live Link Health Summary:'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                {probeStats.healthy} Healthy (2xx/3xx)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
                {probeStats.authProtected} Auth/Method Protected (401/403/405)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono">
                {probeStats.broken} Dead / 404 / 5xx
              </span>
            </div>
          )}

          {/* Extracted Links Detailed Cards */}
          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
            {filteredLinks.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                {lang === 'ar'
                  ? 'لا توجد روابط مطابقة لفلتر البحث الحالي.'
                  : 'No links match the current filter.'}
              </div>
            ) : (
              filteredLinks.map((lnk) => {
                const catMeta = CATEGORY_LABELS[lnk.category];
                const pr = lnk.probeResult;
                return (
                  <div
                    key={lnk.id}
                    className="rounded-xl bg-slate-900/75 border border-slate-800/90 hover:border-indigo-500/40 p-3 transition flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {/* Top badges row */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catMeta.color}`}
                        >
                          {lang === 'ar' ? catMeta.ar : catMeta.en}
                        </span>

                        {lnk.methods.map((m) => (
                          <span
                            key={m}
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${METHOD_STYLES[m].badge}`}
                          >
                            {m}
                          </span>
                        ))}

                        {lnk.isSecure ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 inline-flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" />
                            HTTPS
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 inline-flex items-center gap-1">
                            <Unlock className="w-2.5 h-2.5" />
                            HTTP (Insecure)
                          </span>
                        )}

                        <span className="text-[11px] font-mono text-sky-300">{lnk.host}</span>

                        <span className="text-[11px] text-slate-500 truncate">
                          • {lnk.sources.slice(0, 2).join(', ')}
                        </span>
                      </div>

                      {/* Raw & Resolved URL */}
                      <div dir="ltr" className="font-mono text-xs text-slate-100 break-all">
                        {lnk.rawUrl}
                      </div>
                      {lnk.resolvedUrl !== lnk.rawUrl && (
                        <div dir="ltr" className="font-mono text-[11px] text-emerald-300/90 break-all">
                          Resolved → {lnk.resolvedUrl}
                        </div>
                      )}

                      {/* Path params, query keys & variables anatomy */}
                      {(lnk.pathParams.length > 0 ||
                        lnk.queryKeys.length > 0 ||
                        lnk.variables.length > 0) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5" dir="ltr">
                          {lnk.pathParams.map((pp) => (
                            <span
                              key={pp}
                              className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25"
                            >
                              param: {pp}
                            </span>
                          ))}
                          {lnk.queryKeys.map((qk) => (
                            <span
                              key={qk}
                              className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25"
                            >
                              ?{qk}
                            </span>
                          ))}
                          {lnk.hasUnresolvedVars && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-300 border border-rose-500/25">
                              Unresolved {'{{var}}'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right Probe Status + Open in Tester */}
                    <div className="flex items-center gap-2 shrink-0" dir="ltr">
                      {pr && (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg border ${getStatusBadgeStyle(
                              pr.status
                            )}`}
                          >
                            {pr.status > 0 ? `${pr.status} ${pr.statusText}` : pr.errorCode || 'DEAD'}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {formatMs(pr.latencyMs)}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (lnk.requestIds[0]) {
                            onOpenRequestInStudio(lnk.requestIds[0]);
                          } else {
                            onTestArbitraryUrlInStudio(
                              lnk.resolvedUrl || lnk.rawUrl,
                              lnk.methods[0] || 'GET'
                            );
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-200 border border-indigo-500/35 text-xs font-sans font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'اختبار' : 'Test'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUBTAB 2: REST RESOURCE TREE & METHOD DISTRIBUTION                   */}
      {/* ==================================================================== */}
      {subTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Methods & Auth Breakdown */}
          <div className="glass-panel rounded-2xl p-4 space-y-4">
            <h3 className="text-sm font-bold text-white">
              {lang === 'ar' ? 'توزيع طرق الـ HTTP والمصادقة' : 'HTTP Verbs & Auth Coverage'}
            </h3>

            <div className="space-y-2" dir="ltr">
              {(Object.entries(analysis.methodCounts) as [HttpMethod, number][])
                .filter(([, count]) => count > 0)
                .map(([m, count]) => {
                  const pct =
                    analysis.totalRequests > 0
                      ? Math.round((count / analysis.totalRequests) * 100)
                      : 0;
                  return (
                    <div key={m} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className={`font-bold ${METHOD_STYLES[m].text}`}>{m}</span>
                        <span className="text-slate-400">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${METHOD_STYLES[m].dot}`}
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="text-xs font-bold text-slate-300">
                {lang === 'ar' ? 'أنواع المصادقة المستخدمة:' : 'Authentication Breakdown:'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(analysis.authBreakdown).map(([k, count]) => (
                  <div
                    key={k}
                    className="rounded-xl bg-slate-900/80 border border-slate-800 p-2.5 flex items-center justify-between"
                  >
                    <span className="text-xs font-mono uppercase text-slate-400">{k}</span>
                    <span className="text-sm font-bold text-indigo-300">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive REST Resource Tree by Host */}
          <div className="glass-panel rounded-2xl p-4 lg:col-span-2 space-y-3 max-h-[540px] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {lang === 'ar'
                  ? 'شجرة هيكلة المسارات التفاعلية (اضغط أي Method لاختباره)'
                  : 'Interactive REST Endpoint Topology (Click any Method badge to test)'}
              </h3>
            </div>

            {Object.entries(analysis.resourceTreesByHost).map(([host, nodes]) => (
              <div
                key={host}
                className="rounded-xl bg-slate-900/75 border border-slate-800 p-3.5 space-y-2"
              >
                <div
                  dir="ltr"
                  className="text-xs font-mono font-bold text-emerald-300 flex items-center gap-2 pb-1.5 border-b border-slate-800"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{host}</span>
                </div>
                <div className="space-y-0.5">
                  {nodes.map((node) => (
                    <TreeBranch
                      key={node.fullPath}
                      node={node}
                      depth={0}
                      onSelectRequest={onOpenRequestInStudio}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUBTAB 3: SECURITY & SMART ARCHITECTURE AUDIT                        */}
      {/* ==================================================================== */}
      {subTab === 'security' && (
        <div className="glass-panel rounded-2xl p-4 space-y-3">
          {analysis.findings.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <div className="text-sm font-bold text-white">
                {lang === 'ar'
                  ? 'ممتاز! لم يتم رصد أي مشاكل أمنية أو متغيرات ناقصة.'
                  : 'Clean Audit! No security risks or missing variables detected.'}
              </div>
            </div>
          ) : (
            analysis.findings.map((f) => (
              <div
                key={f.id}
                className={`rounded-xl p-3.5 border flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                  f.severity === 'critical'
                    ? 'bg-rose-500/10 border-rose-500/30'
                    : f.severity === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-mono uppercase font-extrabold px-2 py-0.5 rounded-full ${
                        f.severity === 'critical'
                          ? 'bg-rose-500/25 text-rose-200'
                          : f.severity === 'warning'
                          ? 'bg-amber-500/25 text-amber-200'
                          : 'bg-indigo-500/20 text-indigo-300'
                      }`}
                    >
                      {f.severity}
                    </span>
                    <span className="text-xs font-bold text-white">
                      {lang === 'ar' ? f.titleAr : f.titleEn}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">({f.location})</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    {lang === 'ar' ? f.detailAr : f.detailEn}
                  </p>

                  {f.decodedJwt && (
                    <pre
                      dir="ltr"
                      className="mt-2 rounded-lg bg-slate-950/80 border border-slate-800 p-2 font-mono text-[11px] text-indigo-200 overflow-x-auto"
                    >
                      {JSON.stringify(f.decodedJwt.payload, null, 2)}
                    </pre>
                  )}
                </div>

                {f.requestId && (
                  <button
                    type="button"
                    onClick={() => onOpenRequestInStudio(f.requestId!)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold shrink-0 transition"
                  >
                    {lang === 'ar' ? 'فتح الطلب' : 'Inspect Request'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUBTAB 4: COLLECTION BATCH RUNNER (TEST ALL ENDPOINTS & RESPONSES)   */}
      {/* ==================================================================== */}
      {subTab === 'batch' && (
        <div className="glass-panel rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={batchFolderFilter}
                onChange={(e) => setBatchFolderFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">
                  {lang === 'ar'
                    ? `كل المجلدات (${collection.requests.length} طلب)`
                    : `All Folders (${collection.requests.length} requests)`}
                </option>
                {allFolders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={isRunningBatch}
                onClick={() => onRunBatchTests(filteredBatchRequests)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
              >
                {isRunningBatch ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>
                  {lang === 'ar'
                    ? `تشغيل الفحص الجماعي (${filteredBatchRequests.length})`
                    : `Execute Batch (${filteredBatchRequests.length})`}
                </span>
              </button>
            </div>

            {batchOutcomes.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  2xx:{' '}
                  {
                    batchOutcomes.filter(
                      (b) => b.result && b.result.status >= 200 && b.result.status < 300
                    ).length
                  }
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  4xx:{' '}
                  {
                    batchOutcomes.filter(
                      (b) => b.result && b.result.status >= 400 && b.result.status < 500
                    ).length
                  }
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  5xx/Err:{' '}
                  {
                    batchOutcomes.filter(
                      (b) => b.result && (b.result.status >= 500 || b.result.status === 0)
                    ).length
                  }
                </span>
              </div>
            )}
          </div>

          {batchOutcomes.length === 0 ? (
            <div className="py-12 text-center space-y-2 text-xs text-slate-400">
              <Sparkles className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
              <p>
                {lang === 'ar'
                  ? 'اضغط "تشغيل الفحص الجماعي" لاختبار جميع طلبات الكوليكشن دفعة واحدة وعرض كل ردودها وأزمنة الاستجابة.'
                  : 'Click "Execute Batch" to fire all collection endpoints and inspect every response status & payload.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {batchOutcomes.map((item) => {
                const isOpen = expandedBatchId === item.request.id;
                return (
                  <div
                    key={item.request.id}
                    className="rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden"
                  >
                    <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border shrink-0 ${
                            METHOD_STYLES[item.request.method].badge
                          }`}
                        >
                          {item.request.method}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {item.request.name}
                          </div>
                          <div dir="ltr" className="text-[11px] font-mono text-slate-400 truncate">
                            {item.resolvedUrl}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0" dir="ltr">
                        {item.status === 'running' && (
                          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                        )}
                        {item.result && (
                          <>
                            <span
                              className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg border ${getStatusBadgeStyle(
                                item.result.status
                              )}`}
                            >
                              {item.result.status > 0
                                ? `${item.result.status} ${item.result.statusText}`
                                : item.result.errorCode || 'ERR'}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400 w-16 text-right">
                              {formatMs(item.result.timings?.totalMs || 0)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedBatchId(isOpen ? null : item.request.id)
                              }
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-sans font-semibold"
                            >
                              {isOpen
                                ? lang === 'ar'
                                  ? 'إخفاء الرد'
                                  : 'Hide'
                                : lang === 'ar'
                                ? 'عرض الرد'
                                : 'Response'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenRequestInStudio(item.request.id)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border border-indigo-500/30 text-xs font-sans font-semibold"
                            >
                              Studio ↗
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isOpen && item.result && (
                      <div className="border-t border-slate-800 bg-slate-950/90 p-3" dir="ltr">
                        <pre className="font-mono text-xs text-emerald-300 max-h-56 overflow-auto whitespace-pre-wrap break-all">
                          {item.result.bodyJson !== undefined
                            ? JSON.stringify(item.result.bodyJson, null, 2)
                            : item.result.bodyText || '(Empty body)'}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


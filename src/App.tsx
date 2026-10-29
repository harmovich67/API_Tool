import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  UploadCloud,
  Sliders,
  Compass,
  TerminalSquare,
  Globe2,
  Cpu,
  RotateCcw,
} from 'lucide-react';
import {
  ApiRequestItem,
  BatchRunItemOutcome,
  EnvVariable,
  HistoryEntry,
  HttpMethod,
  Language,
  LinkProbeResult,
  ParsedCollection,
  ProxyExecutionResult,
  SavedExampleResponse,
  ScenarioRunOutcome,
} from './types/api';
import {
  buildExecutableRequest,
  createBlankRequest,
  uid,
} from './utils/helpers';
import { loadDefaultDemoCollection } from './utils/demoCollection';
import { analyzeCollection } from './utils/collectionAnalyzer';
import { parseAnyCollectionInput } from './utils/collectionParser';
import {
  buildAllResponsesScenarios,
  evaluateScenarioOutcome,
} from './utils/scenarioRunner';
import { CollectionSidebar } from './components/CollectionSidebar';
import { RequestBuilder } from './components/RequestBuilder';
import { ResponseInspector } from './components/ResponseInspector';
import { CollectionIntelligenceView } from './components/CollectionIntelligenceView';
import { CollectionImportModal } from './components/CollectionImportModal';
import { EnvVariablesModal } from './components/EnvVariablesModal';

const STORAGE_KEY = 'nexus_api_studio_state_v1';

async function callProxyExecute(payload: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  followRedirects: boolean;
}): Promise<ProxyExecutionResult> {
  try {
    const res = await fetch('/__engine/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fallback to direct browser fetch if static hosting without Node engine
  }

  const t0 = performance.now();
  try {
    const directRes = await fetch(payload.url, {
      method: payload.method,
      headers: payload.headers,
      body:
        payload.body && !['GET', 'HEAD'].includes(payload.method.toUpperCase())
          ? payload.body
          : undefined,
    });
    const text = await directRes.text();
    const totalMs = Number((performance.now() - t0).toFixed(2));
    const headersObj: Record<string, string> = {};
    directRes.headers.forEach((v, k) => {
      headersObj[k] = v;
    });
    let bodyJson: unknown = undefined;
    try {
      bodyJson = JSON.parse(text);
    } catch {
      // plain text
    }
    return {
      ok: true,
      status: directRes.status,
      statusText: directRes.statusText,
      headers: headersObj,
      setCookies: [],
      bodyText: text,
      bodyJson,
      contentType: headersObj['content-type'] || '',
      sizeBytes: new Blob([text]).size,
      timings: { dnsMs: 0, tcpMs: 0, tlsMs: 0, ttfbMs: totalMs, downloadMs: 0, totalMs },
      redirects: [],
      finalUrl: directRes.url || payload.url,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    const totalMs = Number((performance.now() - t0).toFixed(2));
    return {
      ok: false,
      error: err?.message || 'Fetch error',
      errorCode: 'ERR_FETCH',
      status: 0,
      statusText: 'Network / CORS Error',
      headers: {},
      setCookies: [],
      bodyText: '',
      contentType: '',
      sizeBytes: 0,
      timings: { dnsMs: 0, tcpMs: 0, tlsMs: 0, ttfbMs: 0, downloadMs: 0, totalMs },
      redirects: [],
      finalUrl: payload.url,
      timestamp: Date.now(),
    };
  }
}

export function App() {
  const initialState = useMemo(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.collection?.requests?.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore corrupted storage
    }
    const demo = loadDefaultDemoCollection();
    return {
      lang: 'ar' as Language,
      collection: demo,
      envVars: demo.variables,
      activeRequestId: demo.requests[0]?.id || '',
      history: [] as HistoryEntry[],
    };
  }, []);

  const [lang, setLang] = useState<Language>(initialState.lang || 'ar');
  const [mainView, setMainView] = useState<'studio' | 'intelligence'>('studio');
  const [collection, setCollection] = useState<ParsedCollection>(initialState.collection);
  const [envVars, setEnvVars] = useState<EnvVariable[]>(initialState.envVars || []);
  const [activeRequestId, setActiveRequestId] = useState<string>(
    initialState.activeRequestId || initialState.collection.requests[0]?.id || ''
  );
  const [history, setHistory] = useState<HistoryEntry[]>(initialState.history || []);

  // Execution & Inspector State
  const [currentResult, setCurrentResult] = useState<ProxyExecutionResult | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [followRedirects, setFollowRedirects] = useState(true);

  // All-Responses Scenario Matrix State
  const [matrixOutcomes, setMatrixOutcomes] = useState<ScenarioRunOutcome[]>([]);
  const [isRunningMatrix, setIsRunningMatrix] = useState(false);
  const [inspectorTabOverride, setInspectorTabOverride] = useState<'pretty' | 'matrix' | null>(null);

  // Link Probing & Batch Runner State
  const [linkProbesMap, setLinkProbesMap] = useState<Map<string, LinkProbeResult>>(new Map());
  const [isProbingLinks, setIsProbingLinks] = useState(false);
  const [batchOutcomes, setBatchOutcomes] = useState<BatchRunItemOutcome[]>([]);
  const [isRunningBatch, setIsRunningBatch] = useState(false);

  // Modals & Drag-Drop Overlay
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [engineOnline, setEngineOnline] = useState(true);

  // Sync HTML dir & lang attributes
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Verify Node Proxy Engine health
  useEffect(() => {
    fetch('/__engine/health')
      .then((r) => setEngineOnline(r.ok))
      .catch(() => setEngineOnline(false));
  }, []);

  // Persist workspace safely (cap rawJson size so localStorage never overflows)
  useEffect(() => {
    try {
      const lightCollection = {
        ...collection,
        rawJson: collection.rawSizeBytes < 350_000 ? collection.rawJson : undefined,
      };
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          lang,
          collection: lightCollection,
          envVars,
          activeRequestId,
          history: history.slice(0, 35),
        })
      );
    } catch {
      // ignore quota limits
    }
  }, [lang, collection, envVars, activeRequestId, history]);

  const activeRequest = useMemo(() => {
    return (
      collection.requests.find((r) => r.id === activeRequestId) ||
      collection.requests[0] ||
      createBlankRequest()
    );
  }, [collection.requests, activeRequestId]);

  const analysis = useMemo(
    () =>
      analyzeCollection(
        collection.requests,
        envVars,
        collection.rawJson,
        linkProbesMap
      ),
    [collection.requests, collection.rawJson, envVars, linkProbesMap]
  );

  const updateActiveRequest = useCallback(
    (updated: ApiRequestItem) => {
      setCollection((prev) => ({
        ...prev,
        requests: prev.requests.map((r) => (r.id === updated.id ? updated : r)),
      }));
    },
    []
  );

  // Execute Single API Request
  const handleSendRequest = async () => {
    if (!activeRequest) return;
    setIsSending(true);
    setInspectorTabOverride('pretty');
    try {
      const exec = buildExecutableRequest(activeRequest, envVars);
      const res = await callProxyExecute({
        ...exec,
        followRedirects,
      });
      setCurrentResult(res);
      setHistory((prev) => [
        {
          id: uid('hist'),
          requestName: activeRequest.name,
          requestId: activeRequest.id,
          method: exec.method,
          url: exec.url,
          result: res,
        },
        ...prev.slice(0, 49),
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // Execute Smart 6-Scenario "All Responses" Matrix
  const handleRunAllResponsesMatrix = async () => {
    if (!activeRequest) return;
    const scenarios = buildAllResponsesScenarios(activeRequest, envVars);
    const hadAuth =
      activeRequest.auth.type !== 'none' ||
      activeRequest.headers.some(
        (h) => h.enabled && /^(authorization|x-api-key|api-key)$/i.test(h.key)
      );

    setInspectorTabOverride('matrix');
    setIsRunningMatrix(true);
    setMatrixOutcomes(scenarios.map((s) => ({ scenario: s, status: 'pending' })));

    for (let i = 0; i < scenarios.length; i++) {
      const sc = scenarios[i];
      setMatrixOutcomes((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: 'running' } : item))
      );

      const res = await callProxyExecute({
        method: sc.method,
        url: sc.url,
        headers: sc.headers,
        body: sc.body,
        followRedirects,
      });

      if (i === 0) {
        setCurrentResult(res);
      }

      const evaluation = evaluateScenarioOutcome(sc, res, hadAuth);
      setMatrixOutcomes((prev) =>
        prev.map((item, idx) =>
          idx === i
            ? {
                ...item,
                status: 'done',
                result: res,
                ...evaluation,
              }
            : item
        )
      );
    }

    setIsRunningMatrix(false);
  };

  // Load Saved Example Response from Postman/OpenAPI/HAR into Response Inspector
  const handleLoadSavedResponse = (saved: SavedExampleResponse) => {
    let bodyJson: unknown = undefined;
    try {
      bodyJson = JSON.parse(saved.body);
    } catch {
      bodyJson = undefined;
    }
    setCurrentResult({
      ok: true,
      status: saved.status,
      statusText: `${saved.statusText} (Saved Example)`,
      headers: saved.headers || { 'content-type': 'application/json' },
      setCookies: [],
      bodyText: saved.body,
      bodyJson,
      contentType: saved.headers?.['content-type'] || 'application/json',
      sizeBytes: new Blob([saved.body]).size,
      timings: { dnsMs: 0, tcpMs: 0, tlsMs: 0, ttfbMs: 0, downloadMs: 0, totalMs: 0 },
      redirects: [],
      finalUrl: activeRequest.url,
      timestamp: Date.now(),
    });
    setInspectorTabOverride('pretty');
  };

  // Save or Update an Environment Variable (e.g. from Response 1-click chaining)
  const handleSaveSingleVariable = (key: string, value: string) => {
    setEnvVars((prev) => {
      const existing = prev.find((v) => v.key.trim() === key.trim());
      if (existing) {
        return prev.map((v) =>
          v.id === existing.id ? { ...v, value, enabled: true } : v
        );
      }
      return [
        ...prev,
        {
          id: uid('env'),
          key: key.trim(),
          value,
          enabled: true,
          source: 'Response Chaining',
          isSecret: /token|secret|key|jwt/i.test(key),
        },
      ];
    });
  };

  // Import JSON Collection
  const handleImportCollection = (
    imported: ParsedCollection,
    mode: 'replace' | 'merge',
    openAnalyzer: boolean
  ) => {
    setLinkProbesMap(new Map());
    setBatchOutcomes([]);
    setMatrixOutcomes([]);

    if (mode === 'replace') {
      const safeRequests =
        imported.requests.length > 0 ? imported.requests : [createBlankRequest()];
      setCollection({ ...imported, requests: safeRequests });
      setEnvVars(imported.variables);
      setActiveRequestId(safeRequests[0].id);
      setCurrentResult(null);
    } else {
      setCollection((prev) => ({
        ...prev,
        requests: [...prev.requests, ...imported.requests],
      }));
      setEnvVars((prev) => {
        const existingKeys = new Set(prev.map((v) => v.key));
        const extra = imported.variables.filter((v) => !existingKeys.has(v.key));
        return [...prev, ...extra];
      });
    }

    if (openAnalyzer) {
      setMainView('intelligence');
    }
  };

  // Probe All Links Live across the Collection
  const handleProbeAllLinks = async () => {
    const resolvableUrls = analysis.links
      .filter((l) => !l.hasUnresolvedVars && /^https?:\/\//i.test(l.resolvedUrl))
      .map((l) => l.resolvedUrl);

    if (resolvableUrls.length === 0) return;
    setIsProbingLinks(true);
    try {
      const res = await fetch('/__engine/probe-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: resolvableUrls, concurrency: 6, timeoutMs: 12000 }),
      });
      if (res.ok) {
        const data = await res.json();
        const nextMap = new Map(linkProbesMap);
        for (const item of (data.results || []) as LinkProbeResult[]) {
          nextMap.set(item.url, item);
        }
        setLinkProbesMap(nextMap);
      }
    } finally {
      setIsProbingLinks(false);
    }
  };

  // Batch Run All Endpoints in Collection
  const handleRunBatchTests = async (subsetRequests: ApiRequestItem[]) => {
    if (subsetRequests.length === 0) return;
    setIsRunningBatch(true);
    const initial: BatchRunItemOutcome[] = subsetRequests.map((r) => ({
      request: r,
      resolvedUrl: buildExecutableRequest(r, envVars).url,
      status: 'pending',
    }));
    setBatchOutcomes(initial);

    for (let i = 0; i < subsetRequests.length; i++) {
      const req = subsetRequests[i];
      const exec = buildExecutableRequest(req, envVars);
      setBatchOutcomes((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: 'running' } : item))
      );

      const res = await callProxyExecute({
        ...exec,
        followRedirects: true,
      });

      setBatchOutcomes((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: 'done', result: res } : item
        )
      );
    }
    setIsRunningBatch(false);
  };

  // Open an arbitrary URL (e.g. clicked inside JSON response or Links Analyzer) directly in Studio
  const handleTestArbitraryUrl = (url: string, method: HttpMethod = 'GET') => {
    const existing = collection.requests.find(
      (r) => r.url === url && r.method === method
    );
    if (existing) {
      setActiveRequestId(existing.id);
      setMainView('studio');
      return;
    }
    const newReq = createBlankRequest({
      name: `${method} ${url.replace(/^https?:\/\//i, '').slice(0, 42)}`,
      folderPath: ['Quick Tested Links'],
      method,
      url,
    });
    setCollection((prev) => ({
      ...prev,
      requests: [newReq, ...prev.requests],
    }));
    setActiveRequestId(newReq.id);
    setCurrentResult(null);
    setMatrixOutcomes([]);
    setMainView('studio');
  };

  // Global window drag & drop for instant JSON collection upload
  const handleWindowDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsWindowDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseAnyCollectionInput(text, file.name);
      handleImportCollection(parsed, 'replace', true);
    } catch {
      setIsImportModalOpen(true);
    }
  };

  const resetToDemo = () => {
    const demo = loadDefaultDemoCollection();
    handleImportCollection(demo, 'replace', false);
    setMainView('studio');
  };

  return (
    <div
      className="min-h-screen flex flex-col text-slate-100"
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
          setIsWindowDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsWindowDragging(false);
      }}
      onDrop={handleWindowDrop}
    >
      {/* Global Drag & Drop Overlay */}
      {isWindowDragging && (
        <div className="fixed inset-0 z-50 bg-indigo-950/85 backdrop-blur-md border-4 border-dashed border-indigo-400 m-4 rounded-3xl flex flex-col items-center justify-center pointer-events-none">
          <UploadCloud className="w-16 h-16 text-indigo-300 animate-bounce mb-3" />
          <div className="text-xl font-extrabold text-white">
            {lang === 'ar'
              ? 'أفلت ملف الكوليكشن (.json / .har) لتحليله واستخراج كل الروابط فوراً!'
              : 'Drop JSON / HAR Collection to Analyze Endpoints & Links Instantly!'}
          </div>
        </div>
      )}

      {/* Top Glass Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#070a13]/85 backdrop-blur-xl px-4 lg:px-6 py-3">
        <div className="max-w-[1680px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-emerald-400 p-[1px] shadow-lg shadow-indigo-500/25">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-200 to-emerald-200 bg-clip-text text-transparent">
                  NEXUS API STUDIO
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hidden sm:inline-flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  <span>{engineOnline ? 'Node Proxy Active (No CORS)' : 'Direct Mode'}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden md:block">
                {lang === 'ar'
                  ? 'منصة ذكية لاختبار جميع ردود الـ API وتحليل ملفات الـ JSON Collections والروابط'
                  : 'Intelligent API Response Matrix Tester & Deep JSON Collection / Link Analyzer'}
              </p>
            </div>
          </div>

          {/* Center Primary Mode Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-slate-800">
            <button
              type="button"
              onClick={() => setMainView('studio')}
              className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer ${
                mainView === 'studio'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TerminalSquare className="w-4 h-4" />
              <span>
                {lang === 'ar' ? 'استوديو اختبار الـ API والردود' : 'API & Responses Studio'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMainView('intelligence')}
              className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer ${
                mainView === 'intelligence'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>
                {lang === 'ar' ? 'تحليل الكوليكشن والروابط' : 'Collection & Links Analyzer'}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/30 text-emerald-300 border border-emerald-500/30">
                {analysis.links.length}
              </span>
            </button>
          </div>

          {/* Right Global Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <UploadCloud className="w-4 h-4 text-indigo-400" />
              <span>{lang === 'ar' ? 'رفع كوليكشن JSON' : 'Upload JSON'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsEnvModalOpen(true)}
              className="relative px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono">{`{{${envVars.filter((v) => v.enabled).length}}}`}</span>
              {analysis.unresolvedVariables.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 absolute -top-0.5 -right-0.5 animate-ping" />
              )}
            </button>

            <button
              type="button"
              onClick={resetToDemo}
              title={lang === 'ar' ? 'استعادة الكوليكشن التجريبي' : 'Load Demo Collection'}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
              className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-mono font-bold inline-flex items-center gap-1 transition cursor-pointer"
            >
              <Globe2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1680px] w-full mx-auto p-4 lg:p-5">
        {mainView === 'studio' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Sidebar (Collection Endpoints & History) */}
            <div className="lg:col-span-3">
              <CollectionSidebar
                collectionName={collection.name}
                requests={collection.requests}
                activeRequestId={activeRequest.id}
                history={history}
                lang={lang}
                onSelectRequest={(id) => {
                  setActiveRequestId(id);
                  setCurrentResult(null);
                  setMatrixOutcomes([]);
                }}
                onCreateRequest={() => {
                  const blank = createBlankRequest({
                    name: lang === 'ar' ? 'طلب API جديد' : 'New API Request',
                  });
                  setCollection((prev) => ({
                    ...prev,
                    requests: [blank, ...prev.requests],
                  }));
                  setActiveRequestId(blank.id);
                  setCurrentResult(null);
                  setMatrixOutcomes([]);
                }}
                onDuplicateRequest={(req) => {
                  const copy: ApiRequestItem = {
                    ...JSON.parse(JSON.stringify(req)),
                    id: uid('req'),
                    name: `${req.name} (Copy)`,
                  };
                  setCollection((prev) => ({
                    ...prev,
                    requests: [copy, ...prev.requests],
                  }));
                  setActiveRequestId(copy.id);
                }}
                onDeleteRequest={(id) => {
                  setCollection((prev) => {
                    const remaining = prev.requests.filter((r) => r.id !== id);
                    const safe = remaining.length > 0 ? remaining : [createBlankRequest()];
                    if (activeRequest.id === id) {
                      setActiveRequestId(safe[0].id);
                    }
                    return { ...prev, requests: safe };
                  });
                }}
                onSelectHistoryEntry={(entry) => {
                  if (
                    entry.requestId &&
                    collection.requests.some((r) => r.id === entry.requestId)
                  ) {
                    setActiveRequestId(entry.requestId);
                  }
                  setCurrentResult(entry.result);
                }}
                onClearHistory={() => setHistory([])}
                onOpenImportModal={() => setIsImportModalOpen(true)}
              />
            </div>

            {/* Right Studio Pane: Request Builder + Comprehensive Response Inspector */}
            <div className="lg:col-span-9 space-y-4">
              <RequestBuilder
                request={activeRequest}
                envVars={envVars}
                lang={lang}
                isSending={isSending}
                isRunningMatrix={isRunningMatrix}
                onChange={updateActiveRequest}
                onSend={handleSendRequest}
                onRunAllResponsesMatrix={handleRunAllResponsesMatrix}
                onLoadSavedResponse={handleLoadSavedResponse}
              />

              <ResponseInspector
                result={currentResult}
                matrixOutcomes={matrixOutcomes}
                isRunningMatrix={isRunningMatrix}
                followRedirects={followRedirects}
                onToggleFollowRedirects={setFollowRedirects}
                onRunMatrix={handleRunAllResponsesMatrix}
                onSelectScenarioResult={(res) => setCurrentResult(res)}
                onTestUrl={(url) => handleTestArbitraryUrl(url, 'GET')}
                onSaveVariable={handleSaveSingleVariable}
                lang={lang}
                activeTabOverride={inspectorTabOverride}
                onClearTabOverride={() => setInspectorTabOverride(null)}
              />
            </div>
          </div>
        ) : (
          <CollectionIntelligenceView
            collection={collection}
            analysis={analysis}
            envVars={envVars}
            lang={lang}
            isProbingLinks={isProbingLinks}
            batchOutcomes={batchOutcomes}
            isRunningBatch={isRunningBatch}
            onUpdateEnvVars={setEnvVars}
            onProbeAllLinks={handleProbeAllLinks}
            onRunBatchTests={handleRunBatchTests}
            onOpenRequestInStudio={(reqId) => {
              setActiveRequestId(reqId);
              setCurrentResult(null);
              setMatrixOutcomes([]);
              setMainView('studio');
            }}
            onTestArbitraryUrlInStudio={handleTestArbitraryUrl}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        )}
      </main>

      {/* Modals */}
      <CollectionImportModal
        isOpen={isImportModalOpen}
        lang={lang}
        onClose={() => setIsImportModalOpen(false)}
        onImportCollection={handleImportCollection}
        onImportSingleRequest={(req) => {
          setCollection((prev) => ({
            ...prev,
            requests: [req, ...prev.requests],
          }));
          setActiveRequestId(req.id);
          setMainView('studio');
        }}
      />

      <EnvVariablesModal
        isOpen={isEnvModalOpen}
        lang={lang}
        variables={envVars}
        unresolvedKeys={analysis.unresolvedVariables}
        onClose={() => setIsEnvModalOpen(false)}
        onChange={setEnvVars}
      />
    </div>
  );
}

export default App;


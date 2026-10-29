import React, { useMemo, useState } from 'react';
import {
  Folder,
  FolderOpen,
  Plus,
  Search,
  History,
  Layers,
  Trash2,
  UploadCloud,
  Copy,
} from 'lucide-react';
import {
  ApiRequestItem,
  HistoryEntry,
  Language,
} from '../types/api';
import {
  formatMs,
  getStatusBadgeStyle,
  METHOD_STYLES,
} from '../utils/helpers';

interface CollectionSidebarProps {
  collectionName: string;
  requests: ApiRequestItem[];
  activeRequestId: string;
  history: HistoryEntry[];
  lang: Language;
  onSelectRequest: (id: string) => void;
  onCreateRequest: () => void;
  onDuplicateRequest: (req: ApiRequestItem) => void;
  onDeleteRequest: (id: string) => void;
  onSelectHistoryEntry: (entry: HistoryEntry) => void;
  onClearHistory: () => void;
  onOpenImportModal: () => void;
}

export const CollectionSidebar: React.FC<CollectionSidebarProps> = ({
  collectionName,
  requests,
  activeRequestId,
  history,
  lang,
  onSelectRequest,
  onCreateRequest,
  onDuplicateRequest,
  onDeleteRequest,
  onSelectHistoryEntry,
  onClearHistory,
  onOpenImportModal,
}) => {
  const [tab, setTab] = useState<'collection' | 'history'>('collection');
  const [search, setSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = requests.filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q) ||
        r.folderPath.join(' ').toLowerCase().includes(q)
    );

    const groups = new Map<string, ApiRequestItem[]>();
    for (const r of filtered) {
      const folderKey = r.folderPath.length > 0 ? r.folderPath.join(' / ') : '__root__';
      const arr = groups.get(folderKey) || [];
      arr.push(r);
      groups.set(folderKey, arr);
    }
    return groups;
  }, [requests, search]);

  const toggleFolder = (key: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside className="glass-panel rounded-2xl p-3.5 flex flex-col gap-3 h-full min-h-[540px] max-h-[calc(100vh-105px)]">
      {/* Sidebar Mode Switcher */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950/80 border border-slate-800/80">
        <button
          type="button"
          onClick={() => setTab('collection')}
          className={`py-1.5 px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition ${
            tab === 'collection'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>
            {lang === 'ar' ? 'الكوليكشن' : 'Collection'} ({requests.length})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`py-1.5 px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition ${
            tab === 'history'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>
            {lang === 'ar' ? 'السجل' : 'History'} ({history.length})
          </span>
        </button>
      </div>

      {tab === 'collection' && (
        <>
          {/* Collection Header & Quick Actions */}
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="text-xs font-extrabold text-slate-200 truncate" title={collectionName}>
              {collectionName}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onOpenImportModal}
                title={lang === 'ar' ? 'رفع ملف JSON' : 'Import JSON'}
                className="p-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 transition"
              >
                <UploadCloud className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onCreateRequest}
                title={lang === 'ar' ? 'طلب جديد' : 'New Request'}
                className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search Endpoints */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              dir="ltr"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث في الـ Endpoints...' : 'Filter endpoints...'}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Folder & Request Tree */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {Array.from(grouped.entries()).map(([folderKey, items]) => {
              const isRoot = folderKey === '__root__';
              const isCollapsed = collapsedFolders[folderKey];

              return (
                <div key={folderKey} className="space-y-1">
                  {!isRoot && (
                    <button
                      type="button"
                      onClick={() => toggleFolder(folderKey)}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/60 text-xs font-bold text-slate-300 transition"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        {isCollapsed ? (
                          <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <span className="truncate">{folderKey}</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{items.length}</span>
                    </button>
                  )}

                  {!isCollapsed && (
                    <div className={isRoot ? 'space-y-1' : 'space-y-1 pl-2 border-l border-slate-800/80 ml-2'}>
                      {items.map((req) => {
                        const isActive = req.id === activeRequestId;
                        return (
                          <div
                            key={req.id}
                            onClick={() => onSelectRequest(req.id)}
                            className={`group cursor-pointer rounded-xl px-2.5 py-2 border transition flex items-center justify-between gap-2 ${
                              isActive
                                ? 'bg-indigo-500/20 border-indigo-500/45 text-white shadow'
                                : 'bg-slate-900/40 border-transparent hover:bg-slate-800/60 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`font-mono text-[10px] font-extrabold w-11 text-center py-0.5 rounded border shrink-0 ${
                                  METHOD_STYLES[req.method].badge
                                }`}
                              >
                                {req.method}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold truncate">{req.name}</div>
                                <div
                                  dir="ltr"
                                  className="text-[10px] font-mono text-slate-500 truncate"
                                >
                                  {req.url}
                                </div>
                              </div>
                            </div>

                            <div
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => onDuplicateRequest(req)}
                                title="Duplicate"
                                className="p-1 text-slate-400 hover:text-indigo-300 rounded"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              {requests.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteRequest(req.id)}
                                  title="Delete"
                                  className="p-1 text-slate-400 hover:text-rose-400 rounded"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'history' && (
        <div className="flex-1 flex flex-col gap-2 overflow-hidden">
          {history.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClearHistory}
                className="text-[11px] text-slate-400 hover:text-rose-400 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>{lang === 'ar' ? 'مسح السجل' : 'Clear History'}</span>
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
            {history.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500">
                {lang === 'ar'
                  ? 'سيظهر هنا سجل كل الردود والطلبات التي تختبرها.'
                  : 'Executed requests & responses will appear here.'}
              </div>
            ) : (
              history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onSelectHistoryEntry(h)}
                  className="w-full text-left rounded-xl bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800/80 p-2.5 space-y-1 transition"
                >
                  <div className="flex items-center justify-between gap-1.5" dir="ltr">
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                        METHOD_STYLES[h.method].badge
                      }`}
                    >
                      {h.method}
                    </span>
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border ${getStatusBadgeStyle(
                        h.result.status
                      )}`}
                    >
                      {h.result.status > 0 ? h.result.status : 'ERR'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 ml-auto">
                      {formatMs(h.result.timings?.totalMs || 0)}
                    </span>
                  </div>
                  <div dir="ltr" className="font-mono text-[11px] text-slate-300 truncate">
                    {h.url}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
};


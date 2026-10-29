import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  PlusCircle,
  Search,
} from 'lucide-react';
import { Language } from '../types/api';

interface JsonTreeViewerProps {
  data: unknown;
  lang: Language;
  onTestUrl?: (url: string) => void;
  onSaveVariable?: (key: string, value: string) => void;
}

const URL_EXACT_RE = /^https?:\/\/[^\s"'<>]+$/i;

interface TreeNodeProps {
  keyName?: string | number;
  value: unknown;
  jsonPath: string;
  depth: number;
  defaultExpandedDepth: number;
  searchTerm: string;
  onTestUrl?: (url: string) => void;
  onSaveVariable?: (key: string, value: string) => void;
  onCopyPath: (path: string, val: unknown) => void;
  copiedPath: string | null;
}

const JsonNode: React.FC<TreeNodeProps> = ({
  keyName,
  value,
  jsonPath,
  depth,
  defaultExpandedDepth,
  searchTerm,
  onTestUrl,
  onSaveVariable,
  onCopyPath,
  copiedPath,
}) => {
  const [expanded, setExpanded] = useState(depth < defaultExpandedDepth);

  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isArray = Array.isArray(value);

  const matchesSearch = useMemo(() => {
    if (!searchTerm.trim()) return true;
    const lower = searchTerm.toLowerCase();
    if (keyName !== undefined && String(keyName).toLowerCase().includes(lower)) return true;
    try {
      return JSON.stringify(value).toLowerCase().includes(lower);
    } catch {
      return false;
    }
  }, [keyName, value, searchTerm]);

  if (!matchesSearch) return null;

  const renderKeyPrefix = () => {
    if (keyName === undefined) return null;
    if (typeof keyName === 'number') {
      return <span className="text-slate-500 select-none mr-1.5">[{keyName}]</span>;
    }
    return (
      <span className="text-sky-300 font-medium mr-1.5">
        "{keyName}"<span className="text-slate-400">:</span>
      </span>
    );
  };

  if (isObject || isArray) {
    const entries = isArray
      ? (value as unknown[]).map((v, idx) => [idx, v] as const)
      : Object.entries(value as Record<string, unknown>);
    const isEmpty = entries.length === 0;
    const openBracket = isArray ? '[' : '{';
    const closeBracket = isArray ? ']' : '}';
    const isForceOpen = Boolean(searchTerm.trim()) || expanded;

    return (
      <div className="font-mono text-xs leading-6" dir="ltr">
        <div className="group flex items-center gap-1 hover:bg-slate-800/40 rounded px-1 -mx-1">
          {!isEmpty ? (
            <button
              type="button"
              onClick={() => setExpanded(!isForceOpen)}
              className="text-slate-400 hover:text-indigo-300 p-0.5 rounded"
            >
              {isForceOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4" />
          )}

          {renderKeyPrefix()}

          <span className="text-slate-300">{openBracket}</span>
          {(!isForceOpen || isEmpty) && (
            <>
              {!isEmpty && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-[11px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 hover:text-indigo-300 mx-1"
                >
                  {isArray ? `${entries.length} items` : `${entries.length} keys`}
                </button>
              )}
              <span className="text-slate-300">{closeBracket}</span>
            </>
          )}

          <button
            type="button"
            onClick={() => onCopyPath(jsonPath, value)}
            title={`Copy JSON (${jsonPath})`}
            className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-[10px] text-slate-400 hover:text-indigo-300 flex items-center gap-1"
          >
            {copiedPath === jsonPath ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>{jsonPath || '$'}</span>
          </button>
        </div>

        {isForceOpen && !isEmpty && (
          <div className="pl-4 ml-2 border-l border-slate-800/80">
            {entries.map(([k, v]) => {
              const childPath =
                typeof k === 'number'
                  ? `${jsonPath}[${k}]`
                  : jsonPath
                  ? `${jsonPath}.${k}`
                  : String(k);
              return (
                <JsonNode
                  key={String(k)}
                  keyName={k}
                  value={v}
                  jsonPath={childPath}
                  depth={depth + 1}
                  defaultExpandedDepth={defaultExpandedDepth}
                  searchTerm={searchTerm}
                  onTestUrl={onTestUrl}
                  onSaveVariable={onSaveVariable}
                  onCopyPath={onCopyPath}
                  copiedPath={copiedPath}
                />
              );
            })}
            <div className="text-slate-300 pl-1">{closeBracket}</div>
          </div>
        )}
      </div>
    );
  }

  // Primitive Leaf Node
  let valueNode: React.ReactNode;
  const isUrlString = typeof value === 'string' && URL_EXACT_RE.test(value.trim());

  if (value === null) {
    valueNode = <span className="text-rose-400 italic">null</span>;
  } else if (typeof value === 'boolean') {
    valueNode = <span className="text-amber-300 font-semibold">{String(value)}</span>;
  } else if (typeof value === 'number') {
    valueNode = <span className="text-purple-300">{value}</span>;
  } else if (typeof value === 'string') {
    valueNode = (
      <span className="text-emerald-300 break-all">
        "{value}"
      </span>
    );
  } else {
    valueNode = <span className="text-slate-300">{String(value)}</span>;
  }

  return (
    <div
      dir="ltr"
      className="group font-mono text-xs leading-6 flex flex-wrap items-center gap-1.5 pl-4 hover:bg-slate-800/40 rounded px-1"
    >
      {renderKeyPrefix()}
      {valueNode}

      {isUrlString && onTestUrl && (
        <button
          type="button"
          onClick={() => onTestUrl(String(value).trim())}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border border-indigo-500/30 text-[10px] transition"
        >
          <ExternalLink className="w-2.5 h-2.5" />
          <span>Test URL</span>
        </button>
      )}

      <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 ml-1">
        <button
          type="button"
          onClick={() => onCopyPath(jsonPath, value)}
          title={`Copy value (${jsonPath})`}
          className="text-[10px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-0.5 px-1 rounded bg-slate-800/80"
        >
          {copiedPath === jsonPath ? (
            <Check className="w-2.5 h-2.5 text-emerald-400" />
          ) : (
            <Copy className="w-2.5 h-2.5" />
          )}
          <span>{jsonPath}</span>
        </button>

        {onSaveVariable &&
          (typeof value === 'string' || typeof value === 'number') &&
          String(value).length > 0 &&
          String(value).length < 1500 && (
            <button
              type="button"
              onClick={() =>
                onSaveVariable(
                  typeof keyName === 'string' ? keyName : 'extractedVar',
                  String(value)
                )
              }
              title="Save value as {{variable}}"
              className="text-[10px] text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-0.5 px-1 rounded bg-emerald-500/15 border border-emerald-500/25"
            >
              <PlusCircle className="w-2.5 h-2.5" />
              <span>{'{{var}}'}</span>
            </button>
          )}
      </span>
    </div>
  );
};

export const JsonTreeViewer: React.FC<JsonTreeViewerProps> = ({
  data,
  lang,
  onTestUrl,
  onSaveVariable,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [defaultDepth, setDefaultDepth] = useState(2);
  const [treeKey, setTreeKey] = useState(0);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleCopyPath = (path: string, val: unknown) => {
    const text = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
    navigator.clipboard.writeText(text);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800/80">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            dir="ltr"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              lang === 'ar'
                ? 'بحث سريع داخل حقول وقيم الـ JSON...'
                : 'Filter keys or values inside JSON...'
            }
            className="w-full bg-slate-900/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/60"
          />
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => {
              setDefaultDepth(6);
              setTreeKey((k) => k + 1);
            }}
            className="px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 transition"
          >
            {lang === 'ar' ? 'فتح الكل' : 'Expand All'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDefaultDepth(1);
              setTreeKey((k) => k + 1);
            }}
            className="px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 transition"
          >
            {lang === 'ar' ? 'طي الكل' : 'Collapse'}
          </button>
          <button
            type="button"
            onClick={() => handleCopyPath('$root', data)}
            className="px-2.5 py-1 rounded-md bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 inline-flex items-center gap-1 transition"
          >
            {copiedPath === '$root' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{lang === 'ar' ? 'نسخ JSON' : 'Copy JSON'}</span>
          </button>
        </div>
      </div>

      <div className="overflow-auto flex-1 pr-1" key={treeKey}>
        <JsonNode
          value={data}
          jsonPath=""
          depth={0}
          defaultExpandedDepth={defaultDepth}
          searchTerm={searchTerm}
          onTestUrl={onTestUrl}
          onSaveVariable={onSaveVariable}
          onCopyPath={handleCopyPath}
          copiedPath={copiedPath}
        />
      </div>
    </div>
  );
};


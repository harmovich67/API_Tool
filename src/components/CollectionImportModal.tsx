import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileJson,
  Sparkles,
  X,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { ApiRequestItem, Language, ParsedCollection } from '../types/api';
import { parseAnyCollectionInput } from '../utils/collectionParser';
import { parseCurlCommand } from '../utils/curlUtils';
import { formatBytes } from '../utils/helpers';

interface CollectionImportModalProps {
  isOpen: boolean;
  lang: Language;
  onClose: () => void;
  onImportCollection: (collection: ParsedCollection, mode: 'replace' | 'merge', openAnalyzer: boolean) => void;
  onImportSingleRequest: (req: ApiRequestItem) => void;
}

export const CollectionImportModal: React.FC<CollectionImportModalProps> = ({
  isOpen,
  lang,
  onClose,
  onImportCollection,
  onImportSingleRequest,
}) => {
  const [tab, setTab] = useState<'file' | 'paste' | 'curl'>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [curlText, setCurlText] = useState('');
  const [preview, setPreview] = useState<ParsedCollection | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const processRawContent = (content: string, fileName: string) => {
    setErrorMsg(null);
    try {
      const parsed = parseAnyCollectionInput(content, fileName);
      setPreview(parsed);
    } catch (err: any) {
      setPreview(null);
      setErrorMsg(err?.message || 'Failed to parse JSON collection');
    }
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      processRawContent(text, file.name);
    } catch {
      setErrorMsg(lang === 'ar' ? 'تعذر قراءة الملف.' : 'Could not read selected file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleParsePaste = () => {
    if (!pasteText.trim()) return;
    processRawContent(pasteText, 'Pasted-Collection.json');
  };

  const handleImportCurl = () => {
    setErrorMsg(null);
    const req = parseCurlCommand(curlText);
    if (!req) {
      setErrorMsg(
        lang === 'ar'
          ? 'صيغة أمر cURL غير صحيحة. تأكد أنه يبدأ بـ curl ويحتوي على رابط.'
          : 'Invalid cURL command. Make sure it starts with `curl` and includes a URL.'
      );
      return;
    }
    onImportSingleRequest(req);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="glass-panel-elevated w-full max-w-2xl rounded-2xl shadow-2xl border border-indigo-500/20 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/25 to-emerald-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300">
              <FileJson className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {lang === 'ar'
                  ? 'رفع وتحليل كوليكشن JSON والروابط الذكي'
                  : 'Smart JSON Collection & Links Importer'}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'ar'
                  ? 'يدعم Postman v2 • OpenAPI / Swagger • Insomnia • HAR • أو أي ملف JSON فيه روابط'
                  : 'Supports Postman v2 • OpenAPI / Swagger • Insomnia • HAR • Arbitrary JSON & URLs'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-800/60">
          <button
            type="button"
            onClick={() => {
              setTab('file');
              setErrorMsg(null);
            }}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center gap-2 ${
              tab === 'file'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>{lang === 'ar' ? 'رفع ملف JSON / HAR' : 'Upload JSON / HAR File'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('paste');
              setErrorMsg(null);
            }}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center gap-2 ${
              tab === 'paste'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{lang === 'ar' ? 'لصق كود JSON أو روابط' : 'Paste Raw JSON / URLs'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('curl');
              setErrorMsg(null);
            }}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center gap-2 ${
              tab === 'curl'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>{lang === 'ar' ? 'استيراد أمر cURL' : 'Import cURL'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {tab === 'file' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-500/15 scale-[1.01]'
                  : 'border-slate-700/80 hover:border-indigo-500/60 bg-slate-900/40 hover:bg-slate-900/70'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.har,.txt,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300">
                <UploadCloud className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-slate-100 mb-1">
                {lang === 'ar'
                  ? 'اسحب وأفلت ملف الكوليكشن (.json أو .har) هنا أو اضغط للاختيار'
                  : 'Drag & drop your .json or .har collection here, or click to browse'}
              </p>
              <p className="text-xs text-slate-400">
                {lang === 'ar'
                  ? 'سيقوم المحرك الذكي بالتعرف التلقائي على البنية واستخراج كل الـ Endpoints والمتغيرات والروابط'
                  : 'Auto-detects schema, nested folders, auth tokens, variables, saved responses & deep links'}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
                {[
                  'Postman v2.0 / v2.1',
                  'OpenAPI 3.x',
                  'Swagger 2.0',
                  'Insomnia v4',
                  'HAR 1.2',
                  'Thunder / Hoppscotch',
                  'Any Custom JSON',
                ].map((badge) => (
                  <span
                    key={badge}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-300 border border-slate-700/80"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          )}

          {tab === 'paste' && (
            <div className="space-y-3">
              <textarea
                dir="ltr"
                rows={8}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'{\n  "info": { "name": "My API" },\n  "item": [ ... ]\n}\n// Or paste OpenAPI JSON, custom JSON config, or raw URL list'}
                className="w-full rounded-xl bg-slate-950/90 border border-slate-800 p-3.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleParsePaste}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition inline-flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'تحليل النص الآن' : 'Parse & Preview JSON'}</span>
              </button>
            </div>
          )}

          {tab === 'curl' && (
            <div className="space-y-3">
              <textarea
                dir="ltr"
                rows={7}
                value={curlText}
                onChange={(e) => setCurlText(e.target.value)}
                placeholder={`curl -X POST 'https://httpbin.org/post' \\\n  -H 'Authorization: Bearer my_secret_jwt' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"hello":"world"}'`}
                className="w-full rounded-xl bg-slate-950/90 border border-slate-800 p-3.5 font-mono text-xs text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleImportCurl}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition inline-flex items-center gap-2"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'فتح الطلب في الاستوديو' : 'Load cURL into Studio'}</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 p-3.5 flex items-start gap-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Smart Parsed Preview Card */}
          {preview && tab !== 'curl' && (
            <div className="rounded-2xl bg-gradient-to-br from-indigo-950/60 to-slate-900/90 border border-indigo-500/35 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{preview.name}</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {preview.formatLabel}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {formatBytes(preview.rawSizeBytes)}
                      </span>
                    </div>
                    {preview.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{preview.description}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-2.5 text-center">
                  <div className="text-lg font-extrabold text-indigo-300">{preview.requests.length}</div>
                  <div className="text-[11px] text-slate-400">
                    {lang === 'ar' ? 'طلب / Endpoint' : 'Endpoints'}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-2.5 text-center">
                  <div className="text-lg font-extrabold text-emerald-300">{preview.variables.length}</div>
                  <div className="text-[11px] text-slate-400">
                    {lang === 'ar' ? 'متغيرات مستخرجة' : 'Env Variables'}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-2.5 text-center">
                  <div className="text-lg font-extrabold text-amber-300">
                    {preview.requests.reduce((acc, r) => acc + (r.savedResponses?.length || 0), 0)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {lang === 'ar' ? 'أمثلة ردود محفوظة' : 'Saved Responses'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onImportCollection(preview, 'merge', true);
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                >
                  {lang === 'ar' ? 'دمج مع الكوليكشن الحالي + تحليل' : 'Merge & Analyze'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onImportCollection(preview, 'replace', true);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition inline-flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {lang === 'ar'
                      ? 'فتح الكوليكشن وتحليل الروابط فوراً'
                      : 'Load Collection & Open Links Intelligence'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


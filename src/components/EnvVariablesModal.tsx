import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Sliders,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { EnvVariable, Language } from '../types/api';
import { tryDecodeJwt, uid } from '../utils/helpers';

interface EnvVariablesModalProps {
  isOpen: boolean;
  lang: Language;
  variables: EnvVariable[];
  unresolvedKeys: string[];
  onClose: () => void;
  onChange: (vars: EnvVariable[]) => void;
}

export const EnvVariablesModal: React.FC<EnvVariablesModalProps> = ({
  isOpen,
  lang,
  variables,
  unresolvedKeys,
  onClose,
  onChange,
}) => {
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const updateVar = (id: string, patch: Partial<EnvVariable>) => {
    onChange(variables.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const removeVar = (id: string) => {
    onChange(variables.filter((v) => v.id !== id));
  };

  const addVar = (keyName = '', val = '') => {
    onChange([
      ...variables,
      {
        id: uid('env'),
        key: keyName,
        value: val,
        enabled: true,
        source: 'Manual',
        isSecret: /token|secret|key|pass/i.test(keyName),
      },
    ]);
  };

  const missingNotYetAdded = unresolvedKeys.filter(
    (uk) => !variables.some((v) => v.key.trim() === uk)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="glass-panel-elevated w-full max-w-3xl rounded-2xl shadow-2xl border border-indigo-500/20 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {lang === 'ar'
                  ? 'متغيرات البيئة الذكية (Environment Variables)'
                  : 'Smart Environment Variables'}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'ar'
                  ? 'استخدم {{variable}} في الروابط أو الهيدرز أو الـ JSON Body وسيتم تعويضها تلقائياً'
                  : 'Use {{variable}} anywhere in URLs, Headers, Auth, or JSON Body'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {missingNotYetAdded.length > 0 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <AlertCircle className="w-4 h-4" />
                <span>
                  {lang === 'ar'
                    ? 'متغيرات مكتشفة في الكوليكشن تحتاج إلى تعريف:'
                    : 'Discovered placeholders in collection missing definitions:'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missingNotYetAdded.map((mk) => (
                  <button
                    key={mk}
                    type="button"
                    onClick={() => addVar(mk, '')}
                    className="text-xs font-mono px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 inline-flex items-center gap-1 transition"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{`{{${mk}}}`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {variables.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-500">
                {lang === 'ar'
                  ? 'لا توجد متغيرات حالياً. أضف متغيراً مثل baseUrl أو token.'
                  : 'No environment variables defined yet.'}
              </div>
            )}

            {variables.map((v) => {
              const jwt = tryDecodeJwt(v.value);
              const isMasked = v.isSecret && !revealedIds[v.id];
              return (
                <div
                  key={v.id}
                  className="rounded-xl bg-slate-900/70 border border-slate-800/90 p-2.5 space-y-1.5"
                >
                  <div className="flex items-center gap-2" dir="ltr">
                    <input
                      type="checkbox"
                      checked={v.enabled}
                      onChange={(e) => updateVar(v.id, { enabled: e.target.checked })}
                      className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={v.key}
                      onChange={(e) => updateVar(v.id, { key: e.target.value })}
                      placeholder="variableName (e.g. baseUrl)"
                      className="w-48 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-indigo-300 focus:outline-none focus:border-indigo-500"
                    />
                    <div className="relative flex-1">
                      <input
                        type={isMasked ? 'password' : 'text'}
                        value={v.value}
                        onChange={(e) => updateVar(v.id, { value: e.target.value })}
                        placeholder="Value (e.g. https://api.example.com)"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-2.5 pr-8 py-1.5 font-mono text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
                      />
                      {v.isSecret && (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedIds((prev) => ({ ...prev, [v.id]: !prev[v.id] }))
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        >
                          {isMasked ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVar(v.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {jwt && (
                    <div
                      dir="ltr"
                      className={`text-[11px] font-mono px-2.5 py-1 rounded-lg flex items-center justify-between ${
                        jwt.isExpired
                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>
                          JWT ({String(jwt.header.alg || 'JWT')}) — sub:{' '}
                          {String(jwt.payload.sub || jwt.payload.email || jwt.payload.id || 'N/A')}
                        </span>
                      </span>
                      {jwt.expiresAt && (
                        <span>
                          {jwt.isExpired ? 'EXPIRED: ' : 'Exp: '}
                          {jwt.expiresAt.slice(0, 19).replace('T', ' ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800/80 bg-slate-900/60">
          <button
            type="button"
            onClick={() => addVar('', '')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'ar' ? 'إضافة متغير جديد' : 'Add Variable'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
          >
            {lang === 'ar' ? 'حفظ وإغلاق' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};


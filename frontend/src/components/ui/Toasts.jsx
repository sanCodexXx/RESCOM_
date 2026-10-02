import React from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { useUi } from '../../context/UiContext.jsx';

const BG = {
  ok: 'bg-success border-success',
  warn: 'bg-warn border-warn',
  bad: 'bg-danger border-danger'
};

export function Toasts() {
  const { toasts } = useUi();
  return (
    <div className="fixed right-5 bottom-5 z-[99] flex flex-col gap-2.5">
      {toasts.map((t) => (
        <div key={t.id} className={`border text-white rounded-xl px-4 py-3.5 text-[12.5px] flex items-center gap-2.5 shadow-glass max-w-[340px] anim-slide ${BG[t.kind] || 'bg-navy-900 border-navy-900'}`}>
          {t.kind === 'bad' ? <AlertTriangle size={16} /> : <Check size={16} />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

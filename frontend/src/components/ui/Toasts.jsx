import React from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useUi } from '../../context/UiContext.jsx';
export function Toasts({ inDialog = false }) {
  const { toasts, dismissToast, modal, confirm } = useUi();
  if ((modal || confirm) && !inDialog) return null;
  return <div className="toast-stack" aria-label="Notifications">
    {toasts.map(t => <div key={t.id} role={t.kind === 'bad' ? 'alert' : 'status'} className={`rescom-toast toast-${t.kind}`}>
      {t.kind === 'ok' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
      <span className="flex-1 min-w-0">{t.msg}</span><button aria-label="Dismiss notification" onClick={() => dismissToast(t.id)}><X size={17} /></button>
    </div>)}
  </div>;
}

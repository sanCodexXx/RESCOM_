import React, { useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useUi } from '../../context/UiContext.jsx';
function feedbackTitle(item) {
  if (item.kind === 'bad') return 'Action not completed';
  if (item.kind === 'warn') return 'Please check';
  if (/delet|removed/i.test(item.msg)) return 'Record deleted';
  if (/updat|edit/i.test(item.msg)) return 'Changes saved';
  if (/register|saved|added/i.test(item.msg)) return 'Saved successfully';
  return 'Done';
}
export function Toasts() {
  const { toasts, dismissToast } = useUi();
  const item = toasts[0];
  const ref = useRef(null);
  useEffect(() => {
    if (!item) return;
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    const timer = item.kind === 'ok' ? setTimeout(() => dismissToast(item.id), 3500) : null;
    return () => { clearTimeout(timer); dialog.close(); if (previous?.isConnected) previous.focus?.(); };
  }, [item?.id, dismissToast]);
  if (!item) return null;
  const dismiss = () => dismissToast(item.id);
  const failure = item.kind !== 'ok';
  return <dialog ref={ref} role="alertdialog" aria-labelledby="feedback-title" aria-describedby="feedback-message"
    className={`feedback-dialog feedback-${item.kind}`} onCancel={e => { e.preventDefault(); dismiss(); }}>
    <button className="feedback-close" aria-label="Dismiss notification" onClick={dismiss}><X size={19} /></button>
    <div className="feedback-icon">{failure ? <AlertTriangle size={39} /> : <CheckCircle2 size={43} />}</div>
    <h2 id="feedback-title">{feedbackTitle(item)}</h2>
    <p id="feedback-message">{item.msg}</p>
    <button autoFocus className="feedback-done" onClick={dismiss}>OK</button>
  </dialog>;
}

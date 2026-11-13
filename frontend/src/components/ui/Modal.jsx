import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useUi } from '../../context/UiContext.jsx';
import Button from './Button.jsx';
function safeMsg(msg) {
  return String(msg ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;(\/?)b&gt;/g, '<$1b>');
}
export function ModalHost() {
  const { modal, closeModal, confirm, closeConfirm, toast } = useUi();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const active = Boolean(modal || confirm);
  useEffect(() => {
    if (!active) return;
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [active]);
  function dismiss() {
    if (busy) return;
    if (confirm) closeConfirm(); else closeModal();
  }
  if (!active) return null;
  return <dialog ref={ref} aria-labelledby="rescom-dialog-title" aria-describedby={confirm ? 'rescom-dialog-description' : undefined}
    className="rescom-dialog" onCancel={e => { e.preventDefault(); dismiss(); }}
    onClick={e => { if (e.target === e.currentTarget) { const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dismiss(); } }}>
    <div className="dialog-header"><div><h2 id="rescom-dialog-title">{confirm?.title || modal?.title}</h2>
      {!confirm && modal.sub && <p>{modal.sub}</p>}</div>
      <button aria-label="Close dialog" disabled={busy} onClick={dismiss} className="p-2 rounded-lg hover:bg-slate-100"><X size={20} /></button>
    </div>
    {confirm ? <>
      <div className="dialog-body"><p id="rescom-dialog-description" dangerouslySetInnerHTML={{ __html: safeMsg(confirm.msg) }} /></div>
      <div className="dialog-footer"><Button variant="ghost" disabled={busy} onClick={dismiss}>Cancel</Button>
        <Button variant={confirm.variant || 'danger'} onClick={async () => {
          setBusy(true);
          try { await confirm.onConfirm(); closeConfirm(); }
          catch (e) { toast(e.message || 'The action could not be completed.', 'bad'); }
          finally { setBusy(false); }
        }}>{busy ? 'Working…' : confirm.confirmLabel || 'Confirm'}</Button></div>
    </> : <><div className="dialog-body">{modal.body}</div>{modal.footer && <div className="dialog-footer">{modal.footer}</div>}</>}
  </dialog>;
}

import React, { useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { useUi } from '../../context/UiContext.jsx';
import Button from './Button.jsx';

export function ModalHost() {
  const { modal, closeModal, confirm, closeConfirm, success, closeSuccess } = useUi();

  // Success modal auto-dismisses after its animation finishes; tapping
  // Cancel/backdrop dismisses it immediately either way.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => closeSuccess(), success.duration || 1800);
    return () => clearTimeout(t);
  }, [success, closeSuccess]);

  if (!modal && !confirm && !success) return null;

  return (
    <div
      className="fixed inset-0 bg-navy-900/40 grid place-items-center z-[70] p-5 anim-fade"
      onClick={(e) => { if (e.target === e.currentTarget) { closeModal(); closeConfirm(); closeSuccess(); } }}
    >
      {modal && (
        <div className="glass-strong rounded-glass w-full max-w-[560px] max-h-[88vh] overflow-auto shadow-glass anim-pop scroll-thin">
          <div className="px-6 pt-5 flex justify-between items-start gap-3">
            <div>
              <b className="text-[17px] text-navy-900">{modal.title}</b>
              {modal.sub && <p className="text-[12.5px] text-navy-900/55 mt-1">{modal.sub}</p>}
            </div>
            <button onClick={closeModal} className="text-navy-900/50 hover:bg-navy-900/8 rounded-lg p-2">
              <X size={18} />
            </button>
          </div>
          <div className="px-6 py-5">{modal.body}</div>
          <div className="px-6 pb-6 flex gap-2.5">{modal.footer}</div>
        </div>
      )}

      {confirm && (
        <div className="glass-strong rounded-glass w-full max-w-[440px] p-6 shadow-glass anim-pop">
          <b className="text-[16px] text-navy-900">{confirm.title}</b>
          <p className="text-[13px] text-navy-900/70 leading-relaxed mt-3" dangerouslySetInnerHTML={{ __html: confirm.msg }} />
          <div className="flex gap-2.5 mt-5">
            <Button variant="ghost" block onClick={closeConfirm}>Cancel</Button>
            <Button variant="danger" block onClick={() => { confirm.onConfirm(); closeConfirm(); }}>Yes, continue</Button>
          </div>
        </div>
      )}

      {success && (
        <div className="glass-strong rounded-glass w-full max-w-[360px] p-8 shadow-glass anim-pop text-center">
          <div className="mx-auto w-[72px] h-[72px] rounded-full bg-success-bg grid place-items-center relative">
            <svg viewBox="0 0 52 52" className="w-[72px] h-[72px] absolute inset-0">
              <circle cx="26" cy="26" r="24" fill="none" stroke="#127A45" strokeWidth="2.5" className="success-ring" />
            </svg>
            <Check size={30} strokeWidth={3} className="text-success success-check" />
          </div>
          <b className="block text-[16px] text-navy-900 mt-4">{success.title}</b>
          {success.message && <p className="text-[12.5px] text-navy-900/55 mt-1.5">{success.message}</p>}
          <button onClick={closeSuccess} className="mt-5 text-[12.5px] font-semibold text-navy-900/50 hover:text-navy-900 underline">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

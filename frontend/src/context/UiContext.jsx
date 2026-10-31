import React, { createContext, useContext, useState, useCallback } from 'react';

function uid() { return 'T-' + Math.random().toString(36).slice(2, 8); }

const UiContext = createContext(null);

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [success, setSuccess] = useState(null);

  const dismissToast = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), []);
  const toast = useCallback((msg, kind = 'ok') => {
    const id = uid();
    setToasts(t => t.some(item => item.msg === msg && item.kind === kind) ? t : [{ id, msg, kind }]);

  }, []);

  const openModal = useCallback((cfg) => setModal(cfg), []);
  const closeModal = useCallback(() => setModal(null), []);
  const openConfirm = useCallback((cfg) => setConfirm(cfg), []);
  const closeConfirm = useCallback(() => setConfirm(null), []);
  // Compatibility helper: routine feedback uses the centered shared popup.
  const openSuccess = useCallback(cfg => {
    const value = typeof cfg === 'string' ? { title: cfg } : cfg;
    toast([value.title, value.message].filter(Boolean).join(' '), 'ok');
  }, [toast]);
  const closeSuccess = useCallback(() => setSuccess(null), []);

  return (
    <UiContext.Provider value={{
      toasts, toast, dismissToast,
      modal, openModal, closeModal,
      confirm, openConfirm, closeConfirm,
      success, openSuccess, closeSuccess
    }}>
      {children}
    </UiContext.Provider>
  );
}

export const useUi = () => useContext(UiContext);

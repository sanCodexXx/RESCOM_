import React, { createContext, useContext, useState, useCallback } from 'react';

function uid() { return 'T-' + Math.random().toString(36).slice(2, 8); }

const UiContext = createContext(null);

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [success, setSuccess] = useState(null);

  const toast = useCallback((msg, kind = 'ok') => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const openModal = useCallback((cfg) => setModal(cfg), []);
  const closeModal = useCallback(() => setModal(null), []);
  const openConfirm = useCallback((cfg) => setConfirm(cfg), []);
  const closeConfirm = useCallback(() => setConfirm(null), []);
  // Animated green-check confirmation modal. Auto-dismisses after
  // `duration` ms (default 1.8s); tapping Cancel/backdrop closes it early.
  const openSuccess = useCallback((cfg) => setSuccess(typeof cfg === 'string' ? { title: cfg } : cfg), []);
  const closeSuccess = useCallback(() => setSuccess(null), []);

  return (
    <UiContext.Provider value={{
      toasts, toast,
      modal, openModal, closeModal,
      confirm, openConfirm, closeConfirm,
      success, openSuccess, closeSuccess
    }}>
      {children}
    </UiContext.Provider>
  );
}

export const useUi = () => useContext(UiContext);

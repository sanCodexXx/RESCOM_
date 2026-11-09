import { useEffect, useRef } from 'react';

export function useSyncRefresh(load) {
  const currentLoad = useRef(load);
  currentLoad.current = load;

  useEffect(() => {
    const refresh = () => currentLoad.current();
    window.addEventListener('rescom:records-updated', refresh);
    return () => window.removeEventListener('rescom:records-updated', refresh);
  }, []);
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { BASE_URL } from '../../lib/api.js';
export default function ConnectionStatus() {
  const [status, setStatus] = useState('checking');
  const [latency, setLatency] = useState(null);
  const controller = useRef(null);
  const check = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus('checking');
    const started = performance.now();
    const timeout = setTimeout(() => current.abort(), 12000);
    try {
      const response = await fetch(`${BASE_URL}/api/health`, { signal: current.signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body.status !== 'ok') throw new Error('unavailable');
      if (controller.current === current) { setStatus('online'); setLatency(Math.round(performance.now() - started)); }
    } catch {
      if (controller.current === current) setStatus(navigator.onLine ? 'unavailable' : 'offline');
    } finally { clearTimeout(timeout); }
  }, []);
  useEffect(() => {
    check();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') check(); }, 60000);
    window.addEventListener('online', check); window.addEventListener('offline', check);
    return () => { clearInterval(timer); controller.current?.abort(); controller.current = null;
      window.removeEventListener('online', check); window.removeEventListener('offline', check); };
  }, [check]);
  const labels = { checking: 'Checking API', online: 'API connected', offline: 'Device offline', unavailable: 'API unreachable' };
  return <div className={`connection-status connection-${status}`}>
    <span role="status" className="flex items-center gap-2">{status === 'offline' || status === 'unavailable' ? <WifiOff size={15} /> : <Wifi size={15} />}
      {labels[status]}{status === 'online' && <span className="hidden sm:inline opacity-70">{latency} ms</span>}</span>
    {(status === 'offline' || status === 'unavailable') && <span className="connection-help">Check your connection before saving. Changes are not queued offline.</span>}
    <button aria-label="Check API connection" title="Check API connection" disabled={status === 'checking'} onClick={check}><RefreshCw size={14} className={status === 'checking' ? 'animate-spin' : ''} /></button>
  </div>;
}

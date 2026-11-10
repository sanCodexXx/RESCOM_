import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowLeft, Clock3, Radio, RefreshCw, SatelliteDish, Unlink2, Wifi, WifiOff } from 'lucide-react';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import './Starlink.css';

const alertLabels = {
  thermal_throttle: 'Thermal throttling', thermal_shutdown: 'Thermal shutdown',
  slow_ethernet: 'Slow Ethernet link', obstructed: 'Obstruction detected'
};
const reportTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
const emptyDish = { name: '', terminal_id: '' };

function reportStatus(connection, error) {
  if (error) return { label: 'Status unavailable', tone: 'warn', detail: 'RESCOM could not check the latest report. Refresh when the server is reachable.' };
  if (!connection) return { label: 'Checking status', tone: 'idle', detail: 'Checking your saved equipment.' };
  if (!connection.dish) return { label: 'No dish linked', tone: 'idle', detail: 'Enter the Terminal ID for the dish you want to monitor.' };
  if (!connection.relayEnabled) return { label: 'Relay setup needed', tone: 'idle', detail: 'Your dish is saved. Configure the RESCOM relay to receive its diagnostics.' };
  if (!connection.report) return { label: 'Waiting for a report', tone: 'idle', detail: 'Start the relay on the dish network. RESCOM will match its report to this Terminal ID.' };
  if (connection.report.stale) return { label: 'Report is stale', tone: 'warn', detail: 'The latest report is over two minutes old. Check the relay and its internet connection.' };
  return connection.report.reachable
    ? { label: 'Dish responding', tone: 'live', detail: 'The relay received diagnostics from this Terminal ID.' }
    : { label: 'Dish check failed', tone: 'warn', detail: 'The relay could not read the dish. Check its local network and power.' };
}

export default function Starlink({ onNav }) {
  const { openConfirm } = useUi();
  const [connection, setConnection] = useState(null);
  const [form, setForm] = useState(emptyDish);
  const [readError, setReadError] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const mutation = useRef(false);
  const revision = useRef(0);
  const initialized = useRef(false);

  const refresh = useCallback(async () => {
    if (mutation.current) return;
    const request = ++revision.current;
    setChecking(true);
    try {
      const result = await api.get('/starlink/connection');
      if (request !== revision.current) return;
      setConnection(result);
      setReadError(false);
      if (!initialized.current) {
        initialized.current = true;
        setForm(result.dish || emptyDish);
      }
    } catch {
      if (request === revision.current) setReadError(true);
    } finally {
      if (request === revision.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
    window.addEventListener('online', refresh);
    return () => { revision.current++; clearInterval(interval); window.removeEventListener('online', refresh); };
  }, [refresh]);

  async function update(remove = false) {
    if (mutation.current) return;
    mutation.current = true;
    revision.current++;
    setChecking(false);
    setBusy(true);
    setFormError('');
    setNotice('');
    try {
      let saved;
      if (remove) {
        await api.del('/starlink/connection');
        saved = { ...connection, dish: null, report: null };
      } else saved = await api.put('/starlink/connection', form);
      initialized.current = true;
      setConnection(saved);
      setForm(saved.dish || emptyDish);
      setReadError(false);
      setNotice(remove ? 'Dish removed from your RESCOM account.' : 'Dish saved to your RESCOM account.');
    } catch (error) {
      setFormError(error.message || 'The dish setup could not be saved.');
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  const status = reportStatus(connection, readError);
  const report = connection?.report;

  return (
    <div className="starlink-page">
      <section className="starlink-hero" aria-labelledby="starlink-title">
        <div className="starlink-hero-top">
          <span className="starlink-kicker"><SatelliteDish size={17} aria-hidden="true" /> Field connectivity</span>
          <button type="button" className="starlink-hero-link" onClick={() => onNav('dashboard')}>
            <ArrowLeft size={16} aria-hidden="true" /> Dashboard
          </button>
        </div>
        <div className="starlink-hero-copy">
          <h1 id="starlink-title">Starlink</h1>
          <p className="starlink-hero-description">Use Starlink internet in the field. RESCOM keeps field saves on your prepared device during an outage.</p>
          <div className="starlink-hero-actions">
            <a className="starlink-hero-link" href="#dish-setup">Dish setup <ArrowDown size={16} aria-hidden="true" /></a>
          </div>
        </div>
      </section>

      <div className="starlink-grid">
        <section className="starlink-panel" id="dish-setup">
          <span className="starlink-panel-icon"><SatelliteDish size={20} /></span>
          <h2>Dish setup</h2>
          <p className="starlink-panel-description">Save a dish for optional diagnostics. The Terminal ID matches it to reports from the field relay.</p>
          <form onSubmit={event => { event.preventDefault(); update(); }}>
            <fieldset className="starlink-fields" disabled={busy}>
              <label htmlFor="dish-name">Dish name</label>
              <input id="dish-name" value={form.name} onChange={event => { initialized.current = true; setForm({ ...form, name: event.target.value }); }} placeholder="Evacuation center dish" required maxLength={80} />
              <label htmlFor="terminal-id">Terminal ID</label>
              <input id="terminal-id" value={form.terminal_id} onChange={event => { initialized.current = true; setForm({ ...form, terminal_id: event.target.value }); }}
                placeholder="01000000-00000000-00000000" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={32} aria-describedby="terminal-help" required />
              <p className="starlink-hint" id="terminal-help">Find it in the Starlink app under <strong>Settings → Advanced → STARLINK</strong>.</p>
              {formError && <p className="auth-error" role="alert">{formError}</p>}
              {notice && <p className="starlink-notice" role="status">{notice}</p>}
              <div className="starlink-form-actions">
                <button type="submit" className="starlink-primary">{busy ? 'Saving…' : 'Save dish'}</button>
                {connection?.dish && <button type="button" className="starlink-secondary" onClick={() => openConfirm({
                  title: 'Remove linked dish?', msg: 'This removes the dish selection from your RESCOM account.',
                  confirmLabel: 'Remove dish', onConfirm: () => update(true)
                })}><Unlink2 size={15} /> Remove</button>}
              </div>
            </fieldset>
          </form>
        </section>

        <section className="starlink-panel starlink-monitor" aria-label="Starlink connection status">
          <div className="starlink-panel-top">
            <span className="starlink-panel-icon"><Activity size={20} /></span>
            <button type="button" className="starlink-refresh" onClick={refresh} disabled={checking || busy} aria-label="Refresh dish status" title="Refresh dish status"><RefreshCw size={17} /></button>
          </div>
          <h2>{connection?.dish?.name || 'Dish diagnostics'}</h2>
          <p className={`starlink-state starlink-state-${status.tone}`} role="status"><span />{status.label}</p>
          <p className="starlink-panel-description">{status.detail}</p>
          <div className="starlink-report-row"><Clock3 size={16} /><div><span>Last matching report</span><strong>{report ? reportTime.format(new Date(report.reported_at)) : 'Awaiting telemetry'}</strong></div></div>
          {status.tone === 'live' && <div className="starlink-report-row"><Radio size={16} /><div><span>Tracked alerts</span><strong>{report.alerts.length ? report.alerts.map(alert => alertLabels[alert]).join(', ') : 'None reported'}</strong></div></div>}
          <details className="starlink-help"><summary>How the relay connects</summary><p>Connect a laptop to the dish’s Starlink network and run the RESCOM relay. In the project ZIP, open <strong>STARLINK_SETUP.md</strong> for the probe and reporting commands.</p></details>
        </section>
      </div>
      <div className="starlink-guide">
        <section>
          <span className="starlink-panel-icon"><Wifi size={19} aria-hidden="true" /></span>
          <div>
            <h2>Get online in the field</h2>
            <p>Join an active Starlink network in your device’s Wi-Fi settings, then open RESCOM. The connection badge shows when RESCOM can reach its server.</p>
          </div>
        </section>
        <section>
          <span className="starlink-panel-icon"><WifiOff size={19} aria-hidden="true" /></span>
          <div>
            <h2>Keep working during an outage</h2>
            <p>After sign-in, RESCOM prepares this browser automatically. Use the regular forms when the connection drops. Pending saves sync as soon as RESCOM reconnects.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

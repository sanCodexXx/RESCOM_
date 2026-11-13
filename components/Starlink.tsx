'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Download, Radio, RefreshCw, SatelliteDish, Unplug, Wifi, WifiOff } from 'lucide-react';
import { request } from '../lib/api-client';
import type { Space } from '../lib/offline';
import { normalizeTerminal } from '../lib/starlink';
import { Button, ErrorBox, Field, Tag } from './ui';

type Dish = { name: string; terminalId: string };
type Diagnostics = {
  terminalId: string;
  hardware: string;
  firmware: string;
  checkedAt: string;
  alerts: string[];
  serviceCode: number;
  stowed: boolean;
};
const alertNames: Record<string, string> = {
  thermal_throttle: 'Thermal throttling',
  thermal_shutdown: 'Thermal shutdown',
  slow_ethernet: 'Slow Ethernet link',
  obstructed: 'Dish obstruction',
};
const serviceNames: Record<number, string> = {
  0: 'Unknown', 1: 'Enabled', 2: 'No active account', 3: 'Away from service address',
  4: 'In ocean', 6: 'Country restriction', 7: 'Data quota policy', 8: 'Service cell disabled',
  10: 'Roaming restriction', 11: 'Location unknown', 12: 'Account disabled',
  13: 'Unsupported firmware', 14: 'Movement restriction',
};

export default function Starlink({ online, workspace }: { online: boolean; workspace: Space }) {
  const [saved, setSaved] = useState<Dish | null>(null);
  const [name, setName] = useState('');
  const [terminal, setTerminal] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<Diagnostics | null>(null);
  const [profileError, setProfileError] = useState('');
  const [probeError, setProbeError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!online || loaded) return;
    let active = true;
    request<{ dish: Dish | null }>('starlink/connection', workspace).then(({ dish }) => {
      if (!active) return;
      setSaved(dish);
      if (dish && !touched) {
        setName(dish.name);
        setTerminal(dish.terminalId);
      }
      setLoaded(true);
      setProfileError('');
    }).catch(error => { if (active) setProfileError(error.message); });
    return () => { active = false; };
  }, [online, workspace, loaded, touched]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError('');
    setMessage('');
    setBusy(true);
    try {
      const { dish } = await request<{ dish: Dish }>('starlink/connection', workspace, 'PUT', { name, terminalId: terminal });
      setSaved(dish);
      setName(dish.name);
      setTerminal(dish.terminalId);
      setMessage('Dish profile saved.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Could not save the dish profile.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setProfileError('');
    setMessage('');
    try {
      await request('starlink/connection', workspace, 'DELETE');
      setSaved(null);
      setName('');
      setTerminal('');
      setMessage('Dish profile removed.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Could not remove the dish profile.');
    } finally {
      setBusy(false);
    }
  }

  async function probe() {
    setChecking(true);
    setProbeError('');
    setReport(null);
    try {
      let response: Response;
      try {
        response = await fetch('http://127.0.0.1:8765/diagnostics', { cache: 'no-store', signal: AbortSignal.timeout(6500) });
      } catch {
        throw new Error('The local relay could not be reached. Start it on this computer and allow local network access in your browser.');
      }
      const result = await response.json() as Diagnostics & { error?: string };
      if (!response.ok) throw new Error(result.error || 'The dish did not respond.');
      if (!normalizeTerminal(result.terminalId) || !Array.isArray(result.alerts)) throw new Error('The relay returned invalid diagnostics.');
      setReport(result);
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : 'The dish could not be checked.');
    } finally {
      setChecking(false);
    }
  }

  const originalOrigin = 'https://rescom-san-nicolas-hub.gaoatgresan1.chatgpt.site';
  const origin = typeof window === 'undefined' ? originalOrigin : window.location.origin;
  const matched = report && (!saved || report.terminalId === saved.terminalId);
  return (
    <div className="starlink-page">
      <section className="starlink-hero">
        <div className="starlink-hero-copy">
          <span className="starlink-hero-icon"><SatelliteDish size={25} /></span>
          <h2>Starlink terminal</h2>
          <p>Join Starlink Wi-Fi to use it for internet access. Check the dish from a computer running the local relay.</p>
          <Tag tone={online ? 'green' : 'orange'}>{online ? 'RESCOM online' : 'RESCOM offline'}</Tag>
        </div>
      </section>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="settings-panel-head"><span className="record-icon"><SatelliteDish size={21} /></span>
            <div><h2>Dish profile</h2><p>Save the terminal for your RESCOM account</p></div>
          </div>
          {profileError && <ErrorBox>{profileError}</ErrorBox>}
          <form onSubmit={save}>
            <Field label="Dish name" required>
              <input value={name} onChange={e => { setTouched(true); setName(e.target.value); }} required maxLength={80} placeholder="e.g. MDRRMO operations" />
            </Field>
            <Field label="Starlink Terminal ID" required hint="Find it in the Starlink app under Settings → Advanced → STARLINK.">
              <input value={terminal} onChange={e => { setTouched(true); setTerminal(e.target.value); }} required maxLength={40} placeholder="ut00000000-00000000-00000000" autoCapitalize="off" spellCheck={false} />
            </Field>
            <div className="starlink-actions">
              <Button busy={busy} disabled={!online} type="submit">Save dish</Button>
              {saved && <Button variant="secondary" disabled={!online || busy} type="button" onClick={remove}><Unplug size={16} /> Remove</Button>}
            </div>
          </form>
          {message && <p className="settings-note" role="status">{message}</p>}
          {!online && <p className="settings-note">Reconnect to save changes to your dish profile.</p>}
        </section>
        <section className="panel settings-panel">
          <div className="settings-panel-head"><span className="record-icon green"><Radio size={21} /></span>
            <div><h2>Dish diagnostics</h2><p>Starlink Local Device API</p></div>
          </div>
          {probeError && <ErrorBox>{probeError}</ErrorBox>}
          {report ? <>
            <Tag tone={matched ? 'green' : 'orange'}>{matched ? 'Dish responding' : 'Different terminal responding'}</Tag>
            <div className="detail-grid starlink-details">
              <div className="full"><span>Terminal ID</span><strong>{report.terminalId}</strong></div>
              <div><span>Hardware</span><strong>{report.hardware || 'Unavailable'}</strong></div>
              <div><span>Service</span><strong>{report.stowed ? 'Stowed' : serviceNames[report.serviceCode] || 'Unknown'}</strong></div>
              <div className="full"><span>Firmware</span><strong>{report.firmware || 'Unavailable'}</strong></div>
              <div className="full"><span>Tracked alerts</span><strong>{report.alerts.map(key => alertNames[key]).filter(Boolean).join(', ') || 'None reported'}</strong></div>
              <div className="full"><span>Checked</span><strong>{new Date(report.checkedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT</strong></div>
            </div>
          </> : <p className="settings-note">Start the relay, then check the dish to read its Terminal ID, firmware, and alerts.</p>}
          <div className="starlink-actions">
            <Button variant="secondary" busy={checking} onClick={probe}><RefreshCw size={16} /> Check dish</Button>
            {report && normalizeTerminal(terminal) !== report.terminalId && <button className="text-btn" onClick={() => {
              setTouched(true);
              setTerminal(report.terminalId);
            }}>Use this Terminal ID</button>}
          </div>
        </section>
      </div>
      <section className="panel settings-panel starlink-setup">
        <div className="settings-panel-head"><span className="record-icon">{online ? <Wifi size={21} /> : <WifiOff size={21} />}</span>
          <div><h2>Set up the local relay</h2><p>One computer on the Starlink network</p></div>
        </div>
        <ol>
          <li>Install Node.js 22 or newer, then connect the computer to Starlink Wi-Fi.</li>
          <li>Download and extract the relay. In its folder, run <code>npm ci</code> and <code>npm start</code>.</li>
          <li>Open this page in Chrome or Edge on that computer, choose <strong>Check dish</strong>, and allow local network access if prompted.</li>
        </ol>
        {origin !== originalOrigin && <p className="settings-note">For this address, set <code>RESCOM_APP_ORIGIN</code> to <code>{origin}</code> in the relay terminal before starting it.</p>}
        <a className="btn btn-secondary" href="/rescom-starlink-relay.zip" download><Download size={16} /> Download Starlink relay</a>
      </section>
    </div>
  );
}

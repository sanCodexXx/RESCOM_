import React, { useEffect, useState } from 'react';
import { Users, Building2, AlertTriangle, ShieldAlert, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from 'recharts';
import { PageHeader } from '../components/layout/Shell.jsx';
import { StatCard, ProgressBar } from '../components/ui/StatCard.jsx';
import Badge, { STATUS_PILL, SEV_PILL } from '../components/ui/Badge.jsx';
import WeatherCard from '../components/ui/WeatherCard.jsx';
import Button from '../components/ui/Button.jsx';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';

function occColor(pct) {
  if (pct >= 90) return '#F87171';
  if (pct >= 70) return '#FBBF24';
  if (pct >= 40) return '#60A5FA';
  return '#34D399';
}

const SEV_COLORS = { High: '#E5484D', Medium: '#C2670B', Low: '#94A3B8' };
const PRIORITY_COLORS = ['#D6336C', '#2563EB', '#127A45', '#C2670B', '#7C3AED', '#0891B2', '#DB2777'];

export default function Dashboard({ onNav }) {
  const { toast } = useUi();
  const [stats, setStats] = useState({ totalEvacuees: 0, totalPriorityCases: 0, currentlyPresent: 0 });
  const [centers, setCenters] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [evacuees, setEvacuees] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, c, i, e] = await Promise.all([
        api.get('/evacuees/stats'),
        api.get('/centers'),
        api.get('/incidents'),
        api.get('/evacuees')
      ]);
      setStats(s); setCenters(c); setIncidents(i); setEvacuees(e);
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const activeIncidents = incidents.filter(i => i.reporting_status !== 'Resolved').length;

  const occupancyChart = centers.map(c => ({
    name: c.center_name.length > 20 ? c.center_name.slice(0, 20) + '…' : c.center_name,
    Occupied: c.occupancy,
    Available: Math.max(0, c.capacity - c.occupancy)
  }));

  const severityCounts = ['High', 'Medium', 'Low'].map(sev => ({
    name: sev, value: incidents.filter(i => i.severity === sev).length
  })).filter(x => x.value > 0);

  const priorityCounts = {};
  evacuees.forEach(e => (e.priority_types || []).forEach(t => { priorityCounts[t] = (priorityCounts[t] || 0) + 1; }));
  const priorityChart = Object.entries(priorityCounts).map(([name, value]) => ({ name, value }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of evacuation status across San Nicolas"
       
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard icon={<AlertTriangle size={18} />} label="Active Incidents" value={activeIncidents} hint="View incidents →" tint="danger" onClick={() => onNav('incidents')} />
        <StatCard icon={<Users size={18} />} label="Evacuees Present" value={stats.currentlyPresent} hint="View evacuees →" tint="accent" onClick={() => onNav('evacuees')} />
        <StatCard icon={<Building2 size={18} />} label="Evacuation Centers" value={centers.length} hint="View centers →" tint="success" onClick={() => onNav('centers')} />
        <StatCard icon={<ShieldAlert size={18} />} label="Priority Cases" value={stats.totalPriorityCases} hint="View priority cases →" tint="pink" onClick={() => onNav('priority')} />
      </div>

      <WeatherCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="glass rounded-glass shadow-glass-sm p-5">
          <h3 className="font-bold text-[15px] text-navy-900 mb-3.5">Center Occupancy vs Capacity</h3>
          {occupancyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={occupancyChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e9f2" />
                <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: '#0B1A47AA' }} interval={0} angle={-18} textAnchor="end" height={64} />
                <YAxis tick={{ fontSize: 10.5, fill: '#0B1A47AA' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e1e8f5' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Occupied" stackId="a" fill="#2563EB" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Available" stackId="a" fill="#DCE6FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-navy-900/45 text-[12.5px] py-8 text-center">No centers yet.</p>}
        </div>

        <div className="glass rounded-glass shadow-glass-sm p-5">
          <h3 className="font-bold text-[15px] text-navy-900 mb-3.5">Incidents by Severity</h3>
          {severityCounts.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={severityCounts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {severityCounts.map((s, i) => <Cell key={i} fill={SEV_COLORS[s.name]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e1e8f5' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-navy-900/45 text-[12.5px] py-8 text-center">No incidents logged yet.</p>}
        </div>
      </div>

      {priorityChart.length > 0 && (
        <div className="glass rounded-glass shadow-glass-sm p-5 mb-4">
          <h3 className="font-bold text-[15px] text-navy-900 mb-3.5">Priority Cases by Type</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={priorityChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e9f2" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10.5, fill: '#0B1A47AA' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#0B1A47AA' }} width={110} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e1e8f5' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {priorityChart.map((_, i) => <Cell key={i} fill={PRIORITY_COLORS[i % PRIORITY_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="glass rounded-glass shadow-glass-sm p-5 flex-[1.3] min-w-0">
          <h3 className="font-bold text-[15px] text-navy-900 mb-3.5">Center Occupancy</h3>
          {loading && <p className="text-navy-900/45 text-[12.5px]">Loading…</p>}
          {centers.map(c => {
            const pct = c.capacity ? Math.round((c.occupancy / c.capacity) * 100) : 0;
            return (
              <div key={c.center_id} className="py-3 border-b border-navy-900/10 cursor-pointer" onClick={() => onNav('centers')}>
                <div className="flex justify-between items-center mb-1.5">
                  <b className="text-[12.5px] text-navy-900">{c.center_name}</b>
                  <span className="text-[11px] text-navy-900/45">{c.occupancy} / {c.capacity}</span>
                </div>
                <ProgressBar pct={pct} color={occColor(pct)} />
              </div>
            );
          })}
        </div>

        <div className="glass rounded-glass shadow-glass-sm p-5 flex-1 min-w-0">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-[15px] text-navy-900 m-0">Recent Incidents</h3>
            <a className="text-[12px] font-semibold cursor-pointer text-accent-400" onClick={() => onNav('incidents')}>View All</a>
          </div>
          {incidents.slice(0, 6).map(i => (
            <div key={i.incident_id} className="flex items-center justify-between py-3 border-b border-navy-900/10">
              <div className="min-w-0">
                <b className="text-[12.5px] block truncate text-navy-900">{i.disaster_name}</b>
                <span className="text-[11px] text-navy-900/45">{i.brgy} · {new Date(i.date_started).toLocaleDateString()}</span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Badge className={SEV_PILL[i.severity]}>{i.severity}</Badge>
                <Badge className={STATUS_PILL[i.reporting_status]}>{i.reporting_status}</Badge>
              </div>
            </div>
          ))}
          {!incidents.length && !loading && <p className="text-navy-900/45 text-[12.5px]">No incidents logged yet.</p>}
        </div>
      </div>
    </>
  );
}
import React, { useCallback, useEffect, useState } from 'react';

import {
  Users,
  Building2,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  ArrowUpRight,
  MapPin,
  Clock3,
  Activity,
  CheckCircle2,
  CircleAlert,
  CalendarDays,
} from 'lucide-react';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from 'recharts';

import { PageHeader } from '../components/layout/Shell.jsx';

import {
  StatCard,
  ProgressBar,
} from '../components/ui/StatCard.jsx';

import Badge, {
  STATUS_PILL,
  SEV_PILL,
} from '../components/ui/Badge.jsx';

import WeatherCard from '../components/ui/WeatherCard.jsx';

import Button from '../components/ui/Button.jsx';

import { api } from '../lib/api.js';

import { useUi } from '../context/UiContext.jsx';


/* =====================================================
   CONSTANTS
===================================================== */

const SEVERITY_COLORS = {
  High: '#EF4444',
  Medium: '#F59E0B',
  Low: '#64748B',
};

const PRIORITY_COLORS = [
  '#2563EB',
  '#16A36A',
  '#F59E0B',
  '#9333EA',
  '#0891B2',
  '#DB2777',
  '#64748B',
];

const CHART_GRID = '#E7EDF6';

const CHART_TEXT = '#71809F';


/* =====================================================
   HELPERS
===================================================== */

function getOccupancyColor(percentage) {
  if (percentage >= 100) return '#EF4444';
  if (percentage >= 90) return '#F97316';
  if (percentage >= 70) return '#F59E0B';
  if (percentage >= 40) return '#2563EB';

  return '#16A36A';
}


function getOccupancyStatus(percentage) {
  if (percentage >= 100) return 'Full';
  if (percentage >= 90) return 'Near Capacity';
  if (percentage >= 70) return 'High Occupancy';

  return 'Available';
}


function formatDate(value) {
  if (!value) return 'Date unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}


function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(
    Number(value) || 0
  );
}


function getCenterOccupancy(center) {
  const capacity = Math.max(
    0,
    Number(center.capacity) || 0
  );

  const occupancy = Math.max(
    0,
    Number(center.occupancy) || 0
  );

  const percentage = capacity > 0
    ? Math.round((occupancy / capacity) * 100)
    : 0;

  return {
    capacity,
    occupancy,
    percentage,
    available: Math.max(0, capacity - occupancy),
  };
}


/* =====================================================
   REUSABLE DASHBOARD SECTION
===================================================== */

function DashboardSection({
  title,
  description,
  action,
  children,
  className = '',
}) {
  return (
    <section
      className={`
        rescom-dashboard-section
        glass
        rounded-glass
        shadow-glass-sm
        min-w-0
        ${className}
      `}
    >
      <div className="flex items-start justify-between gap-3 p-5 pb-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-navy-900">
            {title}
          </h2>

          {description && (
            <p className="text-[12px] text-navy-900/50 mt-1">
              {description}
            </p>
          )}
        </div>

        {action}
      </div>

      <div className="px-5 pb-5">
        {children}
      </div>
    </section>
  );
}


/* =====================================================
   EMPTY STATE
===================================================== */

function EmptyState({
  icon,
  title,
  description,
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-12 h-12 rounded-2xl bg-accent-50 text-accent-600 flex items-center justify-center mb-3">
        {icon}
      </div>

      <h3 className="text-[13px] font-semibold text-navy-900">
        {title}
      </h3>

      <p className="text-[12px] text-navy-900/50 mt-1 max-w-[260px]">
        {description}
      </p>
    </div>
  );
}


/* =====================================================
   MAIN DASHBOARD
===================================================== */

export default function Dashboard({ onNav }) {
  const { toast } = useUi();

  const [stats, setStats] = useState({
    totalEvacuees: 0,
    totalPriorityCases: 0,
    currentlyPresent: 0,
  });

  const [centers, setCenters] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [evacuees, setEvacuees] = useState([]);

  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const navigate = useCallback(
    (page) => {
      if (typeof onNav === 'function') {
        onNav(page);
      }
    },
    [onNav]
  );


  /* =====================================================
     LOAD DASHBOARD DATA
  ===================================================== */

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [
        statsResponse,
        centersResponse,
        incidentsResponse,
        evacueesResponse,
      ] = await Promise.all([
        api.get('/evacuees/stats'),
        api.get('/centers'),
        api.get('/incidents'),
        api.get('/evacuees'),
      ]);

      setStats(statsResponse || {
        totalEvacuees: 0,
        totalPriorityCases: 0,
        currentlyPresent: 0,
      });

      setCenters(
        Array.isArray(centersResponse)
          ? centersResponse
          : []
      );

      setIncidents(
        Array.isArray(incidentsResponse)
          ? incidentsResponse
          : []
      );

      setEvacuees(
        Array.isArray(evacueesResponse)
          ? evacueesResponse
          : []
      );

      setLastUpdated(new Date());
    } catch (error) {
      toast(
        error?.message || 'Unable to load dashboard data.',
        'bad'
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);


  useEffect(() => {
    load();
  }, [load]);


  /* =====================================================
     COMPUTED STATISTICS
  ===================================================== */

  const activeIncidents = incidents.filter(
    (incident) => incident.reporting_status !== 'Resolved'
  );

  const resolvedIncidents = incidents.filter(
    (incident) => incident.reporting_status === 'Resolved'
  );

  const totalCapacity = centers.reduce(
    (total, center) =>
      total + Math.max(0, Number(center.capacity) || 0),
    0
  );

  const totalOccupancy = centers.reduce(
    (total, center) =>
      total + Math.max(0, Number(center.occupancy) || 0),
    0
  );

  const availableCapacity = Math.max(
    0,
    totalCapacity - totalOccupancy
  );

  const overallOccupancy = totalCapacity > 0
    ? Math.round((totalOccupancy / totalCapacity) * 100)
    : 0;


  /* =====================================================
     CHART DATA
  ===================================================== */

  const occupancyChart = centers.map((center) => {
    const occupancy = getCenterOccupancy(center);

    const name = center.center_name || 'Unnamed Center';

    return {
      name: name.length > 19
        ? `${name.slice(0, 19)}…`
        : name,

      Occupied: occupancy.occupancy,
      Available: occupancy.available,
    };
  });


  const severityCounts = ['High', 'Medium', 'Low']
    .map((severity) => ({
      name: severity,

      value: incidents.filter(
        (incident) => incident.severity === severity
      ).length,
    }))
    .filter((item) => item.value > 0);


  const priorityCounts = {};

  evacuees.forEach((evacuee) => {
    const types = Array.isArray(evacuee.priority_types)
      ? evacuee.priority_types
      : [];

    types.forEach((type) => {
      priorityCounts[type] =
        (priorityCounts[type] || 0) + 1;
    });
  });


  const priorityChart = Object.entries(priorityCounts)
    .map(([name, value]) => ({
      name,
      value,
    }))
    .sort((a, b) => b.value - a.value);


  /* =====================================================
     RECENT INCIDENTS
  ===================================================== */

  const recentIncidents = [...incidents]
    .sort((a, b) => {
      const dateA = new Date(a.date_started || 0).getTime();
      const dateB = new Date(b.date_started || 0).getTime();

      return dateB - dateA;
    })
    .slice(0, 5);


  /* =====================================================
     HEADER
  ===================================================== */

  return (
    <div className="rescom-dashboard space-y-5">

      <PageHeader
        title="Disaster Response Dashboard"
        subtitle="Monitor evacuation operations and disaster incidents across San Nicolas, Ilocos Norte."
      />


      {/* =================================================
          DASHBOARD TOOLBAR
      ================================================= */}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

        <div className="flex items-center gap-2 text-[12px] text-navy-900/50">
          <CalendarDays size={15} />

          <span>
            {new Date().toLocaleDateString('en-PH', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Manila',
            })}
          </span>
        </div>

        <div className="flex items-center gap-3">

          {lastUpdated && (
            <span className="text-[11px] text-navy-900/45">
              Updated {lastUpdated.toLocaleTimeString('en-PH', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Manila',
              })}
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            aria-label="Refresh dashboard"
          >
            <RefreshCw
              size={14}
              className={loading ? 'animate-spin' : ''}
            />

            Refresh
          </Button>

        </div>
      </div>


      {/* =================================================
          KEY STATISTICS
      ================================================= */}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        <StatCard
          icon={<AlertTriangle size={19} />}
          label="Active Incidents"
          value={loading ? '—' : formatNumber(activeIncidents.length)}
          hint="View reported incidents"
          tint="danger"
          onClick={() => navigate('incidents')}
        />

        <StatCard
          icon={<Users size={19} />}
          label="Evacuees Present"
          value={loading ? '—' : formatNumber(stats.currentlyPresent)}
          hint="View registered evacuees"
          tint="accent"
          onClick={() => navigate('evacuees')}
        />

        <StatCard
          icon={<Building2 size={19} />}
          label="Evacuation Centers"
          value={loading ? '—' : formatNumber(centers.length)}
          hint="View evacuation centers"
          tint="success"
          onClick={() => navigate('centers')}
        />

        <StatCard
          icon={<ShieldAlert size={19} />}
          label="Priority Cases"
          value={loading ? '—' : formatNumber(stats.totalPriorityCases)}
          hint="Review assistance requirements"
          tint="pink"
          onClick={() => navigate('priority')}
        />

      </div>


      {/* =================================================
          WEATHER
      ================================================= */}

      <WeatherCard />


      {/* =================================================
          CAPACITY OVERVIEW
      ================================================= */}

      <section className="glass rounded-glass shadow-glass-sm p-5">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">

          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center">
                <Building2 size={18} />
              </div>

              <h2 className="text-[15px] font-bold text-navy-900">
                Evacuation Capacity Overview
              </h2>
            </div>

            <p className="text-[12px] text-navy-900/50 mt-2">
              Current occupancy across registered evacuation centers.
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('centers')}
          >
            Manage Centers

            <ArrowUpRight size={14} />
          </Button>

        </div>


        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">

          <div className="rounded-xl border border-navy-900/8 bg-white p-4">
            <p className="text-[11px] font-medium text-navy-900/50">
              Total Capacity
            </p>

            <p className="text-[25px] font-bold text-navy-900 mt-1">
              {loading ? '—' : formatNumber(totalCapacity)}
            </p>

            <p className="text-[11px] text-navy-900/45 mt-1">
              Registered spaces
            </p>
          </div>


          <div className="rounded-xl border border-navy-900/8 bg-white p-4">
            <p className="text-[11px] font-medium text-navy-900/50">
              Current Occupancy
            </p>

            <p className="text-[25px] font-bold text-navy-900 mt-1">
              {loading ? '—' : formatNumber(totalOccupancy)}
            </p>

            <p className="text-[11px] text-navy-900/45 mt-1">
              People recorded in centers
            </p>
          </div>


          <div className="rounded-xl border border-navy-900/8 bg-white p-4">
            <p className="text-[11px] font-medium text-navy-900/50">
              Available Spaces
            </p>

            <p className="text-[25px] font-bold text-success mt-1">
              {loading ? '—' : formatNumber(availableCapacity)}
            </p>

            <p className="text-[11px] text-navy-900/45 mt-1">
              Based on recorded capacity
            </p>
          </div>

        </div>


        <div className="flex items-center justify-between gap-3 mb-2">

          <span className="text-[12px] font-semibold text-navy-900">
            Overall occupancy
          </span>

          <span className="text-[12px] font-bold text-navy-900">
            {loading ? '—' : `${overallOccupancy}%`}
          </span>

        </div>

        <ProgressBar
          pct={overallOccupancy}
          color={getOccupancyColor(overallOccupancy)}
          label="Overall evacuation center occupancy"
        />

        <p className="text-[11px] text-navy-900/45 mt-2">
          Calculated from the registered center capacities and occupancy values.
        </p>

      </section>


      {/* =================================================
          CHARTS
      ================================================= */}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* CENTER OCCUPANCY CHART */}

        <DashboardSection
          title="Center Occupancy vs. Capacity"
          description="Compare recorded occupants with available spaces."
          action={
            <div className="w-8 h-8 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center">
              <Activity size={16} />
            </div>
          }
        >

          {loading ? (
            <div className="py-12 text-center text-[12px] text-navy-900/45">
              Loading occupancy data...
            </div>
          ) : occupancyChart.length > 0 ? (

            <ResponsiveContainer width="100%" height={270}>
              <BarChart
                data={occupancyChart}
                margin={{
                  top: 10,
                  right: 8,
                  left: -15,
                  bottom: 5,
                }}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={CHART_GRID}
                />

                <XAxis
                  dataKey="name"
                  tick={{
                    fontSize: 10,
                    fill: CHART_TEXT,
                  }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={65}
                />

                <YAxis
                  tick={{
                    fontSize: 10,
                    fill: CHART_TEXT,
                  }}
                  allowDecimals={false}
                />

                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    fontSize: 12,
                    border: '1px solid #E1E8F2',
                    boxShadow: '0 8px 24px rgba(16,35,79,0.08)',
                  }}
                />

                <Legend
                  wrapperStyle={{
                    fontSize: 11,
                    paddingTop: 8,
                  }}
                />

                <Bar
                  dataKey="Occupied"
                  name="Occupied"
                  stackId="capacity"
                  fill="#2563EB"
                  maxBarSize={44}
                />

                <Bar
                  dataKey="Available"
                  name="Available"
                  stackId="capacity"
                  fill="#DCE7F8"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={44}
                />

              </BarChart>
            </ResponsiveContainer>

          ) : (

            <EmptyState
              icon={<Building2 size={21} />}
              title="No evacuation centers"
              description="Registered evacuation centers will appear here."
            />

          )}

        </DashboardSection>


        {/* INCIDENT SEVERITY CHART */}

        <DashboardSection
          title="Incidents by Severity"
          description="Distribution of recorded incidents by severity level."
          action={
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center">
              <CircleAlert size={16} />
            </div>
          }
        >

          {loading ? (
            <div className="py-12 text-center text-[12px] text-navy-900/45">
              Loading incident data...
            </div>
          ) : severityCounts.length > 0 ? (

            <ResponsiveContainer width="100%" height={270}>
              <PieChart>

                <Pie
                  data={severityCounts}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={94}
                  paddingAngle={4}
                  stroke="none"
                >

                  {severityCounts.map((item) => (
                    <Cell
                      key={item.name}
                      fill={SEVERITY_COLORS[item.name] || '#94A3B8'}
                    />
                  ))}

                </Pie>

                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    fontSize: 12,
                    border: '1px solid #E1E8F2',
                    boxShadow: '0 8px 24px rgba(16,35,79,0.08)',
                  }}
                />

                <Legend
                  verticalAlign="bottom"
                  wrapperStyle={{
                    fontSize: 11,
                    paddingTop: 8,
                  }}
                />

              </PieChart>
            </ResponsiveContainer>

          ) : (

            <EmptyState
              icon={<AlertTriangle size={21} />}
              title="No incidents recorded"
              description="Incident severity information will appear when incidents are registered."
            />

          )}

        </DashboardSection>

      </div>


      {/* =================================================
          PRIORITY CASE CHART
      ================================================= */}

      <DashboardSection
        title="Priority Cases by Type"
        description="Recorded priority categories among registered evacuees."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('priority')}
          >
            View Cases

            <ArrowUpRight size={14} />
          </Button>
        }
      >

        {loading ? (

          <div className="py-12 text-center text-[12px] text-navy-900/45">
            Loading priority data...
          </div>

        ) : priorityChart.length > 0 ? (

          <ResponsiveContainer
            width="100%"
            height={Math.max(200, priorityChart.length * 48)}
          >

            <BarChart
              data={priorityChart}
              layout="vertical"
              margin={{
                top: 5,
                right: 20,
                left: 10,
                bottom: 5,
              }}
            >

              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke={CHART_GRID}
              />

              <XAxis
                type="number"
                allowDecimals={false}
                tick={{
                  fontSize: 10,
                  fill: CHART_TEXT,
                }}
              />

              <YAxis
                type="category"
                dataKey="name"
                tick={{
                  fontSize: 11,
                  fill: CHART_TEXT,
                }}
                width={125}
              />

              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  fontSize: 12,
                  border: '1px solid #E1E8F2',
                  boxShadow: '0 8px 24px rgba(16,35,79,0.08)',
                }}
              />

              <Bar
                dataKey="value"
                name="Recorded evacuees"
                radius={[0, 5, 5, 0]}
                maxBarSize={26}
              >

                {priorityChart.map((item, index) => (
                  <Cell
                    key={item.name}
                    fill={
                      PRIORITY_COLORS[
                        index % PRIORITY_COLORS.length
                      ]
                    }
                  />
                ))}

              </Bar>

            </BarChart>

          </ResponsiveContainer>

        ) : (

          <EmptyState
            icon={<ShieldAlert size={21} />}
            title="No priority categories"
            description="Priority category data will appear when it is recorded for evacuees."
          />

        )}

      </DashboardSection>


      {/* =================================================
          BOTTOM SECTION
      ================================================= */}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* EVACUATION CENTER STATUS */}

        <DashboardSection
          title="Evacuation Center Status"
          description="Review occupancy and remaining capacity."
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('centers')}
            >
              View All

              <ArrowUpRight size={14} />
            </Button>
          }
        >

          {loading ? (

            <div className="py-8 text-center text-[12px] text-navy-900/45">
              Loading centers...
            </div>

          ) : centers.length > 0 ? (

            <div className="space-y-5">

              {centers.slice(0, 6).map((center) => {
                const occupancy = getCenterOccupancy(center);

                const status = getOccupancyStatus(
                  occupancy.percentage
                );

                return (

                  <button
                    key={center.center_id}
                    type="button"
                    onClick={() => navigate('centers')}
                    className="
                      w-full
                      text-left
                      group
                      rounded-xl
                      border
                      border-navy-900/8
                      bg-white
                      p-4
                      hover:border-accent-500/30
                      hover:bg-accent-50/30
                      transition
                    "
                  >

                    <div className="flex items-start justify-between gap-3 mb-3">

                      <div className="flex items-start gap-3 min-w-0">

                        <div className="w-10 h-10 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center shrink-0">
                          <Building2 size={18} />
                        </div>

                        <div className="min-w-0">

                          <h3 className="text-[12.5px] font-bold text-navy-900 truncate">
                            {center.center_name || 'Unnamed Center'}
                          </h3>

                          <p className="text-[11px] text-navy-900/45 mt-1 flex items-center gap-1">
                            <MapPin size={11} />

                            {center.brgy || center.barangay || 'Location not specified'}
                          </p>

                        </div>

                      </div>

                      <span
                        className={`
                          text-[10px]
                          font-semibold
                          px-2
                          py-1
                          rounded-full
                          shrink-0
                          ${
                            occupancy.percentage >= 90
                              ? 'bg-red-50 text-red-600'
                              : occupancy.percentage >= 70
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700'
                          }
                        `}
                      >
                        {status}
                      </span>

                    </div>


                    <div className="flex justify-between items-center text-[11px] mb-2">

                      <span className="text-navy-900/55">
                        Occupancy
                      </span>

                      <span className="font-semibold text-navy-900">
                        {formatNumber(occupancy.occupancy)}
                        {' / '}
                        {formatNumber(occupancy.capacity)}
                        {' '}
                        ({occupancy.percentage}%)
                      </span>

                    </div>


                    <ProgressBar
                      pct={occupancy.percentage}
                      color={getOccupancyColor(occupancy.percentage)}
                      label={`${center.center_name || 'Center'} occupancy`}
                    />


                    <div className="flex justify-between mt-2">

                      <span className="text-[10px] text-navy-900/45">
                        Available spaces
                      </span>

                      <span className="text-[11px] font-semibold text-navy-900">
                        {formatNumber(occupancy.available)}
                      </span>

                    </div>

                  </button>

                );
              })}

            </div>

          ) : (

            <EmptyState
              icon={<Building2 size={21} />}
              title="No centers available"
              description="Add an evacuation center to begin monitoring capacity."
            />

          )}

        </DashboardSection>


        {/* RECENT INCIDENTS */}

        <DashboardSection
          title="Recent Disaster Incidents"
          description="Latest recorded disaster incidents."
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('incidents')}
            >
              View All

              <ArrowUpRight size={14} />
            </Button>
          }
        >

          {loading ? (

            <div className="py-8 text-center text-[12px] text-navy-900/45">
              Loading incidents...
            </div>

          ) : recentIncidents.length > 0 ? (

            <div className="divide-y divide-navy-900/8">

              {recentIncidents.map((incident) => {

                const severityClass =
                  SEV_PILL[incident.severity] ||
                  'bg-navy-900/8 text-navy-900/55';

                const statusClass =
                  STATUS_PILL[incident.reporting_status] ||
                  'bg-navy-900/8 text-navy-900/55';

                return (

                  <button
                    key={incident.incident_id}
                    type="button"
                    onClick={() => navigate('incidents')}
                    className="
                      w-full
                      flex
                      items-start
                      gap-3
                      py-4
                      text-left
                      rounded-lg
                      hover:bg-accent-50/50
                      transition
                    "
                  >

                    <div
                      className={`
                        w-10
                        h-10
                        rounded-xl
                        flex
                        items-center
                        justify-center
                        shrink-0
                        ${
                          incident.severity === 'High'
                            ? 'bg-red-50 text-red-600'
                            : incident.severity === 'Medium'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-slate-100 text-slate-600'
                        }
                      `}
                    >
                      <AlertTriangle size={17} />
                    </div>


                    <div className="flex-1 min-w-0">

                      <h3 className="text-[12.5px] font-semibold text-navy-900 truncate">
                        {incident.disaster_name || 'Unnamed Incident'}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">

                        <span className="text-[11px] text-navy-900/50 flex items-center gap-1">
                          <MapPin size={11} />

                          {incident.brgy || 'Location unavailable'}
                        </span>

                        <span className="text-[11px] text-navy-900/45 flex items-center gap-1">
                          <Clock3 size={11} />

                          {formatDate(incident.date_started)}
                        </span>

                      </div>


                      <div className="flex flex-wrap gap-1.5 mt-2">

                        <Badge className={severityClass}>
                          {incident.severity || 'Unspecified'}
                        </Badge>

                        <Badge className={statusClass}>
                          {incident.reporting_status || 'Unknown'}
                        </Badge>

                      </div>

                    </div>


                    <ArrowUpRight
                      size={15}
                      className="text-navy-900/30 group-hover:text-accent-600 shrink-0"
                    />

                  </button>

                );
              })}

            </div>

          ) : (

            <EmptyState
              icon={<CheckCircle2 size={21} />}
              title="No incidents recorded"
              description="Newly reported incidents will appear in this section."
            />

          )}

        </DashboardSection>

      </div>


      {/* =================================================
          FOOTER SUMMARY
      ================================================= */}

      {!loading && (

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1 pb-2">

          <div className="flex items-center gap-2 text-[11px] text-navy-900/45">

            <span className="w-2 h-2 rounded-full bg-emerald-500" />

            Dashboard data loaded successfully.

          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-navy-900/45">

            <span>
              Total incidents: {formatNumber(incidents.length)}
            </span>

            <span>
              Resolved: {formatNumber(resolvedIncidents.length)}
            </span>

            <span>
              Centers: {formatNumber(centers.length)}
            </span>

          </div>

        </div>

      )}

    </div>
  );
}
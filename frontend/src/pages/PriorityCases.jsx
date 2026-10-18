import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Search,
  Users,
  HeartPulse,
  CheckCircle2,
  Clock3,
  Trash2,
  Check,
  RefreshCw,
  MapPin,
  UserRound,
  Filter,
  ShieldAlert,
} from 'lucide-react';

import { PageHeader } from '../components/layout/Shell.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import { getSocket } from '../lib/socket.js';

const STATUS_OPTIONS = ['All Statuses', 'Flagged', 'Attended', 'Resolved'];

const statusStyles = {
  Flagged: 'bg-rose-50 text-rose-700 border border-rose-100',
  Attended: 'bg-amber-50 text-amber-700 border border-amber-100',
  Resolved: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
};

function getStatusClass(status) {
  return (
    STATUS_PILL?.[status] ||
    statusStyles[status] ||
    'bg-slate-100 text-slate-600 border border-slate-200'
  );
}

function StatCard({ title, value, description, icon: Icon, iconClass }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h3 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {value}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>

        <div className={`rounded-xl p-3 ${iconClass}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters, onReset }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
      <div className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-400">
        <ShieldAlert size={32} />
      </div>

      <h3 className="text-base font-semibold text-slate-800">
        {hasFilters ? 'No matching priority cases' : 'No priority cases yet'}
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {hasFilters
          ? 'Try changing your search or filters to find the case you need.'
          : 'Priority cases flagged from the Evacuees page will appear here for monitoring and follow-up.'}
      </p>

      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

export default function PriorityCases() {
  const { toast, openConfirm } = useUi();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [caseTypeFilter, setCaseTypeFilter] = useState('All Case Types');

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);

    try {
      const result = await api.get('/priority-cases');
      setCases(Array.isArray(result) ? result : []);
    } catch (error) {
      toast(error.message || 'Failed to load priority cases.', 'bad');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const socket = getSocket();

    const handlePriorityUpdate = () => {
      load(false);
    };

    socket.on('priority_case_flagged', handlePriorityUpdate);

    return () => {
      socket.off('priority_case_flagged', handlePriorityUpdate);
    };
  }, []);

  const caseTypes = useMemo(() => {
    const types = cases
      .map((item) => item.case_type)
      .filter(Boolean);

    return ['All Case Types', ...new Set(types)].sort((a, b) => {
      if (a === 'All Case Types') return -1;
      if (b === 'All Case Types') return 1;
      return a.localeCompare(b);
    });
  }, [cases]);

  const stats = useMemo(() => {
    const flagged = cases.filter(
      (item) => item.priority_status === 'Flagged'
    ).length;

    const attended = cases.filter(
      (item) => item.priority_status === 'Attended'
    ).length;

    const resolved = cases.filter(
      (item) => item.priority_status === 'Resolved'
    ).length;

    return {
      total: cases.length,
      flagged,
      attended,
      resolved,
    };
  }, [cases]);

  const filteredCases = useMemo(() => {
    const term = search.trim().toLowerCase();

    return cases.filter((item) => {
      const fullName = `${item.first_name || ''} ${item.last_name || ''}`
        .trim()
        .toLowerCase();

      const matchesSearch =
        !term ||
        fullName.includes(term) ||
        (item.family_name || '').toLowerCase().includes(term) ||
        (item.barangay || '').toLowerCase().includes(term) ||
        (item.case_type || '').toLowerCase().includes(term) ||
        (item.description || '').toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === 'All Statuses' ||
        item.priority_status === statusFilter;

      const matchesType =
        caseTypeFilter === 'All Case Types' ||
        item.case_type === caseTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [cases, search, statusFilter, caseTypeFilter]);

  function resetFilters() {
    setSearch('');
    setStatusFilter('All Statuses');
    setCaseTypeFilter('All Case Types');
  }

  async function setStatus(priorityCase, status) {
    try {
      await api.patch(
        `/priority-cases/${priorityCase.priority_id}/status`,
        { priority_status: status }
      );

      toast('Priority case status updated successfully.', 'ok');
      await load(false);
    } catch (error) {
      toast(error.message || 'Unable to update priority case status.', 'bad');
    }
  }

  function remove(priorityCase) {
    const fullName =
      `${priorityCase.first_name || ''} ${priorityCase.last_name || ''}`.trim();

    openConfirm({
      title: 'Remove priority flag?',
      msg: `The priority flag for <b>${fullName || 'this evacuee'}</b> will be removed.`,
      onConfirm: async () => {
        try {
          await api.del(`/priority-cases/${priorityCase.priority_id}`);

          toast('Priority flag removed.', 'ok');
          await load(false);
        } catch (error) {
          toast(error.message || 'Unable to remove priority flag.', 'bad');
        }
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Priority Cases"
        subtitle="Monitor vulnerable evacuees and coordinate special assistance."
      />

      <div className="space-y-6">
        {/* Summary cards */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Priority Cases"
            value={stats.total}
            description="All registered priority cases"
            icon={Users}
            iconClass="bg-blue-50 text-blue-600"
          />

          <StatCard
            title="Needs Attention"
            value={stats.flagged}
            description="Cases awaiting assistance"
            icon={AlertTriangle}
            iconClass="bg-rose-50 text-rose-600"
          />

          <StatCard
            title="Being Attended"
            value={stats.attended}
            description="Cases receiving assistance"
            icon={Clock3}
            iconClass="bg-amber-50 text-amber-600"
          />

          <StatCard
            title="Resolved Cases"
            value={stats.resolved}
            description="Cases marked as resolved"
            icon={CheckCircle2}
            iconClass="bg-emerald-50 text-emerald-600"
          />
        </section>

        {/* Overview and refresh */}
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-50 p-3 text-rose-600">
              <HeartPulse size={23} />
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Vulnerable Evacuees
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Review priority classifications, monitor assistance progress,
                and update each case as support is provided.
              </p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => load()}
            disabled={loading}
          >
            <RefreshCw
              size={15}
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </Button>
        </section>

        {/* Filters */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Filter size={17} className="text-slate-500" />

            <h2 className="text-sm font-semibold text-slate-800">
              Search and Filter
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative xl:col-span-2">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, family, barangay..."
                aria-label="Search priority cases"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by status"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <select
              value={caseTypeFilter}
              onChange={(event) => setCaseTypeFilter(event.target.value)}
              aria-label="Filter by case type"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {caseTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Showing{' '}
              <span className="font-semibold text-slate-800">
                {filteredCases.length}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-800">
                {cases.length}
              </span>{' '}
              priority cases
            </p>

            {(search ||
              statusFilter !== 'All Statuses' ||
              caseTypeFilter !== 'All Case Types') && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-semibold text-blue-600 transition hover:text-blue-800"
              >
                Reset filters
              </button>
            )}
          </div>
        </section>

        {/* Case list */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Priority Case Records
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Manage the status of flagged evacuees.
              </p>
            </div>

            <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {filteredCases.length} records
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 px-5 py-16 text-sm text-slate-500">
              <RefreshCw size={18} className="animate-spin" />
              Loading priority cases...
            </div>
          ) : filteredCases.length === 0 ? (
            <EmptyState
              hasFilters={
                Boolean(search) ||
                statusFilter !== 'All Statuses' ||
                caseTypeFilter !== 'All Case Types'
              }
              onReset={resetFilters}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Evacuee
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Priority Type
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Location
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Description
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredCases.map((item) => (
                      <tr
                        key={item.priority_id}
                        className="transition hover:bg-slate-50/70"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                              <UserRound size={19} />
                            </div>

                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                {item.first_name} {item.last_name}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {item.family_name || 'No family name'}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                            {item.case_type || 'Unspecified'}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            <MapPin size={14} className="shrink-0 text-slate-400" />
                            {item.barangay || 'Not specified'}
                          </div>
                        </td>

                        <td className="max-w-xs px-5 py-4">
                          <p className="line-clamp-2 text-sm leading-5 text-slate-500">
                            {item.description || 'No additional description.'}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <Badge className={getStatusClass(item.priority_status)}>
                            {item.priority_status}
                          </Badge>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {item.priority_status !== 'Resolved' && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  setStatus(
                                    item,
                                    item.priority_status === 'Flagged'
                                      ? 'Attended'
                                      : 'Resolved'
                                  )
                                }
                              >
                                <Check size={14} />

                                {item.priority_status === 'Flagged'
                                  ? 'Attend'
                                  : 'Resolve'}
                              </Button>
                            )}

                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              onClick={() => remove(item)}
                              aria-label={`Remove priority flag for ${item.first_name} ${item.last_name}`}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile and tablet cards */}
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:hidden">
                {filteredCases.map((item) => (
                  <article
                    key={item.priority_id}
                    className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                          <UserRound size={19} />
                        </div>

                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-slate-900">
                            {item.first_name} {item.last_name}
                          </h3>

                          <p className="mt-1 truncate text-xs text-slate-500">
                            {item.family_name || 'No family name'}
                          </p>
                        </div>
                      </div>

                      <Badge className={getStatusClass(item.priority_status)}>
                        {item.priority_status}
                      </Badge>
                    </div>

                    <div className="mt-4">
                      <span className="inline-flex rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                        {item.case_type || 'Unspecified'}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <MapPin size={14} className="shrink-0" />
                      {item.barangay || 'Not specified'}
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {item.description || 'No additional description.'}
                    </p>

                    <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
                      {item.priority_status !== 'Resolved' && (
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1"
                          onClick={() =>
                            setStatus(
                              item,
                              item.priority_status === 'Flagged'
                                ? 'Attended'
                                : 'Resolved'
                            )
                          }
                        >
                          <Check size={14} />

                          {item.priority_status === 'Flagged'
                            ? 'Mark Attended'
                            : 'Mark Resolved'}
                        </Button>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => remove(item)}
                        aria-label={`Remove priority flag for ${item.first_name} ${item.last_name}`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Information note */}
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0 text-blue-600"
          />

          <div>
            <p className="text-sm font-semibold text-blue-900">
              Priority case workflow
            </p>

            <p className="mt-1 text-xs leading-5 text-blue-800/80">
              Flagged cases can be marked as attended, then marked as resolved
              once assistance is complete. Removing a priority flag removes the
              flag record; use this action carefully.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
import React, { useEffect, useRef, useState } from 'react';

import {
  Plus,
  LogOut,
  Search,
  Edit2,
  Trash2,
  Users,
  ShieldAlert,
  UserCheck,
  RefreshCw,
  X,
  Filter,
  ChevronDown,
  MapPin,
  Building2,
  UserRound,
  ClipboardList,
} from 'lucide-react';

import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';

import {
  Field,
  Ctrl,
  TextInput,
  Select,
  RadioGroup,
} from '../components/ui/Field.jsx';

import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import { getSocket } from '../lib/socket.js';

import {
  BARANGAYS,
  normalizePhPhone,
  stripPhoneChars,
} from '../lib/barangays.js';

import {
  peekSeed,
  clearSeed,
} from '../lib/searchSeed.js';


/* =====================================================
   CONSTANTS
===================================================== */

const PRIORITY_TYPES = [
  'Elderly',
  'PWD',
  'Pregnant',
  'Infant',
  'Lactating Mother',
  'With Illness',
  'Solo Parent',
];

const STATUS_OPTIONS = [
  'All Statuses',
  'Present',
  'Checked out',
];

const INITIAL_FORM = {
  family_name: '',
  barangay: '',
  contact_number: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  age: '',
  gender: '',
  center_id: '',
  incident_id: '',
  priority_types: [],
};


/* =====================================================
   HELPERS
===================================================== */

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(
    Number(value) || 0
  );
}


function getInitials(firstName = '', lastName = '') {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`
    .toUpperCase() || 'EV';
}


function getStatusClass(status) {
  return (
    STATUS_PILL[status] ||
    'bg-slate-100 text-slate-600'
  );
}


function validateEvacuee(form, { full = true } = {}) {
  const errors = {};

  if (!form.first_name.trim()) {
    errors.first_name = 'First name is required.';
  }

  if (!form.last_name.trim()) {
    errors.last_name = 'Last name is required.';
  }

  const age = Number(form.age);

  if (
    form.age === '' ||
    form.age == null ||
    !Number.isInteger(age) ||
    age < 0 ||
    age > 120
  ) {
    errors.age = 'Enter a whole number between 0 and 120.';
  }

  if (!['Male', 'Female'].includes(form.gender)) {
    errors.gender = 'Select Male or Female.';
  }

  if (full) {
    if (!form.family_name.trim()) {
      errors.family_name = 'Family name is required.';
    }

    if (!BARANGAYS.includes(form.barangay)) {
      errors.barangay = 'Select a barangay.';
    }

    if (!normalizePhPhone(form.contact_number)) {
      errors.contact_number =
        'Enter a valid Philippine mobile number.';
    }

    if (!form.center_id) {
      errors.center_id = 'Select an evacuation center.';
    }

    if (!form.incident_id) {
      errors.incident_id = 'Select a disaster incident.';
    }
  }

  return errors;
}


/* =====================================================
   SUMMARY CARD
===================================================== */

function SummaryCard({
  icon,
  title,
  value,
  description,
  tone = 'blue',
}) {
  const tones = {
    blue: {
      icon: 'bg-blue-50 text-blue-600',
      accent: 'bg-blue-500',
    },

    green: {
      icon: 'bg-emerald-50 text-emerald-600',
      accent: 'bg-emerald-500',
    },

    pink: {
      icon: 'bg-pink-50 text-pink-600',
      accent: 'bg-pink-500',
    },

    amber: {
      icon: 'bg-amber-50 text-amber-600',
      accent: 'bg-amber-500',
    },
  };

  const style = tones[tone] || tones.blue;

  return (
    <div className="
      rescom-evacuee-summary
      glass
      rounded-glass
      shadow-glass-sm
      p-5
      relative
      overflow-hidden
      min-w-0
    ">
      <div className="flex items-start justify-between gap-3">

        <div className="min-w-0">

          <p className="text-[12px] font-semibold text-navy-900/55">
            {title}
          </p>

          <p className="text-[28px] font-bold tracking-tight text-navy-900 mt-2 leading-tight">
            {value}
          </p>

          <p className="text-[11px] text-navy-900/45 mt-2">
            {description}
          </p>

        </div>

        <div className={`
          w-11
          h-11
          rounded-xl
          flex
          items-center
          justify-center
          shrink-0
          ${style.icon}
        `}>
          {icon}
        </div>

      </div>

      <div className={`
        absolute
        bottom-0
        left-0
        right-0
        h-[3px]
        ${style.accent}
        opacity-70
      `} />

    </div>
  );
}


/* =====================================================
   EMPTY STATE
===================================================== */

function EmptyState({
  hasSearch,
  onClear,
  onRegister,
}) {
  return (
    <div className="
      flex
      flex-col
      items-center
      justify-center
      text-center
      py-14
      px-5
    ">

      <div className="
        w-16
        h-16
        rounded-2xl
        bg-blue-50
        text-blue-600
        flex
        items-center
        justify-center
        mb-4
      ">
        {hasSearch ? (
          <Search size={27} />
        ) : (
          <Users size={27} />
        )}
      </div>

      <h3 className="text-[15px] font-bold text-navy-900">
        {hasSearch
          ? 'No matching evacuees'
          : 'No evacuees registered'}
      </h3>

      <p className="text-[12px] text-navy-900/50 mt-2 max-w-[310px] leading-relaxed">
        {hasSearch
          ? 'Try changing your search term or filters to find the records you need.'
          : 'Registered evacuees will appear here when their records are added to the system.'}
      </p>

      <div className="flex flex-wrap justify-center gap-2 mt-5">

        {hasSearch && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
          >
            <X size={14} />
            Clear Filters
          </Button>
        )}

        {!hasSearch && (
          <Button
            size="sm"
            onClick={onRegister}
          >
            <Plus size={14} />
            Register Evacuee
          </Button>
        )}

      </div>

    </div>
  );
}


/* =====================================================
   MAIN PAGE
===================================================== */

export default function Evacuees() {
  const {
    toast,
    openModal,
    closeModal,
    openConfirm,
  } = useUi();

  const [evacuees, setEvacuees] = useState([]);
  const [centers, setCenters] = useState([]);
  const [incidents, setIncidents] = useState([]);

  const [q, setQ] = useState(
    () => peekSeed('evacuees') || ''
  );

  const [statusFilter, setStatusFilter] = useState(
    'All Statuses'
  );

  const [priorityFilter, setPriorityFilter] = useState(false);

  const [loading, setLoading] = useState(true);


  /* ===================================================
     LOAD DATA
  =================================================== */

  async function load() {
    setLoading(true);

    try {
      const [
        evacueeResponse,
        centerResponse,
        incidentResponse,
      ] = await Promise.all([
        api.get('/evacuees'),
        api.get('/centers'),
        api.get('/incidents'),
      ]);

      setEvacuees(
        Array.isArray(evacueeResponse)
          ? evacueeResponse
          : []
      );

      setCenters(
        Array.isArray(centerResponse)
          ? centerResponse
          : []
      );

      setIncidents(
        Array.isArray(incidentResponse)
          ? incidentResponse
          : []
      );
    } catch (error) {
      toast(
        error?.message || 'Unable to load evacuee records.',
        'bad'
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    clearSeed();

    load();

    const socket = getSocket();

    const handler = () => {
      load();
    };

    socket.on('evacuee_registered', handler);
    socket.on('center_updated', handler);

    return () => {
      socket.off('evacuee_registered', handler);
      socket.off('center_updated', handler);
    };
  }, []);


  /* ===================================================
     FILTERING
  =================================================== */

  const filtered = evacuees.filter((evacuee) => {
    const searchText = [
      evacuee.first_name,
      evacuee.middle_name,
      evacuee.last_name,
      evacuee.family_name,
      evacuee.barangay,
      evacuee.center_name,
      evacuee.contact_number,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const matchesSearch = searchText.includes(
      q.trim().toLowerCase()
    );

    const matchesStatus =
      statusFilter === 'All Statuses' ||
      evacuee.record_status === statusFilter;

    const matchesPriority =
      !priorityFilter ||
      (Array.isArray(evacuee.priority_types) &&
        evacuee.priority_types.length > 0);

    return (
      matchesSearch &&
      matchesStatus &&
      matchesPriority
    );
  });


  /* ===================================================
     SUMMARY STATISTICS
  =================================================== */

  const presentCount = evacuees.filter(
    (evacuee) => evacuee.record_status === 'Present'
  ).length;

  const checkedOutCount = evacuees.filter(
    (evacuee) => evacuee.record_status === 'Checked out'
  ).length;

  const priorityCount = evacuees.filter(
    (evacuee) =>
      Array.isArray(evacuee.priority_types) &&
      evacuee.priority_types.length > 0
  ).length;


  /* ===================================================
     CHECK OUT
  =================================================== */

  function checkout(evacuee) {
    openConfirm({
      title: 'Check out evacuee?',

      msg: `
        <b>${evacuee.first_name} ${evacuee.last_name}</b>
        will be marked as checked out.
        The center headcount will decrease.
      `,

      onConfirm: async () => {
        try {
          await api.patch(
            `/evacuees/${evacuee.evacuee_id}/checkout`
          );

          toast('Evacuee checked out successfully.', 'ok');

          await load();
        } catch (error) {
          toast(
            error?.message || 'Unable to check out evacuee.',
            'bad'
          );
        }
      },
    });
  }


  /* ===================================================
     EDIT EVACUEE
  =================================================== */

  function editModal(evacuee) {
    let form = {
      first_name: evacuee.first_name || '',
      middle_name: evacuee.middle_name || '',
      last_name: evacuee.last_name || '',
      age: evacuee.age ?? '',
      gender: evacuee.gender || '',
    };

    const controller = {};

    openModal({
      title: 'Edit Evacuee',

      sub: `Update the personal information for ${evacuee.first_name} ${evacuee.last_name}.`,

      body: (
        <EditForm
          initial={form}
          ctl={controller}
          onChange={(next) => {
            form = next;
          }}
        />
      ),

      footer: (
        <>
          <Button
            variant="ghost"
            block
            onClick={closeModal}
          >
            Cancel
          </Button>

          <Button
            block
            onClick={async () => {
              const errors = validateEvacuee(
                form,
                { full: false }
              );

              if (Object.keys(errors).length) {
                controller.setErrors?.(errors);

                toast(
                  'Please correct the required fields.',
                  'bad'
                );

                return;
              }

              try {
                await api.put(
                  `/evacuees/${evacuee.evacuee_id}`,
                  {
                    ...form,
                    age: parseInt(form.age, 10),
                  }
                );

                closeModal();

                toast('Evacuee updated successfully.', 'ok');

                await load();
              } catch (error) {
                toast(
                  error?.message || 'Unable to update evacuee.',
                  'bad'
                );
              }
            }}
          >
            Save Changes
          </Button>
        </>
      ),
    });
  }


  /* ===================================================
     DELETE EVACUEE
  =================================================== */

  function removeEvacuee(evacuee) {
    openConfirm({
      title: 'Delete evacuee record?',

      msg: `
        <b>${evacuee.first_name} ${evacuee.last_name}</b>
        and their evacuation history will be permanently removed.
        This action cannot be undone.
      `,

      onConfirm: async () => {
        try {
          await api.del(
            `/evacuees/${evacuee.evacuee_id}`
          );

          toast('Evacuee record deleted.', 'bad');

          await load();
        } catch (error) {
          toast(
            error?.message || 'Unable to delete evacuee.',
            'bad'
          );
        }
      },
    });
  }


  /* ===================================================
     REGISTER EVACUEE
  =================================================== */

  function registerModal() {
    const openIncidents = incidents.filter(
      (incident) =>
        incident.reporting_status !== 'Resolved'
    );

    if (!centers.length) {
      toast(
        'Add an evacuation center before registering evacuees.',
        'bad'
      );

      return;
    }

    if (!openIncidents.length) {
      toast(
        'Log a disaster incident first. Every evacuee must be linked to one.',
        'bad'
      );

      return;
    }

    const availableCenter =
      centers.find(
        (center) =>
          Number(center.capacity) -
            Number(center.occupancy) >
          0
      ) || centers[0];

    let form = {
      ...INITIAL_FORM,

      center_id: availableCenter.center_id,

      incident_id: openIncidents[0].incident_id,

      priority_types: [],
    };

    const controller = {};

    openModal({
      title: 'Register Evacuee',

      sub: 'Register an evacuee and link the record to a family, evacuation center, and disaster incident.',

      body: (
        <RegisterForm
          initial={form}
          ctl={controller}
          centers={centers}
          incidents={openIncidents}
          onChange={(next) => {
            form = next;
          }}
        />
      ),

      footer: (
        <>
          <Button
            variant="ghost"
            block
            onClick={closeModal}
          >
            Cancel
          </Button>

          <Button
            block
            onClick={async () => {
              const errors = validateEvacuee(form);

              if (Object.keys(errors).length) {
                controller.setErrors?.(errors);

                toast(
                  'Please complete all required fields.',
                  'bad'
                );

                return;
              }

              try {
                await api.post('/evacuees/register', {
                  family: {
                    family_name: form.family_name.trim(),

                    barangay: form.barangay,

                    contact_number: normalizePhPhone(
                      form.contact_number
                    ),
                  },

                  evacuee: {
                    first_name: form.first_name.trim(),

                    middle_name: form.middle_name.trim(),

                    last_name: form.last_name.trim(),

                    age: parseInt(form.age, 10),

                    gender: form.gender,
                  },

                  center_id: form.center_id,

                  incident_id: form.incident_id,

                  priority_types: form.priority_types,
                });

                closeModal();

                toast('Evacuee registered successfully.', 'ok');

                await load();
              } catch (error) {
                toast(
                  error?.message || 'Unable to register evacuee.',
                  'bad'
                );
              }
            }}
          >
            <Plus size={14} />
            Register Evacuee
          </Button>
        </>
      ),
    });
  }


  /* ===================================================
     CLEAR FILTERS
  =================================================== */

  function clearFilters() {
    setQ('');
    setStatusFilter('All Statuses');
    setPriorityFilter(false);
  }


  /* ===================================================
     RENDER
  =================================================== */

  return (
    <div className="rescom-evacuees space-y-5">

      {/* PAGE HEADER */}

      <PageHeader
        title="Evacuees"
        subtitle="Manage evacuee registrations, household information, evacuation assignments, and priority assistance."
        actions={
          <Button onClick={registerModal}>
            <Plus size={15} />
            Register Evacuee
          </Button>
        }
      />


      {/* SUMMARY CARDS */}

      <div className="
        grid
        grid-cols-1
        sm:grid-cols-2
        xl:grid-cols-4
        gap-4
      ">

        <SummaryCard
          icon={<Users size={21} />}
          title="Registered Evacuees"
          value={loading ? '—' : formatNumber(evacuees.length)}
          description="All recorded evacuees"
          tone="blue"
        />

        <SummaryCard
          icon={<UserCheck size={21} />}
          title="Currently Present"
          value={loading ? '—' : formatNumber(presentCount)}
          description="Records marked present"
          tone="green"
        />

        <SummaryCard
          icon={<ShieldAlert size={21} />}
          title="Priority Categories"
          value={loading ? '—' : formatNumber(priorityCount)}
          description="Evacuees with priority tags"
          tone="pink"
        />

        <SummaryCard
          icon={<LogOut size={21} />}
          title="Checked Out"
          value={loading ? '—' : formatNumber(checkedOutCount)}
          description="Records marked checked out"
          tone="amber"
        />

      </div>


      {/* MAIN TABLE PANEL */}

      <section className="
        glass
        rounded-glass
        shadow-glass-sm
        overflow-hidden
      ">

        {/* PANEL HEADER */}

        <div className="
          flex
          flex-col
          sm:flex-row
          sm:items-center
          sm:justify-between
          gap-3
          p-5
          border-b
          border-navy-900/8
        ">

          <div className="flex items-start gap-3">

            <div className="
              w-10
              h-10
              rounded-xl
              bg-blue-50
              text-blue-600
              flex
              items-center
              justify-center
              shrink-0
            ">
              <ClipboardList size={19} />
            </div>

            <div>

              <h2 className="text-[15px] font-bold text-navy-900">
                Evacuee Registry
              </h2>

              <p className="text-[12px] text-navy-900/50 mt-1">
                Search, review, and manage registered evacuees.
              </p>

            </div>

          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw
              size={14}
              className={loading ? 'animate-spin' : ''}
            />

            Refresh
          </Button>

        </div>


        {/* SEARCH AND FILTER TOOLBAR */}

        <div className="
          flex
          flex-col
          lg:flex-row
          lg:items-center
          gap-3
          p-5
          border-b
          border-navy-900/8
        ">

          {/* SEARCH */}

          <div className="
            flex
            items-center
            gap-2
            bg-white
            border
            border-navy-900/15
            rounded-xl
            px-3
            py-2.5
            flex-1
            min-w-0
            lg:max-w-[420px]
            focus-within:border-blue-400
            focus-within:ring-2
            focus-within:ring-blue-100
            transition
          ">

            <Search
              size={16}
              className="text-navy-900/40 shrink-0"
            />

            <input
              type="search"
              className="
                border-0
                outline-none
                bg-transparent
                text-[12.5px]
                text-navy-900
                flex-1
                min-w-0
                placeholder:text-navy-900/35
              "
              placeholder="Search name, family, barangay, or center..."
              value={q}
              onChange={(event) => setQ(event.target.value)}
              aria-label="Search evacuees"
            />

            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="text-navy-900/40 hover:text-navy-900"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}

          </div>


          {/* STATUS FILTER */}

          <div className="
            flex
            items-center
            gap-2
            bg-white
            border
            border-navy-900/15
            rounded-xl
            px-3
            py-2.5
            min-w-0
            sm:min-w-[175px]
          ">

            <Filter
              size={15}
              className="text-navy-900/40 shrink-0"
            />

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              className="
                border-0
                outline-none
                bg-transparent
                text-[12px]
                text-navy-900
                w-full
                min-w-0
              "
              aria-label="Filter by evacuation status"
            >

              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}

            </select>

            <ChevronDown
              size={14}
              className="text-navy-900/35 shrink-0"
            />

          </div>


          {/* PRIORITY FILTER */}

          <button
            type="button"
            onClick={() => setPriorityFilter((value) => !value)}
            aria-pressed={priorityFilter}
            className={`
              inline-flex
              items-center
              justify-center
              gap-2
              rounded-xl
              px-3
              py-2.5
              text-[12px]
              font-semibold
              border
              transition
              ${
                priorityFilter
                  ? 'bg-pink-50 border-pink-200 text-pink-700'
                  : 'bg-white border-navy-900/15 text-navy-900/65 hover:bg-slate-50'
              }
            `}
          >
            <ShieldAlert size={15} />

            Priority Only
          </button>

          {(q || statusFilter !== 'All Statuses' || priorityFilter) && (
            <button
              type="button"
              onClick={clearFilters}
              className="
                text-[12px]
                font-semibold
                text-blue-600
                hover:text-blue-800
                whitespace-nowrap
              "
            >
              Clear Filters
            </button>
          )}

        </div>


        {/* TABLE SUMMARY */}

        <div className="
          flex
          flex-col
          sm:flex-row
          sm:items-center
          sm:justify-between
          gap-2
          px-5
          py-3
          bg-slate-50/70
          border-b
          border-navy-900/8
        ">

          <div className="text-[12px] text-navy-900/55">

            Showing{' '}

            <span className="font-bold text-navy-900">
              {loading ? '—' : formatNumber(filtered.length)}
            </span>

            {' '}of{' '}

            <span className="font-bold text-navy-900">
              {loading ? '—' : formatNumber(evacuees.length)}
            </span>

            {' '}records

          </div>

          <div className="flex items-center gap-2 text-[11px] text-navy-900/45">

            <span className="w-2 h-2 rounded-full bg-emerald-500" />

            Live registry

          </div>

        </div>


        {/* TABLE */}

        <div className="overflow-x-auto scroll-thin">

          <table className="w-full min-w-[950px] border-collapse">

            <thead>

              <tr>

                {[
                  'Evacuee',
                  'Age / Sex',
                  'Family',
                  'Barangay',
                  'Evacuation Center',
                  'Priority',
                  'Status',
                  'Actions',
                ].map((heading) => (

                  <th
                    key={heading}
                    className="
                      text-left
                      text-[10px]
                      uppercase
                      tracking-[0.06em]
                      text-navy-900/45
                      font-bold
                      px-4
                      py-3.5
                      whitespace-nowrap
                    "
                  >
                    {heading}
                  </th>

                ))}

              </tr>

            </thead>


            <tbody>

              {!loading && filtered.map((evacuee) => (

                <tr
                  key={evacuee.evacuee_id}
                  className="
                    border-b
                    border-navy-900/6
                    hover:bg-blue-50/40
                    transition-colors
                  "
                >

                  {/* NAME */}

                  <td className="px-4 py-4">

                    <div className="flex items-center gap-3">

                      <div className="
                        w-9
                        h-9
                        rounded-full
                        bg-blue-50
                        text-blue-700
                        flex
                        items-center
                        justify-center
                        text-[11px]
                        font-bold
                        shrink-0
                      ">
                        {getInitials(
                          evacuee.first_name || '',
                          evacuee.last_name || ''
                        )}
                      </div>

                      <div className="min-w-0">

                        <p className="text-[12.5px] font-bold text-navy-900">
                          {evacuee.first_name} {evacuee.last_name}
                        </p>

                        {evacuee.middle_name && (
                          <p className="text-[10.5px] text-navy-900/45 mt-0.5">
                            {evacuee.middle_name}
                          </p>
                        )}

                      </div>

                    </div>

                  </td>


                  {/* AGE / SEX */}

                  <td className="px-4 py-4">

                    <span className="text-[12px] text-navy-900/70">
                      {evacuee.age ?? '—'}
                    </span>

                    <span className="text-navy-900/25 mx-1.5">
                      /
                    </span>

                    <span className="text-[12px] text-navy-900/55">
                      {evacuee.gender || '—'}
                    </span>

                  </td>


                  {/* FAMILY */}

                  <td className="px-4 py-4">

                    <div className="flex items-center gap-2">

                      <Users
                        size={14}
                        className="text-navy-900/35 shrink-0"
                      />

                      <span className="text-[12px] text-navy-900/70">
                        {evacuee.family_name || '—'}
                      </span>

                    </div>

                  </td>


                  {/* BARANGAY */}

                  <td className="px-4 py-4">

                    <div className="flex items-center gap-2">

                      <MapPin
                        size={13}
                        className="text-navy-900/35 shrink-0"
                      />

                      <span className="text-[12px] text-navy-900/65">
                        {evacuee.barangay || '—'}
                      </span>

                    </div>

                  </td>


                  {/* CENTER */}

                  <td className="px-4 py-4">

                    <div className="flex items-center gap-2">

                      <Building2
                        size={14}
                        className="text-blue-500 shrink-0"
                      />

                      <span className="text-[12px] text-navy-900/70 max-w-[180px] truncate">
                        {evacuee.center_name || '—'}
                      </span>

                    </div>

                  </td>


                  {/* PRIORITY */}

                  <td className="px-4 py-4">

                    <div className="flex flex-wrap gap-1.5 max-w-[190px]">

                      {(evacuee.priority_types || []).map((type) => (

                        <Badge
                          key={type}
                          className="bg-pink-50 text-pink-700 border-pink-100"
                        >
                          {type}
                        </Badge>

                      ))}

                      {!evacuee.priority_types?.length && (

                        <span className="text-[11px] text-navy-900/30">
                          None
                        </span>

                      )}

                    </div>

                  </td>


                  {/* STATUS */}

                  <td className="px-4 py-4">

                    <Badge className={getStatusClass(evacuee.record_status)}>
                      <span className={`
                        w-1.5
                        h-1.5
                        rounded-full
                        ${
                          evacuee.record_status === 'Present'
                            ? 'bg-emerald-500'
                            : 'bg-slate-400'
                        }
                      `} />

                      {evacuee.record_status || 'No record'}

                    </Badge>

                  </td>


                  {/* ACTIONS */}

                  <td className="px-4 py-4">

                    <div className="flex items-center gap-1">

                      {evacuee.record_status === 'Present' && (

                        <button
                          type="button"
                          onClick={() => checkout(evacuee)}
                          title="Check out evacuee"
                          aria-label={`Check out ${evacuee.first_name} ${evacuee.last_name}`}
                          className="
                            w-8
                            h-8
                            rounded-lg
                            flex
                            items-center
                            justify-center
                            text-navy-900/45
                            hover:bg-blue-50
                            hover:text-blue-600
                            transition
                          "
                        >
                          <LogOut size={15} />
                        </button>

                      )}

                      <button
                        type="button"
                        onClick={() => editModal(evacuee)}
                        title="Edit evacuee"
                        aria-label={`Edit ${evacuee.first_name} ${evacuee.last_name}`}
                        className="
                          w-8
                          h-8
                          rounded-lg
                          flex
                          items-center
                          justify-center
                          text-navy-900/45
                          hover:bg-blue-50
                          hover:text-blue-600
                          transition
                        "
                      >
                        <Edit2 size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => removeEvacuee(evacuee)}
                        title="Delete evacuee"
                        aria-label={`Delete ${evacuee.first_name} ${evacuee.last_name}`}
                        className="
                          w-8
                          h-8
                          rounded-lg
                          flex
                          items-center
                          justify-center
                          text-navy-900/45
                          hover:bg-red-50
                          hover:text-red-600
                          transition
                        "
                      >
                        <Trash2 size={14} />
                      </button>

                    </div>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>


        {/* LOADING STATE */}

        {loading && (

          <div className="flex flex-col items-center justify-center py-14">

            <RefreshCw
              size={23}
              className="animate-spin text-blue-600 mb-3"
            />

            <p className="text-[12px] font-medium text-navy-900/60">
              Loading evacuee records...
            </p>

          </div>

        )}


        {/* EMPTY STATE */}

        {!loading && filtered.length === 0 && (

          <EmptyState
            hasSearch={
              Boolean(q) ||
              statusFilter !== 'All Statuses' ||
              priorityFilter
            }
            onClear={clearFilters}
            onRegister={registerModal}
          />

        )}


        {/* TABLE FOOTER */}

        {!loading && filtered.length > 0 && (

          <div className="
            flex
            flex-col
            sm:flex-row
            sm:items-center
            sm:justify-between
            gap-2
            px-5
            py-4
            border-t
            border-navy-900/8
            bg-slate-50/50
          ">

            <p className="text-[11px] text-navy-900/45">
              Showing {formatNumber(filtered.length)} matching records.
            </p>

            <p className="text-[11px] text-navy-900/45">
              Evacuation records are updated from the system registry.
            </p>

          </div>

        )}

      </section>

    </div>
  );
}


/* =====================================================
   SHARED FORM STATE
===================================================== */

function useFormState(initial, controller) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    controller.setErrors = setErrors;

    return () => {
      delete controller.setErrors;
    };
  }, [controller]);

  return {
    form,
    setForm,
    errors,
    setErrors,
  };
}


/* =====================================================
   PERSONAL INFORMATION FORM
===================================================== */

function NameAgeGender({
  form,
  set,
  errors,
}) {
  return (
    <div className="space-y-1">

      <div className="
        flex
        items-center
        gap-2
        mb-3
        text-[12px]
        font-bold
        text-navy-900
      ">
        <UserRound size={15} className="text-blue-600" />

        Personal Information
      </div>


      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3">

        <Field
          label="First Name"
          required
          error={errors.first_name}
        >
          <Ctrl error={errors.first_name}>
            <TextInput
              value={form.first_name}
              onChange={(event) =>
                set('first_name', event.target.value)
              }
              autoComplete="off"
            />
          </Ctrl>
        </Field>


        <Field label="Middle Name">
          <Ctrl>
            <TextInput
              value={form.middle_name}
              onChange={(event) =>
                set('middle_name', event.target.value)
              }
              autoComplete="off"
              placeholder="Optional"
            />
          </Ctrl>
        </Field>


        <Field
          label="Last Name"
          required
          error={errors.last_name}
        >
          <Ctrl error={errors.last_name}>
            <TextInput
              value={form.last_name}
              onChange={(event) =>
                set('last_name', event.target.value)
              }
              autoComplete="off"
            />
          </Ctrl>
        </Field>

      </div>


      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">

        <Field
          label="Age"
          required
          error={errors.age}
        >
          <Ctrl error={errors.age}>
            <TextInput
              type="number"
              inputMode="numeric"
              min="0"
              max="120"
              value={form.age}
              onChange={(event) =>
                set('age', event.target.value)
              }
            />
          </Ctrl>
        </Field>


        <Field
          label="Gender"
          required
          error={errors.gender}
        >
          <RadioGroup
            name="gender"
            value={form.gender}
            onChange={(value) => set('gender', value)}
            options={['Male', 'Female']}
            error={errors.gender}
          />
        </Field>

      </div>

    </div>
  );
}


/* =====================================================
   EDIT FORM
===================================================== */

function EditForm({
  initial,
  ctl,
  onChange,
}) {
  const {
    form,
    setForm,
    errors,
    setErrors,
  } = useFormState(initial, ctl);

  const set = (key, value) => {
    const next = {
      ...form,
      [key]: value,
    };

    setForm(next);
    onChange(next);

    if (errors[key]) {
      setErrors((previous) => {
        const nextErrors = { ...previous };

        delete nextErrors[key];

        return nextErrors;
      });
    }
  };

  return (
    <div className="space-y-3">

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 mb-4">

        <p className="text-[11px] text-blue-800 leading-relaxed">
          Update the evacuee's personal information.
          Family and evacuation assignment information will remain unchanged.
        </p>

      </div>

      <NameAgeGender
        form={form}
        set={set}
        errors={errors}
      />

    </div>
  );
}


/* =====================================================
   REGISTER FORM
===================================================== */

function RegisterForm({
  initial,
  ctl,
  centers,
  incidents,
  onChange,
}) {
  const {
    form,
    setForm,
    errors,
    setErrors,
  } = useFormState(initial, ctl);

  const autoFamily = useRef('');


  const set = (key, value) => {
    let next = {
      ...form,
      [key]: value,
    };

    if (
      key === 'last_name' &&
      (
        form.family_name === '' ||
        form.family_name === autoFamily.current
      )
    ) {
      autoFamily.current = value.trim()
        ? `${value.trim()} Family`
        : '';

      next.family_name = autoFamily.current;
    }

    setForm(next);
    onChange(next);

    if (errors[key]) {
      setErrors((previous) => {
        const nextErrors = { ...previous };

        delete nextErrors[key];

        return nextErrors;
      });
    }
  };


  function togglePriority(type) {
    const selected = form.priority_types.includes(type)
      ? form.priority_types.filter(
          (item) => item !== type
        )
      : [...form.priority_types, type];

    set('priority_types', selected);
  }


  return (
    <div className="space-y-3">

      {/* PERSONAL INFORMATION */}

      <NameAgeGender
        form={form}
        set={set}
        errors={errors}
      />


      {/* HOUSEHOLD INFORMATION */}

      <div className="
        flex
        items-center
        gap-2
        pt-4
        mb-2
        text-[12px]
        font-bold
        text-navy-900
        border-t
        border-navy-900/8
      ">
        <Users size={15} className="text-blue-600" />

        Household Information
      </div>


      <Field
        label="Family Name"
        required
        error={errors.family_name}
      >
        <Ctrl error={errors.family_name}>
          <TextInput
            value={form.family_name}
            onChange={(event) =>
              set('family_name', event.target.value)
            }
            placeholder="e.g. Santos Family"
            autoComplete="off"
          />
        </Ctrl>
      </Field>


      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">

        <Field
          label="Barangay of Origin"
          required
          error={errors.barangay}
        >
          <Ctrl error={errors.barangay}>
            <Select
              value={form.barangay}
              onChange={(event) =>
                set('barangay', event.target.value)
              }
            >
              <option value="">
                Select barangay...
              </option>

              {BARANGAYS.map((barangay) => (
                <option
                  key={barangay}
                  value={barangay}
                >
                  {barangay}
                </option>
              ))}

            </Select>
          </Ctrl>
        </Field>


        <Field
          label="Contact Number"
          required
          error={errors.contact_number}
        >
          <Ctrl error={errors.contact_number}>
            <TextInput
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={17}
              placeholder="+63 9XX XXX XXXX"
              value={form.contact_number}
              onChange={(event) =>
                set(
                  'contact_number',
                  stripPhoneChars(event.target.value)
                )
              }
            />
          </Ctrl>
        </Field>

      </div>


      {/* EVACUATION INFORMATION */}

      <div className="
        flex
        items-center
        gap-2
        pt-4
        mb-2
        text-[12px]
        font-bold
        text-navy-900
        border-t
        border-navy-900/8
      ">
        <Building2 size={15} className="text-blue-600" />

        Evacuation Information
      </div>


      <Field
        label="Evacuation Center"
        required
        error={errors.center_id}
      >
        <Ctrl error={errors.center_id}>
          <Select
            value={form.center_id}
            onChange={(event) =>
              set('center_id', event.target.value)
            }
          >
            <option value="">
              Select evacuation center...
            </option>

            {centers.map((center) => {
              const capacity = Number(center.capacity) || 0;
              const occupancy = Number(center.occupancy) || 0;
              const remaining = capacity - occupancy;

              return (
                <option
                  key={center.center_id}
                  value={center.center_id}
                  disabled={remaining <= 0}
                >
                  {center.center_name}
                  {' — '}
                  {remaining > 0
                    ? `${remaining} spaces available`
                    : 'Full'}
                </option>
              );
            })}

          </Select>
        </Ctrl>
      </Field>


      <Field
        label="Related Disaster Incident"
        required
        error={errors.incident_id}
      >
        <Ctrl error={errors.incident_id}>
          <Select
            value={form.incident_id}
            onChange={(event) =>
              set('incident_id', event.target.value)
            }
          >
            <option value="">
              Select disaster incident...
            </option>

            {incidents.map((incident) => (
              <option
                key={incident.incident_id}
                value={incident.incident_id}
              >
                {incident.disaster_name}
              </option>
            ))}

          </Select>
        </Ctrl>
      </Field>


      {/* PRIORITY INFORMATION */}

      <div className="
        flex
        items-center
        gap-2
        pt-4
        mb-2
        text-[12px]
        font-bold
        text-navy-900
        border-t
        border-navy-900/8
      ">
        <ShieldAlert size={15} className="text-pink-600" />

        Priority and Assistance Information
      </div>


      <Field label="Priority Categories (optional)">

        <p className="text-[11px] text-navy-900/45 mb-3">
          Select all categories that apply to the evacuee.
        </p>

        <div className="flex flex-wrap gap-2">

          {PRIORITY_TYPES.map((type) => {
            const selected =
              form.priority_types.includes(type);

            return (
              <button
                key={type}
                type="button"
                aria-pressed={selected}
                onClick={() => togglePriority(type)}
                className={`
                  text-[12px]
                  rounded-lg
                  px-3
                  py-2
                  border
                  transition
                  ${
                    selected
                      ? 'bg-pink-600 border-pink-600 text-white font-semibold'
                      : 'bg-white border-navy-900/12 text-navy-900/65 hover:border-pink-300 hover:bg-pink-50'
                  }
                `}
              >
                {type}
              </button>
            );
          })}

        </div>

      </Field>

    </div>
  );
}
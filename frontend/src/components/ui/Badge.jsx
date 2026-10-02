import React from 'react';

export default function Badge({ className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-navy-900/8 whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

export const STATUS_PILL = {
  Open: 'bg-success-bg text-success',
  Full: 'bg-danger-bg text-danger',
  Standby: 'bg-navy-900/8 text-navy-900/55',
  Closed: 'bg-navy-900/8 text-navy-900/55',
  Present: 'bg-success-bg text-success',
  'Checked out': 'bg-navy-900/8 text-navy-900/55',
  Pending: 'bg-warn-bg text-warn',
  'En Route': 'bg-accent-50 text-accent-700',
  Active: 'bg-accent-50 text-accent-700',
  Resolved: 'bg-success-bg text-success',
  Flagged: 'bg-pink-bg text-pink',
  Attended: 'bg-warn-bg text-warn',
  Draft: 'bg-navy-900/8 text-navy-900/55',
  Finalized: 'bg-success-bg text-success',
  ADMIN_STAFF: 'bg-accent-50 text-accent-700',
  FIELD_PERSONNEL: 'bg-pink-bg text-pink'
};

export const SEV_PILL = {
  High: 'bg-danger-bg text-danger',
  Medium: 'bg-warn-bg text-warn',
  Low: 'bg-navy-900/8 text-navy-900/55'
};

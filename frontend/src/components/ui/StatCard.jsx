import React from 'react';

export function StatCard({
  icon,
  label,
  value,
  hint,
  tint = 'accent',
  onClick
}) {
  const tints = {
    accent: 'bg-accent-50 text-accent-700',
    danger: 'bg-danger-bg text-danger',
    warn: 'bg-warn-bg text-warn',
    success: 'bg-success-bg text-success',
    pink: 'bg-pink-bg text-pink'
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick();
        }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className="
        rescom-stat-card
        glass
        rounded-glass
        shadow-glass-sm
        p-[18px]
        flex
        gap-3
        items-start
        transition
        hover:-translate-y-0.5
        hover:bg-accent-50
      "
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div
        className={`
          w-[42px]
          h-[42px]
          rounded-xl
          grid
          place-items-center
          shrink-0
          ${tints[tint] || tints.accent}
        `}
        aria-hidden="true"
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-navy-900/60">
          {label}
        </div>

        <div className="text-[25px] font-bold leading-tight text-navy-900">
          {value}
        </div>

        {hint && (
          <div className="text-[11.5px] text-navy-900/45 mt-1">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProgressBar({
  pct = 0,
  color = '#2563EB',
  label = 'Progress'
}) {
  const percentage = Math.max(
    0,
    Math.min(100, Number(pct) || 0)
  );

  return (
    <div
      className="
        rescom-progress-track
        h-2
        rounded-full
        bg-navy-900/10
        overflow-hidden
      "
      role="progressbar"
      aria-label={label}
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${percentage}%`,
          background: color
        }}
      />
    </div>
  );
}
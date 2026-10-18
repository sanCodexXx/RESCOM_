import React from 'react';

const VARIANTS = {
  primary:
    'bg-accent-600 hover:bg-accent-700 border border-transparent text-white shadow-glass-sm',

  dark:
    'bg-navy-900 hover:bg-navy-800 border border-white/10 text-white shadow-glass-sm',

  ghost:
    'bg-white hover:bg-accent-50 border border-navy-900/15 text-navy-900/80',

  danger:
    'bg-danger hover:brightness-110 border border-transparent text-white',

  subtle:
    'bg-transparent hover:bg-navy-900/6 border border-transparent text-navy-900/70'
};

const SIZES = {
  md: 'px-4 py-2.5 text-[13px]',
  sm: 'px-3 py-2 text-[12px]'
};

export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  children,
  type = 'button',
  ...props
}) {
  const variantClass = VARIANTS[variant] || VARIANTS.primary;
  const sizeClass = SIZES[size] || SIZES.md;

  return (
    <button
      type={type}
      className={`
        rescom-button
        inline-flex
        items-center
        justify-center
        gap-2
        rounded-xl
        font-semibold
        transition
        active:translate-y-px
        disabled:opacity-40
        disabled:cursor-not-allowed
        focus-visible:outline
        focus-visible:outline-2
        focus-visible:outline-offset-2
        focus-visible:outline-blue-500
        ${variantClass}
        ${sizeClass}
        ${block ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
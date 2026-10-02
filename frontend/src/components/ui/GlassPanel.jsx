import React from 'react';

const VARIANTS = {
  default: 'glass',
  strong: 'glass-strong',
  dark: 'glass-dark'
};

export default function GlassPanel({ variant = 'default', className = '', children, ...props }) {
  return (
    <div className={`${VARIANTS[variant]} rounded-glass shadow-glass ${className}`} {...props}>
      {children}
    </div>
  );
}

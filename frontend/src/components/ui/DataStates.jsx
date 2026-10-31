import React from 'react';
import { Inbox, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button.jsx';

export function EmptyState({ title = 'No records yet', message = 'New records will appear here.', action, onAction }) {
  return <div className="data-empty" role="status">
    <span className="data-empty-icon"><Inbox size={25} /></span>
    <h3>{title}</h3><p>{message}</p>
    {action && <Button size="sm" onClick={onAction}>{action}</Button>}
  </div>;
}
export function LoadError({ message, onRetry }) {
  if (!message) return null;
  return <div role="alert" className="data-error"><AlertTriangle size={20} className="shrink-0" />
    <div className="flex-1 min-w-0"><b>Could not refresh this page</b><p>{message} Previously loaded records may be out of date.</p></div>
    <Button size="sm" variant="ghost" onClick={onRetry}>Try again</Button>
  </div>;
}
export function Skeleton({ rows = 5, label = 'Loading records' }) {
  return <div role="status" aria-label={label} aria-busy="true" className="data-skeleton">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton-row" aria-hidden="true">
      <span className="skeleton-block skeleton-avatar" /><div className="flex-1 space-y-2"><span className="skeleton-block w-2/3 h-3" /><span className="skeleton-block w-1/3 h-2" /></div>
      <span className="skeleton-block w-16 h-6" />
    </div>)}
  </div>;
}
export function Pagination({ pager }) {
  if (!pager.total) return null;
  const { page, pages, total, size, setPage, setSize } = pager;
  const visible = [...new Set([1, page - 1, page, page + 1, pages])].filter(p => p > 0 && p <= pages).sort((a,b) => a-b);
  return <nav aria-label="Record pages" className="data-pagination">
    <span role="status">{(page - 1) * size + 1}–{Math.min(page * size, total)} of {total}</span>
    <label className="flex items-center gap-2">Per page<select aria-label="Records per page" value={size} onChange={e => setSize(Number(e.target.value))}>
      {[10, 25, 50].map(n => <option key={n}>{n}</option>)}
    </select></label>
    <div className="flex gap-1 items-center flex-wrap">
      <button aria-label="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
      {visible.map((p, i) => <React.Fragment key={p}>{i > 0 && p - visible[i-1] > 1 && <span aria-hidden="true">…</span>}
        <button aria-label={`Page ${p}`} aria-current={page === p ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>
      </React.Fragment>)}
      <button aria-label="Next page" disabled={page === pages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
    </div>
  </nav>;
}

import { useState } from 'react';

// Clamp synchronously when records shrink; reset immediately when filters change.
export function usePagination(rows, filterKey = '', defaultSize = 10) {
  const [state, setState] = useState({ page: 1, size: defaultSize, key: filterKey });
  const pages = Math.max(1, Math.ceil(rows.length / state.size));
  const page = state.key === filterKey ? Math.min(state.page, pages) : 1;
  const setPage = next => setState(s => ({ ...s, key: filterKey, page: Math.max(1, Math.min(next, pages)) }));
  const setSize = size => setState({ key: filterKey, page: 1, size });
  return { items: rows.slice((page - 1) * state.size, page * state.size), page, pages, size: state.size,
    total: rows.length, setPage, setSize };
}

const KEY = 'rescom_search_seed';
export function setSeed(page, value) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ page, value })); } catch { /* storage unavailable */ }
}
export function peekSeed(page) {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return s && s.page === page ? s.value : null; } catch { return null; }
}
export function clearSeed() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
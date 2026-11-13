export function normalizeTerminal(value: unknown) {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase().replace(/^ut/, '');
  return /^[0-9a-f]{8}(?:-[0-9a-f]{8}){2}$/.test(id) ? 'ut' + id : null;
}

import type { Row } from './domain';

function cell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function downloadCsv(name: string, headers: string[], rows: unknown[][]) {
  const content = '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name + '.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportReport(report: Row) {
  const s = report.snapshot;
  if (!s || report.pendingSync) return;
  const affected = report.verified?.affected;
  const outside = report.verified?.outside;
  downloadCsv('RESCOM-DROMIC-' + (report.reportNumber ? report.reportNumber + '-' : '') + report.asOf, ['DROMIC-aligned report', 'Value'], [
    ['Title', report.name], ['Municipality', 'San Nicolas, Ilocos Norte'], ['Disaster event', s.eventName],
    ['Incident type', s.incident?.type], ['Date of occurrence', s.incident?.occurredAt], ['Report number', report.reportNumber],
    ['Reporting date', report.asOf], ['Status', report.status], ['Prepared by', report.preparedBy],
    ['Affected barangays', affected?.barangays ?? 'Awaiting verification'],
    ['Affected families', affected?.families], ['Affected people', affected?.persons],
    ['Inside centers', 'Cumulative', 'Current'],
    ['Families', s.cumulativeFamilies, s.families], ['People', s.cumulativePersons, s.people],
    ['Outside centers', 'Cumulative', 'Current'],
    ['Families', outside?.cumulativeFamilies ?? 'Awaiting verification', outside?.currentFamilies],
    ['People', outside?.cumulativePersons, outside?.currentPersons],
    ['Source of verified figures', report.verified?.source],
    ['Male', s.male], ['Female', s.female], ['Children under 18', s.children], ['Senior citizens', s.seniors],
    ['Priority cases', s.priority], ['Needs priority review', s.pendingCare], ['People returned home', s.returned],
    ['Field remarks', report.remarks],
    [], ['Evacuation center', 'Barangay', 'Status', 'Current families', 'Current people', 'Capacity'],
    ...s.centers.map((c: Row) => [c.name, c.barangay, c.status, c.families, c.occupancy, c.capacity]),
    [], ['Barangay of origin', 'Current families', 'Current people'],
    ...(s.byOrigin || []).map((r: Row) => [r.barangay, r.families, r.persons]),
  ]);
}

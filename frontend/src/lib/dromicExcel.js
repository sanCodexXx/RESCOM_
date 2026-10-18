import { api } from './api.js';

// Downloads an existing DROMIC report as the filled-in DSWD Excel template (.xlsx).
export async function downloadDromicExcel(report) {
  const blob = await api.download(`/dromic/${report.report_id}/xlsx`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DROMIC-Report-${report.report_no || report.report_id}-${(report.disaster_name || 'incident').replace(/[^\w-]+/g, '_')}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// "Generate Report" in one go: freezes the current figures as the next numbered
// DROMIC report for the incident, then downloads it as Excel. Use this from any
// Generate Report button (e.g. the Reports & Analytics page).
export async function generateDromicExcel(incidentId, fieldRemarks = '') {
  const report = await api.post('/dromic', { incident_id: incidentId, field_remarks: fieldRemarks });
  // POST returns the report row without the incident name, so look it up for the file name.
  const list = await api.get('/dromic');
  const full = list.find(r => r.report_id === report.report_id) || report;
  await downloadDromicExcel(full);
  return full;
}
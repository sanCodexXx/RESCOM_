'use client';

import { Tag } from './ui';
import type { Row } from '../lib/domain';

function CountTable({ headers, rows }: { headers: string[]; rows: (string | number | null | undefined)[][] }) {
  return <div className="table-scroll report-table"><table>
    <thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>
      {row.map((value, column) => <td key={column}>{value ?? '—'}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

export default function DromicSummary({ report }: { report: Row }) {
  const s = report.snapshot;
  const affected = report.verified?.affected;
  const outside = report.verified?.outside;
  return <>
    <div className="report-print-brand">
      <img src="/images/san-nicolas-logo.png" alt="" width={68} height={58} />
      <div><h2>San Nicolas MDRRMO</h2><p>Municipality of San Nicolas, Ilocos Norte</p></div>
    </div>
    <h3 className="section-label">{report.name}</h3>
    <div className="detail-grid">
      <div><span>Disaster event</span><strong>{s.eventName}</strong></div>
      <div><span>Reporting date</span><strong>{report.asOf}</strong></div>
      <div><span>Prepared by</span><strong>{report.preparedBy}</strong></div>
      <div><span>Status</span><Tag>{report.status}</Tag></div>
      {report.reportNumber && <div><span>Report number</span><strong>{report.reportNumber}</strong></div>}
      {s.incident && <div><span>Incident</span><strong>{s.incident.type} · {s.incident.occurredAt}</strong></div>}
    </div>

    <h3 className="section-label">Affected population</h3>
    {affected ? <CountTable headers={['Affected barangays', 'Affected families', 'Affected people']}
      rows={[[affected.barangays, affected.families, affected.persons]]} /> : <p className="report-note">Awaiting verified figures.</p>}

    <h3 className="section-label">Displaced inside evacuation centers</h3>
    <CountTable headers={['Registered inside centers', 'Cumulative', 'Current']} rows={[
      ['Families', s.cumulativeFamilies, s.families],
      ['People', s.cumulativePersons, s.people],
    ]} />
    {s.centers.length > 0 && <CountTable headers={['Evacuation center', 'Barangay', 'Current families', 'Current people', 'Capacity']}
      rows={s.centers.map((c: Row) => [c.name, c.barangay, c.families, c.occupancy, c.capacity])} />}

    <h3 className="section-label">Displaced outside evacuation centers</h3>
    {outside ? <CountTable headers={['Recorded outside centers', 'Cumulative', 'Current']} rows={[
      ['Families', outside.cumulativeFamilies, outside.currentFamilies],
      ['People', outside.cumulativePersons, outside.currentPersons],
    ]} /> : <p className="report-note">Awaiting verified figures.</p>}
    {report.verified?.source && <p className="report-note">Source of verified figures · {report.verified.source}</p>}

    {s.byOrigin?.length > 0 && <>
      <h3 className="section-label">Barangay of origin</h3>
      <CountTable headers={['Barangay', 'Current families', 'Current people']}
        rows={s.byOrigin.map((row: { barangay: string; families: number; persons: number }) => [row.barangay, row.families, row.persons])} />
    </>}
    <h3 className="section-label">Population profile</h3>
    <div className="detail-grid report-breakdown">
      {[
        ['Male', s.male], ['Female', s.female], ['Children under 18', s.children], ['Senior citizens', s.seniors],
        ['Priority cases', s.priority], ['Needs priority review', s.pendingCare], ['People returned home', s.returned],
      ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
    {(report.remarks || s.incident?.remarks) && <>
      <h3 className="section-label">Field remarks</h3>
      {s.incident?.remarks && <p>{s.incident.remarks}</p>}
      {report.remarks && <p>{report.remarks}</p>}
    </>}
    <p className="report-note">DROMIC-aligned summary for review · Generated {new Date(s.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT.</p>
  </>;
}

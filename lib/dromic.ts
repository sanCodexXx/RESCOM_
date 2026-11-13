import { z } from 'zod';
import { summarize, type Row } from './domain';

const count = z.number().int().nonnegative().max(2147483647);
const affected = z.object({ barangays: count, families: count, persons: count });
const outside = z.object({ cumulativeFamilies: count, currentFamilies: count, cumulativePersons: count, currentPersons: count });

export const verifiedFigures = z.object({
  source: z.string().trim().min(1, 'Enter the source of the verified figures.').max(160),
  affected: affected.optional(),
  outside: outside.optional(),
}).superRefine(({ affected, outside }, context) => {
  if (affected && (affected.families > affected.persons || (affected.persons > 0 && affected.barangays === 0))) {
    context.addIssue({ code: 'custom', message: 'Check the affected population. People must cover families, and positive totals need an affected barangay.' });
  }
  if (outside && (outside.currentFamilies > outside.cumulativeFamilies || outside.currentPersons > outside.cumulativePersons ||
    outside.cumulativeFamilies > outside.cumulativePersons || outside.currentFamilies > outside.currentPersons)) {
    context.addIssue({ code: 'custom', message: 'Check the outside-center figures. Cumulative totals must cover current totals, and people must cover families.' });
  }
});

export function dromicSnapshot(
  data: { centers: Row[]; households: Row[]; events: Row[] },
  eventId: string,
  asOf: string,
  generatedAt: string,
) {
  const event = data.events.find(record => record.id === eventId);
  const arrived = data.households.filter(h => (eventId === 'all' || h.eventId === eventId) && h.arrivalDate <= asOf);
  const cutoff = arrived.map<Row>(h => ({ ...h, status: h.departureDate && h.departureDate <= asOf ? 'Returned home' : 'In center' }));
  const totals = summarize({ ...data, households: cutoff }, eventId);
  const active = cutoff.filter(h => h.status === 'In center');
  const cumulative = new Map<string, { families: number; persons: number }>();
  for (const h of arrived) {
    const tally = cumulative.get(h.centerId) || { families: 0, persons: 0 };
    tally.families++;
    tally.persons += h.members.length;
    cumulative.set(h.centerId, tally);
  }
  return {
    ...totals,
    eventName: event?.name || 'All recorded events',
    incident: event && { type: event.type, occurredAt: event.occurredAt, status: event.status, remarks: event.remarks },
    generatedAt,
    cumulativeFamilies: arrived.length,
    cumulativePersons: arrived.reduce((sum, h) => sum + h.members.length, 0),
    centers: totals.centers.filter(c => cumulative.has(c.id)).map(c => ({
      id: c.id, name: c.name, barangay: c.barangay, status: c.status, capacity: c.capacity,
      occupancy: c.occupancy, families: c.families,
      cumulativeFamilies: cumulative.get(c.id)?.families || 0,
      cumulativePersons: cumulative.get(c.id)?.persons || 0,
    })),
    byOrigin: Object.entries(active.reduce<Record<string, { families: number; persons: number }>>((origins, h) => {
      const group = origins[h.barangay] ||= { families: 0, persons: 0 };
      group.families++;
      group.persons += h.members.length;
      return origins;
    }, {})).map(([barangay, counts]) => ({ barangay, ...counts })).sort((a, b) => a.barangay.localeCompare(b.barangay)),
  };
}

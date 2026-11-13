import assert from 'node:assert/strict';
import { summarize, phDate } from '../lib/domain.ts';
const member=(priority='None',careStatus='Needs review',age=32,sex='Female')=>({priority,careStatus,age,sex});
const data={centers:[{id:'a',capacity:10,status:'Open'},{id:'b',capacity:5,status:'Standby'}],events:[],households:[{id:'f1',eventId:'event-a',status:'In center',centerId:'a',members:[member(),member('Senior citizen','Assisted',67,'Male')]},{id:'f2',eventId:'event-b',status:'In center',centerId:'a',members:[member('PWD')]},{id:'f3',eventId:'event-a',status:'Returned home',centerId:'a',members:[member('Infant','Needs review',0)]}]};
const s=summarize(data);
assert.equal(s.people,3);assert.equal(s.families,2);assert.equal(s.priority,2);assert.equal(s.pendingCare,1);assert.equal(s.returned,1);assert.equal(s.capacity,10);assert.equal(s.activeCenters,1);assert.equal(s.centers[0].occupancy,3);assert.equal(s.male,1);assert.equal(s.female,2);assert.equal(s.seniors,1);
const event=summarize(data,'event-a');assert.equal(event.people,2);assert.equal(event.pendingCare,0);assert.equal(event.centers[0].occupancy,2);
assert.equal(phDate(new Date('2026-11-02T18:00:00Z')),'2026-11-03');
console.log('PASS: summary totals, priority status, event filtering, departures, and Philippine dates');

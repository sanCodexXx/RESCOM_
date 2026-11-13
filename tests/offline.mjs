import assert from 'node:assert/strict';
import { applyChanges, blockedDependencies, emptyWorkspace } from '../lib/offline.ts';
import { normalizeTerminal } from '../lib/starlink.ts';

const seed = { id: 'first', owner: 'personnel', space: 'live', kind: 'centers', recordId: 'center',
  method: 'POST', data: { name: 'Field center', capacity: 20 }, dependencies: [], createdAt: '2026-11-13T01:00:00Z' };
const update = { ...seed, id: 'next', method: 'PUT', data: { name: 'Field center', capacity: 30 }, dependencies: [seed.id] };
const household = { ...seed, id: 'family', kind: 'households', recordId: 'family-record',
  data: { centerId: 'center', headName: 'Test family' }, dependencies: [update.id] };
const training = { ...seed, id: 'training', space: 'training', recordId: 'test-center' };

let result = applyChanges(emptyWorkspace, [seed, update, household, training], 'live');
assert.equal(result.centers.length, 1);
assert.equal(result.centers[0].capacity, 30);
assert.equal(result.centers[0].pendingChange, 'next');
assert.equal(result.households[0].centerId, 'center');

const rejected = { ...seed, error: 'Center no longer available' };
assert.deepEqual([...blockedDependencies([rejected, update, household, training])], ['first', 'next', 'family']);
result = applyChanges(emptyWorkspace, [rejected, update, household, training], 'live');
assert.equal(result.centers.length, 0);
assert.equal(result.households.length, 0);

assert.equal(normalizeTerminal(' UT11111111-22222222-33333333 '), 'ut11111111-22222222-33333333');
assert.equal(normalizeTerminal('KIT1234'), null);
console.log('PASS: pending changes, dependent edits, workspace isolation, and Starlink terminal IDs');

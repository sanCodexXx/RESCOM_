const express = require('express');
const { createHash } = require('node:crypto');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { emit, notify } = require('../utils/notify');
const { claimWrite, finishWrite, fieldWrite, writeError, writeFailure } = require('../utils/fieldWrite');

const { BARANGAYS, normalizePhPhone } = require('../utils/barangays');
const router = express.Router();
router.use(verifyToken);

// GET /api/evacuees/stats
router.get('/stats', async (req, res) => {
  const total = await db.query('SELECT COUNT(*)::int AS n FROM EVACUEES');
  const priority = await db.query(
    `SELECT COUNT(DISTINCT evacuee_id)::int AS n FROM PRIORITY_CASES WHERE priority_status = 'Flagged'`
  );
  const present = await db.query(
    `SELECT COUNT(*)::int AS n FROM EVACUATION_RECORDS WHERE status = 'Present'`
  );
  res.json({
    totalEvacuees: total.rows[0].n,
    totalPriorityCases: priority.rows[0].n,
    currentlyPresent: present.rows[0].n
  });
});

// GET /api/evacuees — full roster with family + latest record + center joined
router.get('/', async (req, res) => {
  const { rows } = await db.query(`
    SELECT
      e.evacuee_id, e.first_name, e.middle_name, e.last_name, e.age, e.gender,
      f.family_id, f.family_name, f.barangay, f.contact_number,
      r.record_id, r.status AS record_status, r.date_evacuated,
      c.center_id, c.center_name,
      COALESCE(
        (SELECT json_agg(p.case_type) FROM PRIORITY_CASES p WHERE p.evacuee_id = e.evacuee_id AND p.priority_status = 'Flagged'),
        '[]'
      ) AS priority_types
    FROM EVACUEES e
    LEFT JOIN FAMILIES f ON f.family_id = e.family_id
    LEFT JOIN LATERAL (
      SELECT * FROM EVACUATION_RECORDS er
      WHERE er.evacuee_id = e.evacuee_id
      ORDER BY er.date_evacuated DESC LIMIT 1
    ) r ON true
    LEFT JOIN EVACUATION_CENTERS c ON c.center_id = r.center_id
    ORDER BY r.date_evacuated DESC NULLS LAST
  `);
  res.json(rows);
});

router.get('/offline-catalog', async (req, res) => {
  const [centers, incidents, families] = await Promise.all([
    db.query(`SELECT center_id, center_name, capacity, occupancy FROM EVACUATION_CENTERS
      WHERE status = 'Open' AND occupancy < capacity ORDER BY center_name, center_id`),
    db.query(`SELECT incident_id, disaster_name, disaster_type, reporting_status FROM DISASTER_INCIDENTS
      WHERE reporting_status <> 'Resolved' ORDER BY date_started DESC, incident_id DESC`),
    db.query('SELECT family_id, family_name, barangay FROM FAMILIES ORDER BY family_name, family_id')
  ]);
  res.set('Cache-Control', 'no-store').json({ centers: centers.rows, incidents: incidents.rows, families: families.rows });
});

// POST /api/evacuees/register
// Body: { family: {family_name, household_address, barangay, contact_number} | family_id,
//         evacuee: {first_name, last_name, age, gender},
//         center_id, incident_id, priority_types: ['Elderly', ...] }

// Every field of a registration is required except middle name and the
// priority tags (a person may have none).
function validateRegistration({ family, family_id, evacuee, center_id, incident_id }) {
  const clean = (v) => String(v ?? '').trim();
  if (!clean(evacuee?.first_name)) return 'First name is required';
  if (!clean(evacuee?.last_name)) return 'Last name is required';
  const age = Number(evacuee?.age);
  if (evacuee?.age === '' || evacuee?.age == null || !Number.isInteger(age) || age < 0 || age > 120) {
    return 'Age is required (a whole number from 0 to 120)';
  }
  if (!['Male', 'Female'].includes(evacuee?.gender)) return 'Gender must be Male or Female';
  if (!center_id) return 'Evacuation center is required';
  if (!incident_id) return 'Related disaster incident is required';
  if (!family_id) {
    if (!clean(family?.family_name)) return 'Family name is required';
    if (!BARANGAYS.includes(family?.barangay)) return 'Choose a Barangay of Origin from the list';
    if (!normalizePhPhone(family?.contact_number)) return 'Enter a valid Philippine mobile number, e.g. +63 917 123 4567';
  }
  return null;
}

async function registerEvacuee(req, res, submission) {
  let client;
  let receipt;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const { family, family_id, evacuee, center_id, incident_id, priority_types = [] } = req.body;
    if (!submission) receipt = await claimWrite(client, req);
    if (receipt?.replayed) {
      await client.query('COMMIT');
      return res.status(201).json(receipt.response);
    }
    const capturedAt = submission?.capturedAt ?? receipt?.capturedAt ?? null;

    if (submission) {
      const { id, hash } = submission;
      const owner = req.user.user_id;
      const claimed = await client.query(
        `INSERT INTO EVACUEE_OFFLINE_SUBMISSIONS (user_id, submission_id, payload_hash)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING submission_id`,
        [owner, id, hash]
      );
      if (!claimed.rowCount) {
        const { rows: [receipt] } = await client.query(
          'SELECT payload_hash, record_id FROM EVACUEE_OFFLINE_SUBMISSIONS WHERE user_id = $1 AND submission_id = $2',
          [owner, id]
        );
        if (receipt.payload_hash !== hash) throw { status: 409, message: 'This entry already synced with different details. Check the shared records before submitting again.' };
        if (receipt.record_id == null) throw { status: 410, message: 'This entry synced earlier and its evacuation record was removed.' };
        await client.query('COMMIT');
        return res.json({ submission_id: id, record_id: receipt.record_id });
      }
    }

    const problem = validateRegistration({ family, family_id, evacuee, center_id, incident_id });
    if (problem) throw { status: 400, message: problem };

    if (capturedAt) {
      if (!Array.isArray(priority_types) || priority_types.length > 7 || priority_types.some(type => typeof type !== 'string' || type.length > 100)) {
        throw { status: 400, message: 'Review the priority types for this registration.' };
      }
      const { rows: [incident] } = await client.query(
        'SELECT reporting_status FROM DISASTER_INCIDENTS WHERE incident_id = $1 FOR SHARE', [incident_id]
      );
      if (!incident || incident.reporting_status === 'Resolved') {
        throw { status: 409, message: 'The selected incident is no longer active. Choose another incident.' };
      }
    }

    let famId = family_id;
    if (!famId && family?.family_name) {
      const { rows: [fam] } = await client.query(
        `INSERT INTO FAMILIES (family_name, household_address, barangay, contact_number)
         VALUES ($1,$2,$3,$4) RETURNING family_id`,
        [family.family_name.trim(), family.household_address || null, family.barangay, normalizePhPhone(family.contact_number)]
      );
      famId = fam.family_id;
    }

    const { rows: [ev] } = await client.query(
      `INSERT INTO EVACUEES (family_id, first_name, middle_name, last_name, age, gender)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [famId || null, evacuee.first_name, evacuee.middle_name || null, evacuee.last_name, Number(evacuee.age), evacuee.gender]
    );

    const { rows: [center] } = await client.query('SELECT * FROM EVACUATION_CENTERS WHERE center_id = $1 FOR UPDATE', [center_id]);
    if (!center) throw { status: 404, message: 'Evacuation center not found' };
    if (capturedAt && center.status !== 'Open') throw { status: 409, message: 'The selected center is no longer accepting evacuees. Choose another center.' };
    if (['Closed', 'Standby'].includes(center.status)) throw { status: 400, message: `${center.center_name} is ${center.status.toLowerCase()} and is not accepting evacuees` };
    if (center.occupancy >= center.capacity) throw { status: 400, message: `${center.center_name} is already at full capacity` };

    const { rows: [record] } = await client.query(
      `INSERT INTO EVACUATION_RECORDS (evacuee_id, center_id, incident_id, registered_by, status, date_evacuated)
       VALUES ($1,$2,$3,$4,'Present',COALESCE($5::timestamptz,NOW())) RETURNING *`,
      [ev.evacuee_id, center_id, incident_id || null, req.user.user_id, capturedAt]
    );

    const newOccupancy = center.occupancy + 1;
    await client.query(
      `UPDATE EVACUATION_CENTERS SET occupancy = $1, status = CASE WHEN $1 >= capacity THEN 'Full' ELSE status END WHERE center_id = $2`,
      [newOccupancy, center_id]
    );

    const priorityIds = [];
    for (const caseType of priority_types) {
      const { rows: [priority] } = await client.query(
        `INSERT INTO PRIORITY_CASES (evacuee_id, case_type, priority_status, flagged_by) VALUES ($1,$2,'Flagged',$3) RETURNING priority_id`,
        [ev.evacuee_id, caseType, req.user.user_id]
      );
      priorityIds.push(priority.priority_id);
    }

    if (submission) {
      await client.query(
        'UPDATE EVACUEE_OFFLINE_SUBMISSIONS SET record_id = $1 WHERE user_id = $2 AND submission_id = $3',
        [record.record_id, req.user.user_id, submission.id]
      );
    }
    const payload = { ...ev, record, center_name: center.center_name, priority_types };
    const response = receipt ? { ...payload, priority_ids: priorityIds }
      : submission ? { submission_id: submission.id, record_id: record.record_id } : payload;
    await finishWrite(client, receipt, response);
    await client.query('COMMIT');
    emit('evacuee_registered', payload);
    emit('center_updated', { ...center, occupancy: newOccupancy });
    notify('Evacuee Registered', `New registration: ${ev.first_name} ${ev.last_name}`);
    res.status(201).json(response);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (submission) {
      if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ code: 'OFFLINE_REVIEW', error: err.message });
      if (['22P02', '22001', '23503', '23514'].includes(err.code)) {
        return res.status(409).json({ code: 'OFFLINE_REVIEW', error: 'Review the registration details and select current household, center and incident options.' });
      }
      console.error('Offline registration failed', err.code || err.name);
      return res.status(500).json({ error: 'The registration could not be confirmed. It can be retried.' });
    }
    if (req.get('Idempotency-Key')) return writeFailure(err, res);
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Registration failed' });
  } finally {
    client?.release();
  }
}

router.post('/register', (req, res) => registerEvacuee(req, res));

const payloadFields = ['family_id', 'family', 'family_name', 'household_address', 'barangay', 'contact_number',
  'evacuee', 'first_name', 'middle_name', 'last_name', 'age', 'gender', 'center_id', 'incident_id', 'priority_types', 'captured_at'];

router.post('/offline-registrations', (req, res) => {
  const body = req.body || {};
  if (body.owner_id !== req.user.user_id) return res.status(403).json({ error: 'Sign in as the account that prepared this device.' });
  if (typeof body.submission_id !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(body.submission_id) ||
      typeof body.captured_at !== 'string' || !Number.isFinite(Date.parse(body.captured_at))) {
    return res.status(400).json({ code: 'OFFLINE_REVIEW', error: 'This device entry has invalid registration metadata.' });
  }
  const hash = createHash('sha256').update(JSON.stringify(body, payloadFields)).digest('hex');
  return registerEvacuee(req, res, { id: body.submission_id, capturedAt: body.captured_at, hash });
});

// PUT /api/evacuees/:id — edit an evacuee's own details (name, age, gender)
router.put('/:id', fieldWrite(200, async (req, client) => {
  const { first_name, middle_name, last_name, age, gender } = req.body;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw writeError(400, 'Invalid evacuee id');
  if (gender && !['Male', 'Female'].includes(gender)) throw writeError(400, 'Gender must be Male or Female');
  // Fields left out of the request are left alone. Age 0 (infants) is a real value.
  const sent = (k) => Object.prototype.hasOwnProperty.call(req.body, k);
  let ageVal = null;
  if (sent('age') && age !== '' && age !== null) {
    ageVal = Number(age);
    if (!Number.isInteger(ageVal) || ageVal < 0 || ageVal > 120) throw writeError(400, 'Age must be a whole number from 0 to 120');
  }
  const { rows } = await client.query(
    `UPDATE EVACUEES SET
       first_name  = COALESCE($1, first_name),
       middle_name = CASE WHEN $7::boolean THEN $2 ELSE middle_name END,
       last_name   = COALESCE($3, last_name),
       age         = CASE WHEN $8::boolean THEN $4::int ELSE age END,
       gender      = COALESCE($5, gender)
     WHERE evacuee_id = $6 RETURNING *`,
    [first_name, middle_name || null, last_name, ageVal, gender, id, sent('middle_name'), sent('age')]
  );
  if (!rows[0]) throw writeError(404, 'Evacuee not found');
  return rows[0];
}, (req, evacuee) => emit('evacuee_registered', evacuee)));

// PATCH /api/evacuees/:id/checkout
router.patch('/:id/checkout', fieldWrite(200, async (req, client) => {
  const evacueeId = parseInt(req.params.id, 10);
  const recordId = req.body?.record_id ?? null;
  const { rows: [record] } = await client.query(
    `UPDATE EVACUATION_RECORDS SET status = 'Checked out'
      WHERE status = 'Present' AND record_id = (
        SELECT record_id FROM EVACUATION_RECORDS
         WHERE evacuee_id = $1 AND status = 'Present'
         ORDER BY date_evacuated DESC, record_id DESC LIMIT 1 FOR UPDATE)
        AND ($2::int IS NULL OR record_id = $2)
      RETURNING *`,
    [evacueeId, recordId]
  );
  if (!record) {
    throw writeError(recordId == null ? 404 : 409, recordId == null
      ? 'No active record for this evacuee' : 'The active evacuation record changed. Review this checkout.');
  }

  const { rows: [center] } = await client.query(
    `UPDATE EVACUATION_CENTERS
        SET occupancy = GREATEST(0, occupancy - 1),
            status = CASE WHEN status = 'Full' THEN 'Open' ELSE status END
      WHERE center_id = $1 RETURNING *`,
    [record.center_id]
  );
  return { message: 'Evacuee checked out', center };
}, (req, result) => emit('center_updated', result.center)));

// DELETE /api/evacuees/:id — full delete (family, records, priority flags
// cascade via FK). If still checked in, first roll back the center's
// occupancy so counts stay accurate.
router.delete('/:id', requireRole('ADMIN_STAFF'), async (req, res) => {
  const evacueeId = parseInt(req.params.id, 10);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [ev] } = await client.query('SELECT * FROM EVACUEES WHERE evacuee_id = $1', [evacueeId]);
    if (!ev) throw { status: 404, message: 'Evacuee not found' };

    const { rows: [presentRecord] } = await client.query(
      `SELECT * FROM EVACUATION_RECORDS WHERE evacuee_id = $1 AND status = 'Present' ORDER BY date_evacuated DESC, record_id DESC LIMIT 1 FOR UPDATE`,
      [evacueeId]
    );
    if (presentRecord) {
      await client.query(
        `UPDATE EVACUATION_CENTERS
            SET occupancy = GREATEST(0, occupancy - 1),
                status = CASE WHEN status = 'Full' THEN 'Open' ELSE status END
          WHERE center_id = $1`,
        [presentRecord.center_id]
      );
    }

    await client.query('DELETE FROM EVACUEES WHERE evacuee_id = $1', [evacueeId]);
    await client.query('COMMIT');

    emit('evacuee_registered', { evacuee_id: evacueeId, deleted: true });
    if (presentRecord) emit('center_updated', { center_id: presentRecord.center_id });
    notify('Evacuee Record Deleted', `${ev.first_name} ${ev.last_name}'s record was removed.`, { type: 'warning' });
    res.json({ message: 'Evacuee record deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(err.status || 500).json({ error: err.message || 'Delete failed' });
  } finally {
    client.release();
  }
});

module.exports = router;

const express = require('express');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { emit, notify } = require('../utils/notify');

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

router.post('/register', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { family, family_id, evacuee, center_id, incident_id, priority_types = [] } = req.body;

    const problem = validateRegistration({ family, family_id, evacuee, center_id, incident_id });
    if (problem) throw { status: 400, message: problem };

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
    if (['Closed', 'Standby'].includes(center.status)) throw { status: 400, message: `${center.center_name} is ${center.status.toLowerCase()} and is not accepting evacuees` };
    if (center.occupancy >= center.capacity) throw { status: 400, message: `${center.center_name} is already at full capacity` };

    const { rows: [record] } = await client.query(
      `INSERT INTO EVACUATION_RECORDS (evacuee_id, center_id, incident_id, registered_by, status)
       VALUES ($1,$2,$3,$4,'Present') RETURNING *`,
      [ev.evacuee_id, center_id, incident_id || null, req.user.user_id]
    );

    const newOccupancy = center.occupancy + 1;
    await client.query(
      `UPDATE EVACUATION_CENTERS SET occupancy = $1, status = CASE WHEN $1 >= capacity THEN 'Full' ELSE status END WHERE center_id = $2`,
      [newOccupancy, center_id]
    );

    for (const caseType of priority_types) {
      await client.query(
        `INSERT INTO PRIORITY_CASES (evacuee_id, case_type, priority_status, flagged_by) VALUES ($1,$2,'Flagged',$3)`,
        [ev.evacuee_id, caseType, req.user.user_id]
      );
    }

    await client.query('COMMIT');

    const payload = { ...ev, record, center_name: center.center_name, priority_types };
    emit('evacuee_registered', payload);
    emit('center_updated', { ...center, occupancy: newOccupancy });
    notify('Evacuee Registered', `New registration: ${ev.first_name} ${ev.last_name}`);
    res.status(201).json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Registration failed' });
  } finally {
    client.release();
  }
});

// PUT /api/evacuees/:id — edit an evacuee's own details (name, age, gender)
router.put('/:id', async (req, res) => {
  const { first_name, middle_name, last_name, age, gender } = req.body;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid evacuee id' });
  if (gender && !['Male', 'Female'].includes(gender)) return res.status(400).json({ error: 'Gender must be Male or Female' });
  // Fields left out of the request are left alone. Age 0 (infants) is a real value.
  const sent = (k) => Object.prototype.hasOwnProperty.call(req.body, k);
  let ageVal = null;
  if (sent('age') && age !== '' && age !== null) {
    ageVal = Number(age);
    if (!Number.isInteger(ageVal) || ageVal < 0 || ageVal > 120) return res.status(400).json({ error: 'Age must be a whole number from 0 to 120' });
  }
  const { rows } = await db.query(
    `UPDATE EVACUEES SET
       first_name  = COALESCE($1, first_name),
       middle_name = CASE WHEN $7::boolean THEN $2 ELSE middle_name END,
       last_name   = COALESCE($3, last_name),
       age         = CASE WHEN $8::boolean THEN $4::int ELSE age END,
       gender      = COALESCE($5, gender)
     WHERE evacuee_id = $6 RETURNING *`,
    [first_name, middle_name || null, last_name, ageVal, gender, id, sent('middle_name'), sent('age')]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Evacuee not found' });
  emit('evacuee_registered', rows[0]);
  res.json(rows[0]);
});

// PATCH /api/evacuees/:id/checkout
router.patch('/:id/checkout', async (req, res) => {
  const evacueeId = parseInt(req.params.id, 10);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // One atomic step: only the request that actually flips Present -> Checked out
    // goes on to lower the headcount, so double clicks / retries can't decrement twice.
    const { rows: [record] } = await client.query(
      `UPDATE EVACUATION_RECORDS SET status = 'Checked out'
        WHERE status = 'Present' AND record_id = (
          SELECT record_id FROM EVACUATION_RECORDS
           WHERE evacuee_id = $1 AND status = 'Present'
           ORDER BY date_evacuated DESC, record_id DESC LIMIT 1 FOR UPDATE)
        RETURNING *`,
      [evacueeId]
    );
    if (!record) throw { status: 404, message: 'No active record for this evacuee' };

    // A Full center becomes Open again; Closed / Standby stay as an admin set them.
    const { rows: [center] } = await client.query(
      `UPDATE EVACUATION_CENTERS
          SET occupancy = GREATEST(0, occupancy - 1),
              status = CASE WHEN status = 'Full' THEN 'Open' ELSE status END
        WHERE center_id = $1 RETURNING *`,
      [record.center_id]
    );
    await client.query('COMMIT');
    emit('center_updated', center);
    res.json({ message: 'Evacuee checked out', center });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(err.status || 500).json({ error: err.message || 'Checkout failed' });
  } finally {
    client.release();
  }
});

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
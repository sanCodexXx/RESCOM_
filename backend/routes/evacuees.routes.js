const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { emit, notify } = require('../utils/notify');

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
      f.family_id, f.family_name, f.barangay,
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
router.post('/register', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { family, family_id, evacuee, center_id, incident_id, priority_types = [] } = req.body;

    if (!evacuee?.first_name || !evacuee?.last_name || !center_id) {
      throw { status: 400, message: 'Evacuee name and evacuation center are required' };
    }

    let famId = family_id;
    if (!famId && family?.family_name) {
      const { rows: [fam] } = await client.query(
        `INSERT INTO FAMILIES (family_name, household_address, barangay, contact_number)
         VALUES ($1,$2,$3,$4) RETURNING family_id`,
        [family.family_name, family.household_address || null, family.barangay || 'Unknown', family.contact_number || null]
      );
      famId = fam.family_id;
    }

    const { rows: [ev] } = await client.query(
      `INSERT INTO EVACUEES (family_id, first_name, middle_name, last_name, age, gender)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [famId || null, evacuee.first_name, evacuee.middle_name || null, evacuee.last_name, evacuee.age || null, evacuee.gender || null]
    );

    const { rows: [center] } = await client.query('SELECT * FROM EVACUATION_CENTERS WHERE center_id = $1', [center_id]);
    if (!center) throw { status: 404, message: 'Evacuation center not found' };
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
  const { rows } = await db.query(
    `UPDATE EVACUEES SET
       first_name  = COALESCE($1, first_name),
       middle_name = $2,
       last_name   = COALESCE($3, last_name),
       age         = $4,
       gender      = COALESCE($5, gender)
     WHERE evacuee_id = $6 RETURNING *`,
    [first_name, middle_name || null, last_name, age ? parseInt(age, 10) : null, gender, req.params.id]
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
    const { rows: [record] } = await client.query(
      `SELECT * FROM EVACUATION_RECORDS WHERE evacuee_id = $1 AND status = 'Present' ORDER BY date_evacuated DESC LIMIT 1`,
      [evacueeId]
    );
    if (!record) throw { status: 404, message: 'No active record for this evacuee' };

    await client.query(`UPDATE EVACUATION_RECORDS SET status = 'Checked out' WHERE record_id = $1`, [record.record_id]);
    const { rows: [center] } = await client.query(
      `UPDATE EVACUATION_CENTERS SET occupancy = GREATEST(0, occupancy - 1), status = 'Open' WHERE center_id = $1 RETURNING *`,
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
router.delete('/:id', async (req, res) => {
  const evacueeId = parseInt(req.params.id, 10);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [ev] } = await client.query('SELECT * FROM EVACUEES WHERE evacuee_id = $1', [evacueeId]);
    if (!ev) throw { status: 404, message: 'Evacuee not found' };

    const { rows: [presentRecord] } = await client.query(
      `SELECT * FROM EVACUATION_RECORDS WHERE evacuee_id = $1 AND status = 'Present' ORDER BY date_evacuated DESC LIMIT 1`,
      [evacueeId]
    );
    if (presentRecord) {
      await client.query(
        `UPDATE EVACUATION_CENTERS SET occupancy = GREATEST(0, occupancy - 1), status = 'Open' WHERE center_id = $1`,
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

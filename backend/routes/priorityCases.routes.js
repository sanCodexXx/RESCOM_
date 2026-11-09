const express = require('express');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { emit, notify } = require('../utils/notify');
const { fieldWrite, writeError } = require('../utils/fieldWrite');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res) => {
  const { rows } = await db.query(`
    SELECT p.*, e.first_name, e.last_name, f.family_name, f.barangay
    FROM PRIORITY_CASES p
    JOIN EVACUEES e ON e.evacuee_id = p.evacuee_id
    LEFT JOIN FAMILIES f ON f.family_id = e.family_id
    ORDER BY p.created_at DESC
  `);
  res.json(rows);
});

router.post('/', fieldWrite(201, async (req, client) => {
  const { evacuee_id, case_type, description } = req.body;
  if (!evacuee_id || !case_type) throw writeError(400, 'Evacuee and case type are required.');

  const { rows: [pc] } = await client.query(
    `INSERT INTO PRIORITY_CASES (evacuee_id, case_type, description, priority_status, flagged_by)
     VALUES ($1,$2,$3,'Flagged',$4) RETURNING *`,
    [evacuee_id, case_type, description || null, req.user.user_id]
  );
  return pc;
}, (req, priorityCase) => {
  emit('priority_case_flagged', priorityCase);
  notify('Priority Case Flagged', `${priorityCase.case_type} case flagged for evacuee #${priorityCase.evacuee_id}`);
}));

router.patch('/:id/status', fieldWrite(200, async (req, client) => {
  const { priority_status } = req.body;
  const { rows } = await client.query(
    `UPDATE PRIORITY_CASES SET priority_status = $1 WHERE priority_id = $2 RETURNING *`,
    [priority_status, req.params.id]
  );
  if (!rows[0]) throw writeError(404, 'Priority case not found');
  return rows[0];
}, (req, priorityCase) => emit('priority_case_flagged', priorityCase)));

router.delete('/:id', requireRole('ADMIN_STAFF'), async (req, res) => {
  await db.query('DELETE FROM PRIORITY_CASES WHERE priority_id = $1', [req.params.id]);
  emit('priority_case_flagged', { priority_id: parseInt(req.params.id, 10), deleted: true });
  res.json({ message: 'Priority flag removed' });
});

module.exports = router;

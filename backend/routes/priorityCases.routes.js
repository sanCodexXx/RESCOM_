const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { emit, notify } = require('../utils/notify');

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

router.post('/', async (req, res) => {
  const { evacuee_id, case_type, description } = req.body;
  if (!evacuee_id || !case_type) return res.status(400).json({ error: 'evacuee_id and case_type are required' });

  const { rows: [pc] } = await db.query(
    `INSERT INTO PRIORITY_CASES (evacuee_id, case_type, description, priority_status, flagged_by)
     VALUES ($1,$2,$3,'Flagged',$4) RETURNING *`,
    [evacuee_id, case_type, description || null, req.user.user_id]
  );
  emit('priority_case_flagged', pc);
  notify('Priority Case Flagged', `${case_type} case flagged for evacuee #${evacuee_id}`);
  res.status(201).json(pc);
});

router.patch('/:id/status', async (req, res) => {
  const { priority_status } = req.body;
  const { rows } = await db.query(
    `UPDATE PRIORITY_CASES SET priority_status = $1 WHERE priority_id = $2 RETURNING *`,
    [priority_status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Priority case not found' });
  emit('priority_case_flagged', rows[0]);
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM PRIORITY_CASES WHERE priority_id = $1', [req.params.id]);
  emit('priority_case_flagged', { priority_id: parseInt(req.params.id, 10), deleted: true });
  res.json({ message: 'Priority flag removed' });
});

module.exports = router;

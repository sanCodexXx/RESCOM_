const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { emit, notify } = require('../utils/notify');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res) => {
  const { rows } = await db.query(`
    SELECT i.*, u.first_name AS reporter_first, u.last_name AS reporter_last
    FROM DISASTER_INCIDENTS i
    LEFT JOIN USERS u ON u.user_id = i.reported_by
    ORDER BY i.date_started DESC
  `);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { disaster_name, disaster_type, brgy, severity, field_remarks } = req.body;
  if (!disaster_name || !disaster_type) return res.status(400).json({ error: 'disaster_name and disaster_type are required' });

  const { rows: [incident] } = await db.query(
    `INSERT INTO DISASTER_INCIDENTS (disaster_name, disaster_type, brgy, severity, field_remarks, reporting_status, reported_by)
     VALUES ($1,$2,$3,$4,$5,'Pending',$6) RETURNING *`,
    [disaster_name, disaster_type, brgy || null, severity || 'Medium', field_remarks || null, req.user.user_id]
  );
  emit('new_incident_dispatched', incident);
  notify('Emergency Dispatched', `${incident.disaster_type} reported in ${incident.brgy || 'unspecified area'}`);
  res.status(201).json(incident);
});

router.patch('/:id/status', async (req, res) => {
  const { reporting_status } = req.body;
  const ended = reporting_status === 'Resolved' ? 'NOW()' : 'date_ended';
  const { rows } = await db.query(
    `UPDATE DISASTER_INCIDENTS SET reporting_status = $1, date_ended = ${reporting_status === 'Resolved' ? 'NOW()' : 'date_ended'}
     WHERE incident_id = $2 RETURNING *`,
    [reporting_status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Incident not found' });
  emit('incident_status_changed', rows[0]);
  notify('Dispatch Status Update', `Incident #${req.params.id} status changed to ${reporting_status}`);
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM DISASTER_INCIDENTS WHERE incident_id = $1', [req.params.id]);
  emit('incident_status_changed', { incident_id: parseInt(req.params.id, 10), deleted: true });
  res.json({ message: 'Incident log removed' });
});

module.exports = router;

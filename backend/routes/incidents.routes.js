const express = require('express');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { emit, notify } = require('../utils/notify');
const { fieldWrite, writeError } = require('../utils/fieldWrite');

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

router.post('/', fieldWrite(201, async (req, client, receipt) => {
  const { disaster_name, disaster_type, brgy, severity, field_remarks } = req.body;
  if (!disaster_name || !disaster_type) throw writeError(400, 'Disaster name and type are required.');

  const { rows: [incident] } = await client.query(
    `INSERT INTO DISASTER_INCIDENTS (disaster_name, disaster_type, brgy, severity, field_remarks, reporting_status, reported_by, date_started)
     VALUES ($1,$2,$3,$4,$5,'Pending',$6,COALESCE($7::timestamptz,NOW())) RETURNING *`,
    [disaster_name, disaster_type, brgy || null, severity || 'Medium', field_remarks || null, req.user.user_id, receipt?.capturedAt]
  );
  return incident;
}, (req, incident) => {
  emit('new_incident_dispatched', incident);
  notify('Emergency Dispatched', `${incident.disaster_type} reported in ${incident.brgy || 'unspecified area'}`);
}));

// Incident lifecycle:  Pending -> En Route -> Active -> Resolved
//   Pending  : reported, nobody dispatched yet
//   En Route : responders are on their way
//   Active   : responders are on scene / the incident is on-going
//   Resolved : finished; the end date is stamped (and cleared again if reopened)
const INCIDENT_STATUSES = ['Pending', 'En Route', 'Active', 'Resolved'];
router.patch('/:id/status', fieldWrite(200, async (req, client, receipt) => {
  const { reporting_status } = req.body;
  if (!INCIDENT_STATUSES.includes(reporting_status)) {
    throw writeError(400, `Status must be one of: ${INCIDENT_STATUSES.join(', ')}`);
  }
  const { rows } = await client.query(
    `UPDATE DISASTER_INCIDENTS
        SET reporting_status = $1::varchar,
            date_ended = CASE WHEN $1::varchar = 'Resolved' THEN COALESCE($3::timestamptz,NOW()) ELSE NULL END
      WHERE incident_id = $2 RETURNING *`,
    [reporting_status, req.params.id, receipt?.capturedAt]
  );
  if (!rows[0]) throw writeError(404, 'Incident not found');
  return rows[0];
}, (req, incident) => {
  emit('incident_status_changed', incident);
  notify('Dispatch Status Update', `Incident #${req.params.id} status changed to ${incident.reporting_status}`);
}));

router.delete('/:id', requireRole('ADMIN_STAFF'), async (req, res) => {
  await db.query('DELETE FROM DISASTER_INCIDENTS WHERE incident_id = $1', [req.params.id]);
  emit('incident_status_changed', { incident_id: parseInt(req.params.id, 10), deleted: true });
  res.json({ message: 'Incident log removed' });
});

module.exports = router;

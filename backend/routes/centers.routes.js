const express = require('express');
const multer = require('multer');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { emit, notify } = require('../utils/notify');
const { fieldWrite, writeError } = require('../utils/fieldWrite');

const router = express.Router();
const CENTER_STATUSES = ['Open', 'Full', 'Standby', 'Closed'];

// Photos are kept in the database (CENTER_IMAGES), not on disk, so they
// survive restarts and redeploys on hosts with an ephemeral filesystem.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  // Any image type is accepted (JPG, PNG, WebP, GIF, BMP, AVIF, HEIC...).
  // SVG is excluded because it can carry scripts.
  fileFilter: (req, file, cb) =>
    /^image\//.test(file.mimetype) && !/svg/i.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Please upload an image file'))
});

// Turns multer errors into a readable 400 instead of a generic 500.
function uploadImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 8 MB)' : (err.message || 'Image upload failed');
    res.status(400).json({ error: msg });
  });
}

async function saveImage(req, id, client) {
  if (!req.file) return;
  const url = `${req.protocol}://${req.get('host')}/api/centers/${id}/image?v=${Date.now()}`;
  await client.query(
    `INSERT INTO CENTER_IMAGES (center_id, image_data, image_type) VALUES ($1,$2,$3)
     ON CONFLICT (center_id) DO UPDATE SET image_data = EXCLUDED.image_data, image_type = EXCLUDED.image_type`,
    [id, req.file.buffer, req.file.mimetype]
  );
  await client.query('UPDATE EVACUATION_CENTERS SET image_url = $1 WHERE center_id = $2', [url, id]);
}

// Public on purpose: <img> tags can't send the Authorization header.
router.get('/:id/image', async (req, res) => {
  const { rows } = await db.query('SELECT image_data, image_type FROM CENTER_IMAGES WHERE center_id = $1', [parseInt(req.params.id, 10)]);
  if (!rows[0]) return res.status(404).end();
  res.set('Content-Type', rows[0].image_type);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(rows[0].image_data);
});

router.use(verifyToken);

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM EVACUATION_CENTERS ORDER BY center_name');
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM EVACUATION_CENTERS WHERE center_id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Center not found' });
  res.json(rows[0]);
});

router.post('/', requireRole('ADMIN_STAFF'), uploadImage, fieldWrite(201, async (req, client) => {
  const { center_name, barangay, address, capacity, status } = req.body;
  if (!center_name || !barangay) throw writeError(400, 'Center name and barangay are required');
  if (status && !CENTER_STATUSES.includes(status)) throw writeError(400, `Status must be one of: ${CENTER_STATUSES.join(', ')}`);
  if (capacity !== undefined && capacity !== '' && (!Number.isInteger(Number(capacity)) || Number(capacity) < 0)) {
    throw writeError(400, 'Capacity must be a whole number, 0 or more');
  }

  const { rows: [created] } = await client.query(
    `INSERT INTO EVACUATION_CENTERS (center_name, barangay, address, capacity, occupancy, status, image_url)
     VALUES ($1,$2,$3,$4,0,$5,$6) RETURNING *`,
    [center_name, barangay, address || null, parseInt(capacity, 10) || 0, status || 'Open', req.body.image_url || null]
  );
  await saveImage(req, created.center_id, client);
  const { rows: [center] } = await client.query('SELECT * FROM EVACUATION_CENTERS WHERE center_id = $1', [created.center_id]);
  return center;
}, (req, center) => {
  emit('center_updated', center);
  notify('New Shelter Added', `${center.center_name} is now available.`, { type: 'success' });
}));

router.put('/:id', requireRole('ADMIN_STAFF'), uploadImage, fieldWrite(200, async (req, client) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw writeError(400, 'Invalid center id');
  const { center_name, barangay, address, capacity, status } = req.body;
  if (status && !CENTER_STATUSES.includes(status)) throw writeError(400, `Status must be one of: ${CENTER_STATUSES.join(', ')}`);

  const { rows: [current] } = await client.query('SELECT capacity, occupancy, status FROM EVACUATION_CENTERS WHERE center_id = $1 FOR UPDATE', [id]);
  if (!current) throw writeError(404, 'Center not found');

  // 0 is a valid capacity, so test "was it sent" rather than "is it truthy".
  let newCapacity = current.capacity;
  if (capacity !== undefined && capacity !== '') {
    newCapacity = Number(capacity);
    if (!Number.isInteger(newCapacity) || newCapacity < 0) throw writeError(400, 'Capacity must be a whole number, 0 or more');
    if (newCapacity < current.occupancy) {
      throw writeError(400, `Capacity cannot be lower than the ${current.occupancy} people currently inside`);
    }
  }
  // Keep the status in step with the headcount, unless an admin picked one on purpose.
  let newStatus = status || current.status;
  if (newStatus === 'Open' && newCapacity > 0 && current.occupancy >= newCapacity) newStatus = 'Full';
  else if (!status && current.status === 'Full' && current.occupancy < newCapacity) newStatus = 'Open';

  await client.query(
    `UPDATE EVACUATION_CENTERS SET
       center_name = COALESCE($1, center_name),
       barangay    = COALESCE($2, barangay),
       address     = COALESCE($3, address),
       capacity    = COALESCE($4, capacity),
       status      = COALESCE($5, status),
       image_url   = COALESCE($6, image_url)
     WHERE center_id = $7`,
    [center_name, barangay, address, newCapacity, newStatus, req.body.image_url || null, id]
  );
  await saveImage(req, id, client);
  const { rows: [center] } = await client.query('SELECT * FROM EVACUATION_CENTERS WHERE center_id = $1', [id]);
  return center;
}, (req, center) => emit('center_updated', center)));

router.delete('/:id', requireRole('ADMIN_STAFF'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db.query('DELETE FROM EVACUATION_CENTERS WHERE center_id = $1', [id]);
  emit('center_updated', { center_id: id, deleted: true });
  res.json({ message: 'Center removed' });
});

module.exports = router;

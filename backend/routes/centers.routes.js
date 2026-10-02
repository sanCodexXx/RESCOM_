const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { emit, notify } = require('../utils/notify');

const router = express.Router();
router.use(verifyToken);

const uploadsRoot = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const uploadDir = path.join(uploadsRoot, 'centers');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp)$/.test(file.mimetype))
});

function imageUrl(req, filename) {
  if (!filename) return null;
  return `${req.protocol}://${req.get('host')}/uploads/centers/${filename}`;
}

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM EVACUATION_CENTERS ORDER BY center_name');
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM EVACUATION_CENTERS WHERE center_id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Center not found' });
  res.json(rows[0]);
});

router.post('/', upload.single('image'), async (req, res) => {
  const { center_name, barangay, address, capacity, status } = req.body;
  if (!center_name || !barangay) return res.status(400).json({ error: 'Center name and barangay are required' });

  const image_url = req.file ? imageUrl(req, req.file.filename) : (req.body.image_url || null);

  const { rows: [center] } = await db.query(
    `INSERT INTO EVACUATION_CENTERS (center_name, barangay, address, capacity, occupancy, status, image_url)
     VALUES ($1,$2,$3,$4,0,$5,$6) RETURNING *`,
    [center_name, barangay, address || null, parseInt(capacity, 10) || 0, status || 'Open', image_url]
  );
  emit('center_updated', center);
  notify('New Shelter Added', `${center.center_name} is now available.`, { type: 'success' });
  res.status(201).json(center);
});

router.put('/:id', upload.single('image'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { center_name, barangay, address, capacity, status } = req.body;
  const image_url = req.file ? imageUrl(req, req.file.filename) : (req.body.image_url || null);

  const { rows } = await db.query(
    `UPDATE EVACUATION_CENTERS SET
       center_name = COALESCE($1, center_name),
       barangay    = COALESCE($2, barangay),
       address     = COALESCE($3, address),
       capacity    = COALESCE($4, capacity),
       status      = COALESCE($5, status),
       image_url   = COALESCE($6, image_url)
     WHERE center_id = $7 RETURNING *`,
    [center_name, barangay, address, capacity ? parseInt(capacity, 10) : null, status, image_url, id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Center not found' });
  emit('center_updated', rows[0]);
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db.query('DELETE FROM EVACUATION_CENTERS WHERE center_id = $1', [id]);
  emit('center_updated', { center_id: id, deleted: true });
  res.json({ message: 'Center removed' });
});

module.exports = router;

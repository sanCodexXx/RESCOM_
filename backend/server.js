require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const { setIo } = require('./utils/notify');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const centersRoutes = require('./routes/centers.routes');
const evacueesRoutes = require('./routes/evacuees.routes');
const priorityCasesRoutes = require('./routes/priorityCases.routes');
const incidentsRoutes = require('./routes/incidents.routes');
const dromicRoutes = require('./routes/dromic.routes');
const notificationsRoutes = require('./routes/notifications.routes');

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change_this'))) {
  console.error('FATAL: set a strong JWT_SECRET before running in production.');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Behind Render / Railway / nginx / Cloudflare the real client IP and the
// https scheme arrive in X-Forwarded-* headers. Needed for rate limiting and
// for building https:// image URLs.
app.set('trust proxy', 1);

// CLIENT_ORIGIN can be one URL or a comma-separated list
// (e.g. your Netlify URL + http://localhost:5173). No trailing slashes.
const origins = (process.env.CLIENT_ORIGIN || '*')
  .split(',').map(o => o.trim().replace(/\/$/, '')).filter(Boolean);
const corsOrigin = origins.includes('*') ? '*' : origins;

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }
});
setIo(io);

// Uploaded center photos are loaded from another origin (the Netlify site),
// so they must be allowed cross-origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

const uploadsRoot = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsRoot));

// --- Brute-force protection on the auth endpoints ---------------------
const limiter = (windowMin, limit, message) => rateLimit({
  windowMs: windowMin * 60 * 1000,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message }
});
app.use('/api/auth/login', limiter(15, 15, 'Too many login attempts. Try again in 15 minutes.'));
app.use('/api/auth/register', limiter(60, 10, 'Too many sign-up attempts. Try again later.'));
app.use('/api/auth/forgot-password', limiter(15, 10, 'Too many reset attempts. Try again in 15 minutes.'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'RESCOM API' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/centers', centersRoutes);
app.use('/api/evacuees', evacueesRoutes);
app.use('/api/priority-cases', priorityCasesRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/dromic', dromicRoutes);
app.use('/api/notifications', notificationsRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('responder_location', ({ userId, latitude, longitude }) => {
    io.emit('responder_location_updated', { userId, latitude, longitude });
  });
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`RESCOM API & WebSocket running on http://localhost:${PORT}`);
});

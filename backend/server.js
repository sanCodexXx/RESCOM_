
require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const { socketAuth } = require('./middleware/socketAuth');
const { setIo } = require('./utils/notify');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const centersRoutes = require('./routes/centers.routes');
const evacueesRoutes = require('./routes/evacuees.routes');
const priorityCasesRoutes = require('./routes/priorityCases.routes');
const incidentsRoutes = require('./routes/incidents.routes');
const dromicRoutes = require('./routes/dromic.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const starlinkRoutes = require('./routes/starlink.routes');

// Production JWT security check
if (
  process.env.NODE_ENV === 'production' &&
  (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.startsWith('change_this')
  )
) {
  console.error(
    'FATAL: set a strong JWT_SECRET before running in production.'
  );
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Trust Render reverse proxy
app.set('trust proxy', 1);

// Allowed frontend origins
const origins = (process.env.CLIENT_ORIGIN || '*')
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const corsOrigin = origins.includes('*') ? '*' : origins;

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

setIo(io);

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);

// CORS middleware
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-RESCOM-Owner', 'X-RESCOM-Captured-At']
}));

// JSON body parser
app.use(express.json({ limit: '1mb' }));

// Static uploaded files
const uploadsRoot =
  process.env.UPLOAD_DIR ||
  path.join(__dirname, 'uploads');

app.use('/uploads', express.static(uploadsRoot));

// Authentication rate limiting
const limiter = (windowMin, limit, message) =>
  rateLimit({
    windowMs: windowMin * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message }
  });

app.use(
  '/api/auth/login',
  limiter(15, 15, 'Too many login attempts. Try again in 15 minutes.')
);

app.use(
  '/api/auth/register',
  limiter(60, 10, 'Too many sign-up attempts. Try again later.')
);

app.use(
  '/api/auth/forgot-password',
  limiter(15, 10, 'Too many reset attempts. Try again in 15 minutes.')
);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'RESCOM API'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/centers', centersRoutes);
app.use('/api/evacuees', evacueesRoutes);
app.use('/api/priority-cases', priorityCasesRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/dromic', dromicRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/starlink', starlinkRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: 'Internal server error'
  });
});

// Socket.IO JWT authentication
io.use(socketAuth);

// Socket.IO connections
io.on('connection', socket => {
  const { user_id, role } = socket.data.user;

  socket.join(`role:${role}`);
  socket.join(`user:${user_id}`);
  const expiresIn = socket.data.user.exp * 1000 - Date.now();
  const expiryTimer = Number.isFinite(expiresIn)
    ? setTimeout(() => socket.disconnect(true), Math.max(0, Math.min(expiresIn, 2147483647)))
    : null;

  console.log(
    'Client connected:',
    socket.id,
    `user ${user_id}`
  );

  socket.on('responder_location', msg => {
    const { latitude, longitude } = msg || {};

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return;
    }

    io.emit('responder_location_updated', {
      userId: user_id,
      latitude: lat,
      longitude: lng
    });
  });

  socket.on('disconnect', () => {
    if (expiryTimer) clearTimeout(expiryTimer);
    console.log('Client disconnected:', socket.id);
  });
});

// Render deployment configuration
const PORT = Number(process.env.PORT) || 10000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `RESCOM API & WebSocket running on port ${PORT}`
  );
});

// server.js — complete replacement
// Adds: /api/stories route, TURN server injection, global API rate limiter

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');

const connectDB       = require('./config/db');
const { initSocket }  = require('./socket/socketServer');
const { startAllCrons } = require('./utils/cron');
const { apiLimiter }  = require('./middleware/rateLimit');
const R = require('./utils/apiResponse');

const app = express();
const httpServer = http.createServer(app);

// ── DATABASE ──────────────────────────────────────────────
connectDB();

// ── SOCKET.IO ─────────────────────────────────────────────
const io = initSocket(httpServer);
app.set('io', io);

// ── SECURITY ──────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ── CORS — allowed origins ─────────────────────────────────
// HARDCODED production origin + local dev origins.
// CLIENT_URL in .env can override/extend but these two are always present.
const ALLOWED_ORIGINS = [
  'https://gu-rizz.vercel.app',       // ← production Vercel frontend
  'http://localhost:5173',             // ← local Vite dev server
  'http://localhost:3000',             // ← alternative local dev
  'http://127.0.0.1:5173',            // ← Vite via IP
  process.env.CLIENT_URL,             // ← any extra origin from .env
].filter(Boolean);                     // removes undefined if CLIENT_URL unset

const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server / Postman requests that have no Origin header
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,                   // allow cookies + Authorization header
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],      // lets the browser read auth cookies
  optionsSuccessStatus: 200,           // some older browsers choke on 204
};

app.use(cors(corsOptions));

// ── PREFLIGHT — handle OPTIONS for every route explicitly ──
// Required so signup, /auth/me, and other non-GET routes
// don't fail with "Response to preflight request doesn't pass
// access control check" in Chrome/Safari.
app.options('*', cors(corsOptions));

// ── GENERAL MIDDLEWARE ─────────────────────────────────────
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ── TURN SERVER CONFIG INJECTION ──────────────────────────
// Injects window.__TURN__ into every HTML response so the frontend
// WebRTC ICE_SERVERS config can use a real TURN server for cross-network calls.
// Set TURN_SERVER_URL, TURN_USERNAME, TURN_CREDENTIAL in your .env
if (process.env.TURN_SERVER_URL) {
  const turnScript = `<script>window.__TURN__=${JSON.stringify({
    url:        process.env.TURN_SERVER_URL,
    username:   process.env.TURN_USERNAME   || '',
    credential: process.env.TURN_CREDENTIAL || '',
  })}</script>`;

  app.use((req, res, next) => {
    const origSend = res.send.bind(res);
    res.send = (body) => {
      if (typeof body === 'string' && body.includes('</head>')) {
        body = body.replace('</head>', turnScript + '</head>');
      }
      return origSend(body);
    };
    next();
  });
}

// ── HEALTH CHECK ───────────────────────────────────────────
app.get('/health', (req, res) => {
  const { getOnlineCount } = require('./socket/socketServer');
  res.json({ status: 'OK', uptime: process.uptime(), onlineUsers: getOnlineCount(), env: process.env.NODE_ENV });
});

// ── GLOBAL RATE LIMIT ──────────────────────────────────────
app.use('/api', apiLimiter);

// ── API ROUTES ─────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/posts',         require('./routes/posts'));
app.use('/api/stories',       require('./routes/stories'));    // ← NEW
app.use('/api/chat',          require('./routes/chat'));
app.use('/api/vibe',          require('./routes/vibe'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin',         require('./routes/admin'));

// ── SERVE FRONTEND (production) ────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// ── 404 ────────────────────────────────────────────────────
app.use((req, res) => R.notFound(res, `Route ${req.method} ${req.url} not found`));

// ── ERROR HANDLER ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({ field: e.path, message: e.message }));
    return R.badRequest(res, 'Validation failed', errors);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return R.badRequest(res, `${field || 'Value'} already exists`);
  }
  return R.error(res, process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message, err.status || 500);
});

// ── START ──────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000');
httpServer.listen(PORT, async () => {
  console.log(`\n🚀 GU-Rizz server running on port ${PORT} [${process.env.NODE_ENV}]`);
  console.log(`📡 Socket.io ready`);
  console.log(`📖 Stories route: /api/stories`);
  if (process.env.TURN_SERVER_URL) console.log(`🌐 TURN server: ${process.env.TURN_SERVER_URL}`);
  await startAllCrons();
});

module.exports = { app, httpServer };

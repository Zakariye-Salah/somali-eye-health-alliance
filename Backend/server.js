// server.js (Socket.IO-enabled drop-in replacement)
// top of server.js (replace require('dotenv').config() if you added it in config)
require('dotenv').config();
const config = require('./config'); // <= NEW

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const jwt = require('jsonwebtoken');

// your existing routes
const authRoutes = require('./routes/auth');
const doctorsRoutes = require('./routes/doctors');
const newsRoutes = require('./routes/news');
const bookingsRoutes = require('./routes/bookings');
const contactRoutes = require('./routes/contact');
const newsletterRoutes = require('./routes/newsletter');
const messagesRoutes = require('./routes/messages');
const uploadsRoutes = require('./routes/uploads');

const imagesRoutes = require('./routes/images');
const adminUsersRoutes = require('./routes/adminUsers');
const donationsRouter = require('./routes/donations');
const helpRoutes = require('./routes/help');
const membershipRouter = require('./routes/memberships');
const opportunitiesRoutes = require('./routes/opportunities');

// mount developer contacts (public POST + admin endpoints)
const developerContactsRouter = require('./routes/developerContacts');
const User = require('./models/User'); // used for socket auth (optional; adjust path to your model if different)

const app = express();
const PORT = process.env.PORT || 4000;

// --- static image serving (your existing logic) ---
const IMAGES_DIR = path.resolve(__dirname, '..', 'Frontend', 'images');
if (!fs.existsSync(IMAGES_DIR)) {
  console.warn('IMAGES_DIR does not exist:', IMAGES_DIR);
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}
app.use('/images', (req, res, next) => {
  const imagesCors = process.env.IMAGES_CORS || '*';
  res.setHeader('Access-Control-Allow-Origin', imagesCors);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  next();
}, express.static(IMAGES_DIR, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'public, max-age=604800');
  }
}));

// --- security & headers (your existing helmet config with cross-origin fine tuning) ---
const allowedImageSrcs = ['\'self\'', 'data:', 'http:', 'https:'];
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      imgSrc: allowedImageSrcs,
      fontSrc: ["'self'", 'https:', 'data:'],
      connectSrc: ["'self'", 'http:', 'https:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS: allow env override or permit all in dev
const allowedFromEnv = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedFromEnv.length ? ((origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedFromEnv.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'), false);
  }) : true,
  credentials: true
}));

// disable etag and enforce no-store for /api
app.disable('etag');
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(cookieParser());
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);



// Serve uploads with permissive CORS for dev
const UPLOADS_DIR = path.join(__dirname, 'uploads');
app.use('/uploads', (req, res, next) => {
  const uploadsCors = process.env.UPLOADS_CORS || '*';
  res.setHeader('Access-Control-Allow-Origin', uploadsCors);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  next();
}, express.static(UPLOADS_DIR, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'public, max-age=604800');
  }
}));

// connect to DB
connectDB(process.env.MONGODB_URI).catch(err => {
  console.error('Failed to connect to DB:', err);
  process.exit(1);
});

// --- Attach routes (unchanged) ---
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/uploads', uploadsRoutes);

app.use('/api/images', imagesRoutes);
app.use('/api/admin', adminUsersRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/donations', donationsRouter);
app.use('/api/memberships', membershipRouter);
app.use('/api/opportunities', opportunitiesRoutes);



app.use('/api/developer-contact', developerContactsRouter);   // same router mounted here -> POST /api/developer-contact
app.use('/api/developer-contacts', developerContactsRouter);  // and here -> admin GET/DELETE /api/developer-contacts

app.get('/api/health', (req,res)=> res.json({ ok: true, ts: Date.now() }));
app.use(require('./middleware/errorHandler'));

// ---- HTTP server + Socket.IO ----
const server = http.createServer(app);

// Socket.IO server
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: allowedFromEnv.length ? allowedFromEnv : (process.env.CORS_ORIGIN || '*'),
    credentials: true
  },
  // pingInterval/pingTimeout can be tuned
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6 // adjust if sending larger payloads via socket
});

// attach io to app locals so routes can emit (existing help routes expect req.app.locals.io)
app.locals.io = io;

// ---- Socket authentication helper (uses centralized config) ----
const JWT_SECRET = config.JWT_SECRET;

async function verifySocketToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // optionally fetch user from DB for fresh data
    if (payload && payload.id) {
      try {
        const user = await User.findById(payload.id).select('-password').lean();
        return user || payload;
      } catch (e) {
        return payload;
      }
    }
    return payload;
  } catch (err) {
    // token invalid/expired
    return null;
  }
}


// ---- socket middleware: attach user if token passed ----
io.use(async (socket, next) => {
  try {
    // token can be passed in handshake.auth or handshake.query for older clients
    const token = socket.handshake.auth && socket.handshake.auth.token ? socket.handshake.auth.token :
                  (socket.handshake.query && socket.handshake.query.token ? socket.handshake.query.token : null);
    if (!token) return next(); // allow unauthenticated sockets for anon clients — policies below will handle authorization
    const user = await verifySocketToken(token);
    if (user) socket.user = user; // attach user object to socket
    return next();
  } catch (err) {
    console.error('socket auth error', err);
    return next(); // we intentionally don't block connection on token verification error here, but you can reject if you prefer
  }
});

// ---- socket connection logic ----
io.on('connection', (socket) => {
  // welcome log
  const sid = socket.id;
  console.log('socket connected', sid, socket.user ? `(user:${socket.user._id||socket.user.id})` : '(anon)');

  // If client authenticates as admin via token or sends identify event, join admins room
  if (socket.user && (socket.user.role && ['admin','superadmin'].includes(String(socket.user.role).toLowerCase()))) {
    socket.join('admins');
    console.log('socket joined admins:', sid);
  }

  // Allow client to join a conversation room explicitly
  // Clients may call socket.emit('join', { convId: '...' })
  socket.on('join', (data) => {
    try {
      const convId = data && data.convId;
      if (!convId) return;
      socket.join(String(convId));
      console.log('socket joined room', convId, 'socket', sid);
    } catch (e) { /* ignore */ }
  });

  // allow leaving
  socket.on('leave', (data) => {
    try {
      const convId = data && data.convId;
      if (!convId) return;
      socket.leave(String(convId));
    } catch(e){}
  });

  // identify (legacy client pattern) — support both handshake.auth and identify
  socket.on('identify', (payload) => {
    try {
      if (!payload) return;
      if (payload.role === 'admin') socket.join('admins');
      if (payload.convId) socket.join(String(payload.convId));
      if (payload.rooms && Array.isArray(payload.rooms)) {
        payload.rooms.forEach(r => { if (r) socket.join(String(r)); });
      }
    } catch (e) {}
  });

  // allow simple ping message for connectivity checks
  socket.on('ping-check', (cb) => {
    if (typeof cb === 'function') cb({ ok: true, now: Date.now() });
  });

  // simple event where admin can send message via socket (optional)
  // (In production prefer using HTTP API to persist messages and let routes emit socket events.)
  socket.on('admin.reply', async (data) => {
    // expected data: { convId: '...', text: '...' }
    // only allow if socket.user is admin
    try {
      if (!socket.user || !socket.user.role || !['admin','superadmin'].includes(String(socket.user.role).toLowerCase())) {
        return socket.emit('error', { message: 'Unauthorized to reply' });
      }
      const { convId, text } = data || {};
      if (!convId || !text) return;
      // It's better to call your existing HTTP endpoint to append message and save to DB.
      // But if you want to handle inline, you can import the Conversation model here and persist message then emit.
      // Example (lightweight):
      const Conversation = require('./models/HelpConversation');
      const conv = await Conversation.findById(convId);
      if (!conv) return socket.emit('error', { message: 'Conversation not found' });
      const msg = { sender: 'admin', text: String(text).trim(), senderName: socket.user.fullName || socket.user.name || null, createdAt: new Date(), status: 'sent' };
      conv.messages.push(msg);
      conv.unreadCount = 0;
      conv.updatedAt = new Date();
      await conv.save();
      // emit event to conversation room and admins
      io.to(String(conv._id)).emit('help.message', { message: msg, conversationId: conv._id });
      io.to('admins').emit('help.updated', { conversationId: conv._id, conversation: conv });
    } catch (err) {
      console.error('admin.reply error', err);
      socket.emit('error', { message: 'Server error' });
    }
  });

  // disconnect handler
  socket.on('disconnect', (reason) => {
    console.log('socket disconnected', sid, reason);
  });
});

// ---- start server ----
server.listen(PORT, ()=> {
  console.log(`Server running on port ${PORT} (env=${process.env.NODE_ENV||'development'})`);
});

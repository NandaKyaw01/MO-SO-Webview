const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const META_FILE = path.join(__dirname, 'uploads', 'metadata.json');
const STATE_FILE = path.join(__dirname, 'uploads', 'active-state.json');

// Ensure uploads folder exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Hardcoded Admin Credentials
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'maiifcs'
};

// Session Secret Management (persisted in uploads/.session_secret)
const SECRET_FILE = path.join(UPLOADS_DIR, '.session_secret');
let SESSION_SECRET = '';
try {
  if (fs.existsSync(SECRET_FILE)) {
    SESSION_SECRET = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  }
} catch (err) {
  console.error('Error reading session secret:', err);
}

if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(SECRET_FILE, SESSION_SECRET, 'utf-8');
  } catch (err) {
    console.error('Error writing session secret:', err);
  }
}

// Session Token Creation & Verification (HMAC-SHA256)
function createSessionToken(username) {
  const payload = {
    username,
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;

  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i].trim();
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.substring(0, eqIdx).trim();
    const val = pair.substring(eqIdx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

function getAuthToken(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies['admin_session']) {
    return cookies['admin_session'];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

function requireAdminAuth(req, res, next) {
  const token = getAuthToken(req);
  const session = verifySessionToken(token);
  if (session && session.username === ADMIN_CREDENTIALS.username) {
    req.user = session;
    return next();
  }

  // Browser navigation requests redirect to login
  const acceptHeader = req.headers.accept || '';
  if (acceptHeader.includes('text/html') || req.path === '/admin' || req.path === '/admin.html' || req.path === '/') {
    return res.redirect('/login');
  }

  // API calls return 401 Unauthorized
  return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
}

// Helpers for persistent metadata and active media state
function readMetadata() {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading metadata.json:', err);
  }
  return {};
}

function writeMetadata(data) {
  try {
    fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing metadata.json:', err);
  }
}

function readActiveState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading active-state.json:', err);
  }
  return null;
}

function writeActiveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing active-state.json:', err);
  }
}

// In-memory active media state
let activeMedia = readActiveState();

// Track connected clients
const connectedClients = new Map(); // socket.id -> { role: 'tv' | 'admin', ip: string }

function getStats() {
  let tvCount = 0;
  let adminCount = 0;
  for (const client of connectedClients.values()) {
    if (client.role === 'tv') tvCount++;
    if (client.role === 'admin') adminCount++;
  }
  return { tvCount, adminCount, totalCount: connectedClients.size };
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads with no-cache to guarantee 200 OK and prevent empty 304 responses
app.use('/uploads', express.static(UPLOADS_DIR, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Dedicated binary stream endpoint for TV and Admin that avoids IDM / Download Manager interception
app.get('/api/media-data/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Use application/octet-stream + inline to guarantee browser extensions (like IDM) don't intercept it
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// Authentication Endpoints
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    const token = createSessionToken(username);
    res.setHeader('Set-Cookie', `admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { username }
    });
  }
  return res.status(401).json({
    success: false,
    error: 'Invalid username or password'
  });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/me', (req, res) => {
  const token = getAuthToken(req);
  const session = verifySessionToken(token);
  if (session && session.username === ADMIN_CREDENTIALS.username) {
    return res.json({ authenticated: true, user: { username: session.username } });
  }
  return res.status(401).json({ authenticated: false });
});

// Friendly Routes (Registered BEFORE express.static to enforce auth protection)
app.get(['/login', '/login.html'], (req, res) => {
  const token = getAuthToken(req);
  const session = verifySessionToken(token);
  if (session && session.username === ADMIN_CREDENTIALS.username) {
    return res.redirect('/admin');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', (req, res) => {
  const token = getAuthToken(req);
  const session = verifySessionToken(token);
  if (session && session.username === ADMIN_CREDENTIALS.username) {
    return res.redirect('/admin');
  }
  return res.redirect('/login');
});

app.get(['/admin', '/admin.html'], requireAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get(['/tv', '/tv.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tv.html'));
});

// Serve public static frontend (CSS, JS, images, libs)
app.use(express.static(path.join(__dirname, 'public')));

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate clean safe filename with timestamp
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);
    const uniqueName = `${Date.now()}_${cleanBase}${ext}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  const isImage = file.mimetype.startsWith('image/');
  const isPdf = file.mimetype === 'application/pdf' || ext === '.pdf';

  if (allowedExts.includes(ext) && (isImage || isPdf)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (.jpg, .jpeg, .png, .webp) and PDF files (.pdf) are allowed!'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB max limit
  }
});

// Helper to determine media type
function getMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
  return 'unknown';
}

// API Routes

// 1. Upload File (Protected)
app.post('/api/upload', requireAdminAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const file = req.file;
    const mediaType = getMediaType(file.filename);
    const mediaInfo = {
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      type: mediaType,
      url: `/uploads/${file.filename}`,
      uploadedAt: new Date().toISOString()
    };

    // Store in metadata file
    const meta = readMetadata();
    meta[file.filename] = mediaInfo;
    writeMetadata(meta);

    // Notify admins of new file
    io.emit('library_update');

    return res.status(201).json({
      success: true,
      file: mediaInfo
    });
  });
});

// 2. Get Media Library (Protected)
app.get('/api/media', requireAdminAuth, (req, res) => {
  try {
    const meta = readMetadata();
    const files = fs.readdirSync(UPLOADS_DIR);
    
    const mediaList = [];

    for (const f of files) {
      if (f === 'metadata.json' || f === 'active-state.json' || f.startsWith('.')) continue;
      
      const filePath = path.join(UPLOADS_DIR, f);
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;

        const info = meta[f] || {
          filename: f,
          originalname: f,
          size: stat.size,
          type: getMediaType(f),
          url: `/uploads/${f}`,
          uploadedAt: stat.birthtime.toISOString()
        };

        const isActive = activeMedia && activeMedia.filename === f;

        mediaList.push({
          ...info,
          size: stat.size,
          isActive
        });
      } catch (e) {
        // Skip unreadable files
      }
    }

    // Sort by uploadedAt descending (newest first)
    mediaList.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    return res.json({
      success: true,
      media: mediaList,
      activeMedia
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Get Current Active Media (Public for TV Display / Status)
app.get('/api/active-media', (req, res) => {
  return res.json({
    success: true,
    activeMedia
  });
});

// 4. Set Active Media - Push to TV (Protected)
app.post('/api/active-media', requireAdminAuth, (req, res) => {
  const { filename } = req.body;

  if (!filename) {
    // Clear active media
    activeMedia = null;
    writeActiveState(null);
    io.emit('media_update', null);
    io.emit('library_update');
    return res.json({ success: true, activeMedia: null, message: 'TV screen cleared' });
  }

  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File not found on server' });
  }

  const meta = readMetadata();
  const fileInfo = meta[filename] || {
    filename,
    originalname: filename,
    type: getMediaType(filename),
    url: `/uploads/${filename}`
  };

  activeMedia = {
    filename: fileInfo.filename,
    originalname: fileInfo.originalname,
    type: fileInfo.type || getMediaType(filename),
    url: `/uploads/${filename}`,
    updatedAt: new Date().toISOString()
  };

  writeActiveState(activeMedia);

  // Broadcast to all connected clients (especially TVs)
  io.emit('media_update', activeMedia);
  // Also notify admins to update the "LIVE" badges
  io.emit('library_update');

  console.log(`[Broadcast] Active media updated: ${activeMedia.originalname} (${activeMedia.type})`);

  return res.json({
    success: true,
    activeMedia
  });
});

// 5. Delete Media (Protected)
app.delete('/api/media/:filename', requireAdminAuth, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(UPLOADS_DIR, filename);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from metadata
    const meta = readMetadata();
    delete meta[filename];
    writeMetadata(meta);

    // If this file was active, clear the screen
    if (activeMedia && activeMedia.filename === filename) {
      activeMedia = null;
      writeActiveState(null);
      io.emit('media_update', null);
    }

    io.emit('library_update');

    return res.json({ success: true, message: `Deleted ${filename}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Socket.io event handling
io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;
  connectedClients.set(socket.id, { role: 'unknown', ip: clientIp });

  // Send current active media immediately upon connection
  socket.emit('media_update', activeMedia);
  io.emit('stats_update', getStats());

  // Client identifies its role
  socket.on('register_client', (data) => {
    const role = data && data.role === 'tv' ? 'tv' : 'admin';
    connectedClients.set(socket.id, { role, ip: clientIp });
    io.emit('stats_update', getStats());
    console.log(`[Socket] Client ${socket.id} registered as '${role}' from ${clientIp}`);
  });

  // Push to TV directly via socket (Verify admin session)
  socket.on('set_active_media', (data) => {
    const cookies = parseCookies(socket.handshake.headers.cookie || '');
    const token = cookies['admin_session'];
    const session = verifySessionToken(token);
    if (!session || session.username !== ADMIN_CREDENTIALS.username) {
      console.warn(`[Socket] Unauthorized set_active_media attempt from client ${socket.id}`);
      return;
    }

    if (!data || !data.filename) {
      activeMedia = null;
      writeActiveState(null);
      io.emit('media_update', null);
      io.emit('library_update');
      return;
    }

    const filename = data.filename;
    const meta = readMetadata();
    const info = meta[filename] || {
      filename,
      originalname: filename,
      type: getMediaType(filename),
      url: `/uploads/${filename}`
    };

    activeMedia = {
      filename: info.filename,
      originalname: info.originalname,
      type: info.type || getMediaType(filename),
      url: `/uploads/${filename}`,
      updatedAt: new Date().toISOString()
    };

    writeActiveState(activeMedia);
    io.emit('media_update', activeMedia);
    io.emit('library_update');
  });

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id);
    io.emit('stats_update', getStats());
  });
});

// Helper to list LAN network IP addresses for TV connection
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log('====================================================');
  console.log('  DIGITAL SIGNAGE SYSTEM STARTED');
  console.log('====================================================');
  console.log(`  Admin Login:    http://localhost:${PORT}/login`);
  console.log(`  Admin Panel:    http://localhost:${PORT}/admin`);
  console.log(`  TV Client:      http://localhost:${PORT}/tv`);
  console.log(`  Credentials:    Username: admin | Password: maiifcs`);
  if (ips.length > 0) {
    console.log('----------------------------------------------------');
    console.log('  Network URLs (for TV / Remote Devices):');
    ips.forEach(ip => {
      console.log(`    TV Client:    http://${ip}:${PORT}/tv`);
      console.log(`    Admin Panel:  http://${ip}:${PORT}/admin`);
      console.log(`    Login Page:   http://${ip}:${PORT}/login`);
    });
  }
  console.log('====================================================');
});

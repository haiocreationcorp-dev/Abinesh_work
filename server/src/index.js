require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const assetRoutes = require('./routes/assets');
const comicRoutes = require('./routes/comics');
const adminRoutes = require('./routes/admin');
const teacherRoutes = require('./routes/teacher');
const studentRoutes = require('./routes/student');
const billingRoutes = require('./routes/billing');
const lightingPresetRoutes = require('./routes/lightingPresets');
const aiRoutes = require('./routes/ai');
const { errorHandler } = require('./middleware/errorHandler');
const { trackIP } = require('./middleware/presence');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure all upload subdirectories exist on startup
const UPLOAD_DIRS = ['characters', 'backgrounds', 'expressions', 'props', 'effects', 'costumes', 'bubbles', 'thumbnails', 'body-parts', 'submissions', 'avatars'];
UPLOAD_DIRS.forEach((dir) => {
  const dirPath = path.join(__dirname, '../uploads', dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// Allow localhost, any device on the same WiFi/LAN (192.168.x.x, 10.x.x.x), and Cloudflare Quick Tunnel URLs
const LAN_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):5173$/;
const TUNNEL_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin === process.env.CLIENT_URL || LAN_ORIGIN_PATTERN.test(origin) || TUNNEL_ORIGIN_PATTERN.test(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(trackIP); // record every request IP for the "active IPs" admin view

// Serve uploaded assets as static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/comics', comicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/lighting-presets', lightingPresetRoutes);
app.use('/api/ai', aiRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Serve the React client build in production (client/dist must exist)
const CLIENT_DIST = path.join(__dirname, '../../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // Catch-all: send index.html for any non-API route (SPA client-side routing)
  app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`BharathComic server running → http://localhost:${PORT}`);
});

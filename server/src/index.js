require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const assetRoutes = require('./routes/assets');
const comicRoutes = require('./routes/comics');
const adminRoutes = require('./routes/admin');
const lightingPresetRoutes = require('./routes/lightingPresets');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure all upload subdirectories exist on startup
const UPLOAD_DIRS = ['characters', 'backgrounds', 'expressions', 'props', 'effects', 'costumes', 'bubbles', 'thumbnails', 'body-parts'];
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded assets as static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/comics', comicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/lighting-presets', lightingPresetRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`BharathComic server running → http://localhost:${PORT}`);
});

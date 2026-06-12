const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const sign = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const safeUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt });

const gateCheck = (req, res) => {
  if (req.body.password !== process.env.SITE_GATE_PASSWORD) {
    return res.status(403).json({ error: 'Incorrect access password' });
  }
  res.json({ ok: true });
};

const register = async (req, res) => {
  const { email, password, name, gatePassword } = req.body;
  if (gatePassword !== process.env.SITE_GATE_PASSWORD) return res.status(403).json({ error: 'Incorrect access password' });
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, password: hashed, name } });
  res.status(201).json({ token: sign(user), user: safeUser(user) });
};

const login = async (req, res) => {
  const { email, password, gatePassword } = req.body;
  if (gatePassword !== process.env.SITE_GATE_PASSWORD) return res.status(403).json({ error: 'Incorrect access password' });
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: sign(user), user: safeUser(user) });
};

const me = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(safeUser(user));
};

module.exports = { register, login, me, gateCheck };

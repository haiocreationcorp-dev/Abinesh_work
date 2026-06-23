const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const sign = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, institutionId: user.institutionId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const safeUser = (u) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, institutionId: u.institutionId,
  institutionName: u.institution?.name,
  subscriptionActive: !u.institutionId || (!u.institution?.suspended && u.institution?.subscriptionExpiresAt && u.institution.subscriptionExpiresAt > new Date()),
  createdAt: u.createdAt,
});

const gateCheck = (req, res) => {
  if (req.body.password !== process.env.SITE_GATE_PASSWORD) {
    return res.status(403).json({ error: 'Incorrect access password' });
  }
  res.json({ ok: true });
};

// Public — lets the registration form know whether to render School or College fields
// before the user has authenticated. Deliberately returns nothing beyond name/type.
const institutionLookup = async (req, res) => {
  const institution = await prisma.institution.findUnique({ where: { code: req.params.code.trim().toUpperCase() } });
  if (!institution) return res.status(404).json({ error: 'Invalid institution code' });
  res.json({ name: institution.name, type: institution.type });
};

const register = async (req, res) => {
  const { email, password, name, gatePassword, loginType, institutionCode, role } = req.body;
  if (gatePassword !== process.env.SITE_GATE_PASSWORD) return res.status(403).json({ error: 'Incorrect access password' });
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  let data = { email, password: await bcrypt.hash(password, 10), name };

  if (loginType === 'institution') {
    if (!institutionCode || !['TEACHER', 'STUDENT'].includes(role)) {
      return res.status(400).json({ error: 'Institution code and role (teacher or student) are required' });
    }
    const institution = await prisma.institution.findUnique({ where: { code: institutionCode.trim().toUpperCase() } });
    if (!institution) return res.status(400).json({ error: 'Invalid institution code' });
    data = { ...data, role, institutionId: institution.id };

    if (role === 'STUDENT') {
      const { gradeLevel, section, rollNo, department, year } = req.body;
      if (institution.type === 'COLLEGE') {
        if (!department || !year || !rollNo) return res.status(400).json({ error: 'Department, year, and roll number are required' });
        data = { ...data, department, year, rollNo };
      } else {
        if (!gradeLevel || !section || !rollNo) return res.status(400).json({ error: 'Class/grade, section, and roll number are required' });
        data = { ...data, gradeLevel, section, rollNo };
      }
    }
  }
  // Any other loginType (or none) falls back to today's behavior: role defaults to USER, no institution.

  const user = await prisma.user.create({ data, include: { institution: true } });
  res.status(201).json({ token: sign(user), user: safeUser(user) });
};

const login = async (req, res) => {
  const { email, password, gatePassword } = req.body;
  if (gatePassword !== process.env.SITE_GATE_PASSWORD) return res.status(403).json({ error: 'Incorrect access password' });
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await prisma.user.findUnique({ where: { email }, include: { institution: true } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: sign(user), user: safeUser(user) });
};

const me = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { institution: true } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(safeUser(user));
};

module.exports = { register, login, me, gateCheck, institutionLookup };

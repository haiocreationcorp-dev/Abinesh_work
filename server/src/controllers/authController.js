const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const prisma = require('../config/prisma');

const AVATAR_DIR = path.join(__dirname, '../../uploads/avatars');

const sign = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, institutionId: user.institutionId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const safeUser = (u) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, institutionId: u.institutionId,
  institutionName: u.institution?.name,
  institutionType: u.institution?.type,
  avatarPath: u.avatarPath,
  disabled: u.disabled,
  subscriptionActive: !u.institutionId || (!u.institution?.suspended && u.institution?.subscriptionExpiresAt && u.institution.subscriptionExpiresAt > new Date()),
  createdAt: u.createdAt,
  // student academic fields
  gradeLevel: u.gradeLevel, section: u.section, rollNo: u.rollNo,
  department: u.department, year: u.year, gender: u.gender,
});

// Public — lets the registration form know whether to render School or College fields
// before the user has authenticated. Deliberately returns nothing beyond name/type.
const institutionLookup = async (req, res) => {
  const institution = await prisma.institution.findUnique({ where: { code: req.params.code.trim().toUpperCase() } });
  if (!institution) return res.status(404).json({ error: 'Invalid institution code' });
  res.json({ name: institution.name, type: institution.type });
};

const register = async (req, res) => {
  const { email, password, name, loginType, institutionCode, role } = req.body;
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
      const { gradeLevel, section, rollNo, department, year, gender } = req.body;
      if (institution.type === 'COLLEGE') {
        if (!department || !year || !rollNo) return res.status(400).json({ error: 'Department, year, and roll number are required' });
        data = { ...data, department, year, rollNo };
      } else {
        if (!gradeLevel || !section || !rollNo) return res.status(400).json({ error: 'Class/grade, section, and roll number are required' });
        data = { ...data, gradeLevel, section, rollNo };
      }
      if (gender && ['MALE', 'FEMALE', 'OTHER'].includes(gender)) data.gender = gender;
    }
  }
  // Any other loginType (or none) falls back to today's behavior: role defaults to USER, no institution.

  const user = await prisma.user.create({ data, include: { institution: true } });
  res.status(201).json({ token: sign(user), user: safeUser(user) });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await prisma.user.findUnique({ where: { email }, include: { institution: true } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.disabled) {
    return res.status(403).json({ error: 'This account has been disabled. Contact your administrator.' });
  }
  res.json({ token: sign(user), user: safeUser(user) });
};

const me = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { institution: true } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(safeUser(user));
};

// PATCH /api/auth/me — self-service profile update (name + student academic fields)
const updateProfile = async (req, res) => {
  const { name, gradeLevel, section, rollNo, department, year, gender } = req.body;
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });

  const data = {};
  if (name !== undefined) data.name = name.trim();
  // Student-only academic fields — only write if explicitly provided
  if (gradeLevel !== undefined) data.gradeLevel = gradeLevel || null;
  if (section !== undefined) data.section = section || null;
  if (rollNo !== undefined) data.rollNo = rollNo || null;
  if (department !== undefined) data.department = department || null;
  if (year !== undefined) data.year = year || null;
  if (gender !== undefined) data.gender = ['MALE', 'FEMALE', 'OTHER'].includes(gender) ? gender : null;

  const user = await prisma.user.update({ where: { id: req.user.id }, data, include: { institution: true } });
  res.json(safeUser(user));
};

// POST /api/auth/me/avatar — self-service profile photo upload, any logged-in role
const uploadAvatar = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
    const resized = await sharp(req.file.buffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
    const filename = `${uuidv4()}.webp`;
    fs.writeFileSync(path.join(AVATAR_DIR, filename), resized);
    const avatarPath = `/uploads/avatars/${filename}`;

    if (existing?.avatarPath) {
      try {
        const oldAbs = path.join(__dirname, '../..', existing.avatarPath.replace(/^\//, ''));
        if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
      } catch (_) { /* best-effort */ }
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarPath },
      include: { institution: true },
    });
    res.json(safeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Avatar upload failed' });
  }
};

module.exports = { register, login, me, institutionLookup, updateProfile, uploadAvatar };

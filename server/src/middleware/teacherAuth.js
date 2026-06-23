const auth = require('./auth');

const teacherAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'TEACHER') {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    next();
  });
};

module.exports = teacherAuth;

const auth = require('./auth');

const studentAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'STUDENT') {
      return res.status(403).json({ error: 'Student access required' });
    }
    next();
  });
};

module.exports = studentAuth;

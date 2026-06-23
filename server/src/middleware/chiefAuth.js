const auth = require('./auth');

const chiefAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'INSTITUTION_CHIEF') {
      return res.status(403).json({ error: 'Institution chief access required' });
    }
    next();
  });
};

module.exports = chiefAuth;

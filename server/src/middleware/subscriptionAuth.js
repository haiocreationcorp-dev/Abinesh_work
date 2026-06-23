const prisma = require('../config/prisma');

// Individual (USER) and ADMIN accounts have no institutionId and are never restricted.
// TEACHER/STUDENT accounts are blocked from write actions once their institution's
// subscription has lapsed — viewing/reading is never blocked by this middleware.
const requireActiveSubscription = async (req, res, next) => {
  if (!req.user.institutionId) return next();

  const institution = await prisma.institution.findUnique({ where: { id: req.user.institutionId } });
  const active = institution && !institution.suspended && institution.subscriptionExpiresAt && institution.subscriptionExpiresAt > new Date();
  if (!active) {
    return res.status(403).json({
      error: institution?.suspended
        ? "Your institution's access has been suspended by the administrator. Viewing is still available; editing is disabled."
        : "Your institution's subscription has expired. Viewing is still available; editing is disabled until renewal.",
      subscriptionExpired: true,
    });
  }
  next();
};

module.exports = requireActiveSubscription;

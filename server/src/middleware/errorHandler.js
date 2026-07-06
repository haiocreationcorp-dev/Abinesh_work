const errorHandler = (err, req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
};

// Wraps an async Express handler so any thrown error is forwarded to errorHandler
// instead of hanging the request (Express 4 doesn't auto-catch async errors).
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, asyncHandler };

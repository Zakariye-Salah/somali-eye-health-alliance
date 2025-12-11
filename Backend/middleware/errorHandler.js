// middleware/errorHandler.js
module.exports = function (err, req, res, next) {
  // simple error handler: logs to console and returns JSON
  console.error('[ERROR]', err && err.stack ? err.stack : err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const payload = { message };

  // include validation errors if provided by express-validator
  if (err.errors && Array.isArray(err.errors)) {
    payload.errors = err.errors;
  }

  // in development include stack
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }

  res.status(status).json(payload);
};

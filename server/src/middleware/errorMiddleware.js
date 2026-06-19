import logger from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  logger.error('Unhandled request error:', err);

  // MongoDB duplicate key error
  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern || err.keyValue || {}).join(', ') || 'field';
    return res.status(400).json({
      error: `A record with this ${fields} already exists.`,
    });
  }

  // Token errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Authentication token has expired.' });
  }

  // Zod schema validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors,
    });
  }

  // General fallback
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  return res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : message,
  });
}

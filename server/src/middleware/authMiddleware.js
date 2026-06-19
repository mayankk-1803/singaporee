import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/index.js';
import { serialize } from '../utils/mongo.js';
import logger from '../utils/logger.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication token is required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    // Verify user status in DB
    const user = serialize(await User.findById(decoded.userId));

    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ error: 'Your account has been suspended' });
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
    };

    next();
  } catch (error) {
    logger.warn('Authentication failure:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authorize(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt: User ${req.user.email} with role ${req.user.role} tried to access restricted route`);
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }

    next();
  };
}

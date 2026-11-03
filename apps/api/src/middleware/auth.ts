import { Request, Response, NextFunction } from 'express';
import { validateSession } from '../services/auth';

// Helper to parse cookies from header
function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, pair) => {
    const [key, ...vals] = pair.trim().split('=');
    if (key) acc[key] = decodeURIComponent(vals.join('='));
    return acc;
  }, {} as Record<string, string>);
}

export interface AuthenticatedRequest extends Request {
  user?: any;
  sessionToken?: string;
}

/**
 * Authentication guard middleware
 * Extracts token from HTTP-only cookie or Authorization Bearer header
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    let token = cookies['raktasetu_session'];

    // Fallback to Bearer token for API testing / programmatic clients
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required. Please sign in.',
          code: 'UNAUTHORIZED',
        },
      });
    }

    const session = await validateSession(token);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Session has expired or is invalid. Please sign in again.',
          code: 'SESSION_EXPIRED',
        },
      });
    }

    req.user = session.user;
    req.sessionToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

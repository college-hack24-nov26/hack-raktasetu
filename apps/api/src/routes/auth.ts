import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { config } from '../config/env';
import {
  normalizePhoneNumber,
  verifyDemoOtp,
  createSession,
  revokeSession,
} from '../services/auth';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

export const authRouter = Router();

/**
 * POST /api/v1/auth/demo-login
 * Body: { phoneNumber: string, otp: string }
 * Demo-only OTP login endpoint
 */
authRouter.post('/auth/demo-login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Phone number and verification code are required.',
          code: 'MISSING_CREDENTIALS',
        },
      });
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhoneNumber(phoneNumber);
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: {
          message: err.message,
          code: 'INVALID_PHONE_NUMBER',
        },
      });
    }

    // Verify demo OTP
    try {
      verifyDemoOtp(normalizedPhone, otp);
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: {
          message: err.message,
          code: 'INVALID_OTP',
        },
      });
    }

    // Find or create User by phone number
    let user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
      include: { donorProfile: true },
    });

    let isNewUser = false;
    if (!user) {
      user = await prisma.user.create({
        data: {
          phoneNumber: normalizedPhone,
          role: 'USER',
          status: 'ACTIVE',
        },
        include: { donorProfile: true },
      });
      isNewUser = true;

      // Log initial user creation
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_CREATED_DEMO_AUTH',
          resource: 'User',
          resourceId: user.id,
          metadata: { demoAuth: true },
        },
      });
    } else if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Account is deactivated or suspended. Please contact support.',
          code: 'ACCOUNT_INACTIVE',
        },
      });
    }

    // Create session in database
    const { token, expiresAt } = await createSession(user.id);

    // Set secure HTTP-only cookie
    const isProduction = config.nodeEnv === 'production';
    res.cookie('raktasetu_session', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          role: user.role,
          status: user.status,
          hasDonorProfile: Boolean(user.donorProfile),
        },
        token, // Provided for programmatic clients / mobile API
        isNewUser,
        demoModeNotice: 'Authenticated via demo-only OTP verification. Not a verified SMS delivery.',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/logout
 * Revokes current session and clears HTTP-only cookie
 */
authRouter.post('/auth/logout', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // If bearer or cookie token is present, revoke it
    let token = req.cookies?.['raktasetu_session'];
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (token) {
      await revokeSession(token);
    }

    res.clearCookie('raktasetu_session', { path: '/' });

    res.json({
      success: true,
      data: {
        message: 'Successfully logged out.',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/auth/me
 * Retrieves current authenticated user context
 */
authRouter.get('/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        name: user.name,
        role: user.role,
        status: user.status,
        hasDonorProfile: Boolean(user.donorProfile),
      },
    },
  });
});

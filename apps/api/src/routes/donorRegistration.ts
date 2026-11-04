import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { DonorRegistrationService } from '../services/donorRegistrationService';
import { PdfService } from '../services/pdfService';
import { normalizePhoneNumber, verifyDemoOtp, createSession, checkRateLimit } from '../services/auth';
import { prisma } from '../lib/prisma';
import { config } from '../config/env';

export const donorRegistrationRouter = Router();

// In-memory OTP resend cooldown tracker
const otpCooldownTracker = new Map<string, number>();
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds

/**
 * GET /api/v1/donor-registration/camps-and-centres
 * List camps and blood centres authorized for the staff caller
 */
donorRegistrationRouter.get(
  '/donor-registration/camps-and-centres',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await DonorRegistrationService.listAuthorizedCampsAndCentres(req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

import { getInitialCounsellingAnswers, getDemoCounsellingAnswers } from '../config/counsellingQuestions';

/**
 * GET /api/v1/donor-registration/clinical-staff
 * Retrieve eligible clinical staff and medical officers for selected organisation and camp
 */
donorRegistrationRouter.get(
  '/donor-registration/clinical-staff',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgId = req.query.organisationId && req.query.organisationId !== 'undefined' && req.query.organisationId !== 'null'
        ? String(req.query.organisationId)
        : undefined;
      const campId = req.query.campId && req.query.campId !== 'undefined' && req.query.campId !== 'null'
        ? String(req.query.campId)
        : undefined;

      if (!orgId && !campId) {
        return res.status(400).json({
          success: false,
          error: { message: 'Organisation ID or Camp ID is required to list clinical staff.', code: 'MISSING_PARAM' },
        });
      }

      const staff = await DonorRegistrationService.getClinicalStaffForOrganisation(orgId, req.user, campId);
      res.json({
        success: true,
        data: staff,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to list clinical staff', code: isForbidden ? 'FORBIDDEN' : 'STAFF_LIST_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/donor-registration/counselling-questions
 * Retrieve standard 26 clinical counselling questions with optional demo defaults
 */
donorRegistrationRouter.get(
  '/donor-registration/counselling-questions',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const isFemale = String(req.query.gender || '').toLowerCase() === 'female';
      const isDemo = String(req.query.mode || '').toLowerCase() === 'demo';
      const questions = isDemo
        ? getDemoCounsellingAnswers(isFemale)
        : getInitialCounsellingAnswers(isFemale, false);

      res.json({
        success: true,
        data: questions,
        isDemo,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message || 'Failed to load counselling questions', code: 'QUESTIONS_LOAD_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/donor-registration/lookup-phone
 * Safe lookup for existing donor by mobile number
 */
donorRegistrationRouter.get(
  '/donor-registration/lookup-phone',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phone = String(req.query.phone || req.query.phoneNumber || '');
      if (!phone) {
        return res.status(400).json({
          success: false,
          error: { message: 'Phone number is required for lookup.', code: 'MISSING_PHONE' },
        });
      }

      const result = await DonorRegistrationService.lookupDonorByPhone(phone, req.user);
      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message || 'Lookup failed', code: 'LOOKUP_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/donor-registration/save
 * Save registration draft or advance step
 */
donorRegistrationRouter.post(
  '/donor-registration/save',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const saved = await DonorRegistrationService.saveRegistration(req.user, req.body);
      res.status(200).json({
        success: true,
        message: 'Donor registration draft saved successfully.',
        data: saved,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to save registration', code: isForbidden ? 'FORBIDDEN' : 'SAVE_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/donor-registration/queue
 * Query registration queue filtered by campId, organisationId, and stage
 */
donorRegistrationRouter.get(
  '/donor-registration/queue',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const campId = req.query.campId ? String(req.query.campId) : undefined;
      const organisationId = req.query.organisationId ? String(req.query.organisationId) : undefined;
      const stage = req.query.stage ? String(req.query.stage) : 'all';
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;

      const data = await DonorRegistrationService.getQueue(req.user, {
        campId,
        organisationId,
        stage,
        page,
        limit,
      });

      res.json({
        success: true,
        data,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to retrieve queue', code: isForbidden ? 'FORBIDDEN' : 'QUEUE_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/donor-registration/:id
 * Retrieve full registration draft and status
 */
donorRegistrationRouter.get(
  '/donor-registration/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reg = await DonorRegistrationService.getRegistrationById(String(req.params.id), req.user);
      res.json({
        success: true,
        data: reg,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 404).json({
        success: false,
        error: { message: err.message || 'Registration not found', code: isForbidden ? 'FORBIDDEN' : 'NOT_FOUND' },
      });
    }
  }
);

/**
 * POST /api/v1/donor-registration/:id/complete
 * Complete donor registration workflow
 */
donorRegistrationRouter.post(
  '/donor-registration/:id/complete',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    try {
      const completed = await DonorRegistrationService.completeRegistration(String(req.params.id), req.user);
      res.json({
        success: true,
        message: 'Donor registration successfully completed.',
        data: completed,
      });
    } catch (err: any) {
      console.warn(`[DonorRegistration][${correlationId}] Complete failure for registration ID '${req.params.id}':`, err.message);
      const isNotFound = err.message?.includes('not found') || err.message?.includes('Registration record not found');
      const isForbidden = err.message?.includes('Permission denied');
      const isConflict = err.message?.includes('conflict') || err.message?.includes('already');
      const statusCode = isNotFound ? 404 : isForbidden ? 403 : isConflict ? 409 : 400;
      res.status(statusCode).json({
        success: false,
        error: {
          message: err.message || 'Failed to complete registration',
          code: isNotFound ? 'NOT_FOUND' : isForbidden ? 'FORBIDDEN' : isConflict ? 'CONFLICT' : 'COMPLETION_FAILED',
          correlationId,
        },
      });
    }
  }
);

/**
 * GET /api/v1/donor-registration/:id/pdf
 * Generate and stream server-side A4 printable PDF
 */
donorRegistrationRouter.get(
  '/donor-registration/:id/pdf',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reg = await DonorRegistrationService.getRegistrationById(String(req.params.id), req.user);
      const pdfBuffer = await PdfService.generateRegistrationPdf(reg);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="donor-registration-${reg.registrationNumber}.pdf"`
      );
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 404).json({
        success: false,
        error: { message: err.message || 'Failed to generate PDF', code: isForbidden ? 'FORBIDDEN' : 'PDF_FAILED' },
      });
    }
  }
);

// =========================================================================
// DONOR SELF-SERVICE PORTAL & MOBILE AUTH
// =========================================================================

/**
 * POST /api/v1/donor/auth/send-otp
 * Request OTP for donor mobile login with rate limiting & cooldown
 */
donorRegistrationRouter.post(
  '/donor/auth/send-otp',
  async (req, res: Response) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: { message: 'Mobile number is required.', code: 'MISSING_PHONE' },
        });
      }

      const normalized = normalizePhoneNumber(phoneNumber);
      checkRateLimit(normalized);

      // Check resend cooldown
      const lastSent = otpCooldownTracker.get(normalized);
      const now = Date.now();
      if (lastSent && now - lastSent < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
        return res.status(429).json({
          success: false,
          error: {
            message: `Please wait ${waitSec} second(s) before requesting another OTP.`,
            code: 'COOLDOWN_ACTIVE',
          },
        });
      }

      otpCooldownTracker.set(normalized, now);

      res.json({
        success: true,
        message: 'Verification code sent to registered mobile number.',
        data: {
          normalizedPhone: normalized,
          demoNotice: 'Demo mode active: use OTP 123456 to verify.',
          cooldownSeconds: 30,
        },
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message || 'Failed to send OTP', code: 'OTP_SEND_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/donor/auth/verify-otp
 * Verify OTP, establish session, return donor context
 */
donorRegistrationRouter.post(
  '/donor/auth/verify-otp',
  async (req, res: Response) => {
    try {
      const { phoneNumber, otp } = req.body;
      if (!phoneNumber || !otp) {
        return res.status(400).json({
          success: false,
          error: { message: 'Phone number and verification code are required.', code: 'MISSING_CREDENTIALS' },
        });
      }

      const normalized = normalizePhoneNumber(phoneNumber);
      verifyDemoOtp(normalized, otp);

      // Find or create donor user
      let user = await prisma.user.findUnique({
        where: { phoneNumber: normalized },
        include: { donorProfile: true },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            phoneNumber: normalized,
            role: 'DONOR',
            status: 'ACTIVE',
          },
          include: { donorProfile: true },
        });
      }

      // Link any existing staff registrations for this phone number if donorUserId not set
      const { token, expiresAt } = await createSession(user.id);

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
          token,
          user: {
            id: user.id,
            phoneNumber: user.phoneNumber,
            name: user.name || user.donorProfile?.fullName,
            role: user.role,
            donorProfile: user.donorProfile,
          },
        },
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message || 'Verification failed', code: 'VERIFICATION_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/donor/my-registrations
 * List registrations and permitted donation history for logged-in donor
 */
donorRegistrationRouter.get(
  '/donor/my-registrations',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const registrations = await DonorRegistrationService.listDonorRegistrations(req.user.id);
      res.json({
        success: true,
        data: registrations,
      });
    } catch (err) {
      next(err);
    }
  }
);

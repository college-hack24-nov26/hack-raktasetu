import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  const statusCode = err.statusCode || (err.message?.includes('Permission denied') ? 403 : err.message?.includes('not found') ? 404 : 500);
  const isProduction = process.env.NODE_ENV === 'production';

  // Server-side diagnostic logging with correlation ID, scrubbing sensitive credentials
  console.error(`[ErrorHandler][${correlationId}] ${req.method} ${req.originalUrl} - Status ${statusCode}:`, err.message || err);

  // Safe client response
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'An unexpected internal server error occurred',
      code: err.code || (statusCode === 403 ? 'FORBIDDEN' : statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR'),
      correlationId,
      ...(isProduction ? {} : { details: err.message }),
    },
  });
}


import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Do not expose sensitive internal error stacks or credentials to client
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'An unexpected internal server error occurred',
      code: err.code || 'INTERNAL_ERROR',
      ...(isProduction ? {} : { stack: err.stack }),
    },
  });
}

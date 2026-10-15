import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../../config/env.js';
import { HttpException } from '../exceptions/http.exception.js';
import { getLogContext } from '../logger/context.js';
import { logger } from '../logger/logger.js';
import { captureServerError } from '../../modules/errors/error-tracker.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpException) {
    res.status(err.statusCode).json({ success: false, message: err.message, errors: err.errors, code: err.code });
    return;
  }

  if (err instanceof ZodError) {
    const errors = err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
    res.status(400).json({ success: false, message: errors[0]?.message ?? 'Validation failed', errors });
    return;
  }

  // File uploads (multer): too large, too many files, ...
  if (err?.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${env.storage.maxFileMb} MB)` : `Upload error: ${err.message}`;
    res.status(400).json({ success: false, message });
    return;
  }

  // Malformed JSON body
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'Invalid JSON body' });
    return;
  }

  // Unexpected error: log full details, return a safe message with the request id for support
  const requestId = getLogContext()?.requestId;
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err?.message ?? err}`, {
    stack: err?.stack,
    code: err?.code,
    requestId,
  });
  res.status(500).json({ success: false, message: 'Internal server error', requestId });
  // …and record it in the production error inbox (grouped, with the request's SQL) — after responding
  void captureServerError(err, req);
};

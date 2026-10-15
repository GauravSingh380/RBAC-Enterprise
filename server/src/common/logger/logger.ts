// Application logger (winston)
//
//   Console : development -> one readable line per API call (+ its SQL queries), see console-format.ts
//             production  -> JSON (for log collectors)
//   Files   : logs/app-YYYY-MM-DD.log    -> everything (JSON, 14 days)
//             logs/http-YYYY-MM-DD.log   -> API request/response + SQL queries (JSON, 14 days)
//             logs/error-YYYY-MM-DD.log  -> errors only (JSON, 30 days)
//
// Levels (low number = more important): error, warn, info, http, verbose, debug
// Set LOG_LEVEL in .env to control how much is written.
import path from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { env } from '../../config/env.js';
import { formatConsoleLine } from './console-format.js';
import { getLogContext } from './context.js';

const { combine, timestamp, errors, json, printf } = winston.format;

// Adds requestId / userId of the current request to every log entry
const addRequestContext = winston.format((info) => {
  const ctx = getLogContext();
  if (ctx) {
    info.requestId ??= ctx.requestId;
    if (ctx.userId !== undefined) info.userId ??= ctx.userId;
    if (ctx.organizationId !== undefined) info.organizationId ??= ctx.organizationId;
  }
  return info;
});

// Keeps only the entries produced by the HTTP logger middleware
const onlyHttp = winston.format((info) => (info.type === 'http' ? info : false));

// Console shows one line per API call (the response), so drop the separate "request" entry
const skipHttpRequestLine = winston.format((info) =>
  info.type === 'http' && info.direction === 'request' ? false : info,
);

const baseFormat = combine(errors({ stack: true }), addRequestContext(), timestamp());

interface FileOptions {
  level?: string;
  maxFiles?: string;
  format?: winston.Logform.Format;
}

const fileTransport = (name: string, options: FileOptions = {}) =>
  new DailyRotateFile({
    dirname: path.resolve(env.log.dir),
    filename: `${name}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    ...options,
  });

export const logger = winston.createLogger({
  level: env.log.level,
  defaultMeta: { service: 'team-flex-api', env: env.nodeEnv },
  format: combine(baseFormat, json()),
  transports: [
    new winston.transports.Console({
      format: env.isProduction
        ? combine(baseFormat, json())
        : combine(baseFormat, skipHttpRequestLine(), printf(formatConsoleLine)),
    }),
    fileTransport('app'),
    fileTransport('http', { format: combine(onlyHttp(), baseFormat, json()) }),
    fileTransport('error', { level: 'error', maxFiles: '30d' }),
  ],
  exitOnError: false,
});

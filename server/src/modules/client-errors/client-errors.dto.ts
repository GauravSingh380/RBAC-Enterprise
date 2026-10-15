import { z } from 'zod';

export const clientErrorSchema = z.object({
  errorId: z.string().uuid(),
  source: z.enum(['boundary', 'router', 'window', 'promise']),
  name: z.string().max(200).optional(),
  message: z.string().max(1000),
  stack: z.string().max(8000).optional(),
  componentStack: z.string().max(8000).optional(),
  url: z.string().max(2000),
  userAgent: z.string().max(500).optional(),
  /** app version of the bundle that crashed */
  release: z.string().max(50).optional(),
});

export type ClientErrorDto = z.infer<typeof clientErrorSchema>;

import type { Request } from 'express';
import { z } from 'zod';

const projectRefSchema = z.string().regex(/^([A-Za-z][A-Za-z0-9]{1,9}|\d+)$/, 'Invalid project');

/** :projectRef in the URL — numeric id or project key ("TF"). */
export const projectRefOf = (req: Request) => projectRefSchema.parse(req.params.projectRef);

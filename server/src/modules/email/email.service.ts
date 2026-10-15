// Sending email = 2 steps:
//   1. queueEmail(): render the template, store it in email_messages and enqueue an "email.send" job.
//      Pass the transaction client so the email only exists if the business change commits.
//   2. The background worker runs sendQueuedEmail() — slow SMTP never blocks an API request,
//      and failed deliveries are retried automatically.
import { db, type Queryable } from '../../database/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../common/logger/logger.js';
import { enqueue } from '../../jobs/queue.js';
import { defineJob } from '../../jobs/worker.js';
import { deliver } from './email.transport.js';
import { templates, type TemplateData, type TemplateName } from './email.templates.js';

export const EMAIL_QUEUE = 'email.send';

export async function queueEmail<K extends TemplateName>(
  input: { to: string; template: K; data: TemplateData<K>; organizationId?: number | null },
  executor: Queryable = db,
): Promise<number> {
  const rendered = (templates[input.template] as (d: TemplateData<K>) => { subject: string; html: string; text: string })(input.data);
  const { rows } = await executor.query<{ id: number }>(
    `INSERT INTO email_messages (organization_id, to_address, subject, template, html, text, driver)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::int`,
    [input.organizationId ?? null, input.to, rendered.subject, input.template, rendered.html, rendered.text, env.email.driver],
  );
  const emailId = rows[0]!.id;
  await enqueue(EMAIL_QUEUE, { emailId }, { executor, organizationId: input.organizationId ?? null });
  return emailId;
}

/** Job handler: delivers one stored email. Throws to let the worker retry. */
export async function sendQueuedEmail(emailId: number, finalAttempt: boolean): Promise<void> {
  const { rows } = await db.query<{ id: number; to: string; subject: string; html: string | null; text: string | null; status: string }>(
    'SELECT id::int, to_address AS "to", subject, html, text, status FROM email_messages WHERE id = $1',
    [emailId],
  );
  const email = rows[0];
  if (!email || email.status === 'sent') return; // nothing to do (deleted or already delivered)

  try {
    const result = await deliver({ to: email.to, subject: email.subject, html: email.html ?? '', text: email.text ?? '' });
    // In production don't keep bodies around: they can contain live links (password reset, invitations)
    const clearBody = env.isProduction && env.email.driver !== 'outbox';
    await db.query(
      `UPDATE email_messages
          SET status = 'sent', sent_at = NOW(), attempts = attempts + 1, error = NULL,
              provider_message_id = $2, preview_url = $3,
              html = CASE WHEN $4 THEN NULL ELSE html END, text = CASE WHEN $4 THEN NULL ELSE text END
        WHERE id = $1`,
      [emailId, result.messageId, result.previewUrl, clearBody],
    );

    const where =
      env.email.driver === 'outbox' ? 'view it in Platform → Mailbox' : result.previewUrl ? `preview: ${result.previewUrl}` : `via ${env.email.driver}`;
    logger.info(`📧 Email "${email.subject}" to ${email.to} — ${where}`, { emailId });
  } catch (err) {
    await db.query(
      `UPDATE email_messages SET attempts = attempts + 1, error = $2, status = CASE WHEN $3 THEN 'failed' ELSE status END WHERE id = $1`,
      [emailId, (err as Error).message.slice(0, 1000), finalAttempt],
    );
    throw err;
  }
}

defineJob<{ emailId: number }>(EMAIL_QUEUE, (payload, job) => sendQueuedEmail(payload.emailId, job.attempts >= job.maxAttempts));

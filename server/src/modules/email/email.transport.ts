// Email delivery drivers (EMAIL_DRIVER):
//   outbox   — nothing leaves the machine; messages are only stored and shown in Platform → Mailbox
//   ethereal — free fake SMTP by Nodemailer: no signup, each email gets a web preview URL
//   smtp     — any real provider (Brevo / Mailgun / SES / Gmail app password ...).
//              With a real provider you can send to disposable inboxes like @yopmail.com to test.
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../common/logger/logger.js';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface DeliveryResult {
  messageId: string | null;
  previewUrl: string | null;
}

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  if (env.email.driver === 'ethereal') {
    const account = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
    logger.info(`Ethereal test mailbox ready — log in at https://ethereal.email with ${account.user} / ${account.pass}`);
  } else {
    if (!env.email.smtp.host) throw new Error('EMAIL_DRIVER=smtp requires SMTP_HOST');
    transporter = nodemailer.createTransport({
      host: env.email.smtp.host,
      port: env.email.smtp.port,
      secure: env.email.smtp.secure,
      auth: env.email.smtp.user ? { user: env.email.smtp.user, pass: env.email.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function deliver(email: OutgoingEmail): Promise<DeliveryResult> {
  if (env.email.driver === 'outbox') {
    return { messageId: null, previewUrl: null };
  }

  const transport = await getTransporter();
  const info = await transport.sendMail({ from: env.email.from, ...email });
  const preview = env.email.driver === 'ethereal' ? nodemailer.getTestMessageUrl(info) : false;
  return { messageId: info.messageId ?? null, previewUrl: preview || null };
}

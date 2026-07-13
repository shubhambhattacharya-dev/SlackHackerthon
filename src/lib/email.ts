import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (transport) {
    return transport;
  }

  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return transport;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const { to, subject, body, html, cc, bcc, replyTo } = options;

  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error('Recipient address is required');
  }

  if (!subject) {
    throw new Error('Subject is required');
  }

  try {
    const info = await getTransport().sendMail({
      from: `"Amnesia Agent" <${config.smtp.user}>`,
      to,
      cc,
      bcc,
      replyTo,
      subject,
      text: body,
      html: html ?? body,
    });

    logger.info({ to, subject, messageId: info.messageId }, 'Email sent');
  } catch (error) {
    logger.error({ to, subject, error }, 'Failed to send email');
    throw error;
  }
}

export async function verifyConnection(): Promise<boolean> {
  try {
    await getTransport().verify();
    logger.info('SMTP connection verified');
    return true;
  } catch (error) {
    logger.error({ error }, 'SMTP connection failed');
    return false;
  }
}

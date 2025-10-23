// server/src/services/mail.service.js
import nodemailer from 'nodemailer';

let transporter;
let verified = false;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
    tls: {
      minVersion: 'TLSv1.2',
      servername: host,
    },
  });
  return transporter;
}

export async function sendMail({ to, subject, html, text }) {
  if (!to) throw new Error('Missing recipient email');
  const from = process.env.SMTP_FROM || 'Zuperior <noreply@zuperior.com>';
  const tx = getTransporter();
  try {
    if (!verified) {
      await tx.verify();
      verified = true;
    }
  } catch (e) {
    console.warn('SMTP verify failed (will attempt send anyway):', e?.message || e);
  }
  try {
    await tx.sendMail({ from, to, subject, html, text });
  } catch (err) {
    console.error('SMTP send failed:', {
      code: err?.code,
      command: err?.command,
      response: err?.response,
      message: err?.message,
    });
    throw err;
  }
}

// Convenience wrapper for templates
export async function sendTemplate({ to, subject, html }) {
  return sendMail({ to, subject, html, text: html?.replace(/<[^>]+>/g, '') });
}

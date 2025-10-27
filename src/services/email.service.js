import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter;

const getEnv = (key, fallback) => {
  const value = process.env[key];
  return typeof value === 'undefined' || value === null || value === ''
    ? fallback
    : value;
};

const getBooleanFromEnv = (key, fallback) => {
  const value = getEnv(key, undefined);
  if (typeof value === 'undefined') return fallback;
  return value.toLowerCase() === 'true';
};

const buildTransporter = () => {
  const host = getEnv('SMTP_HOST');
  const port = parseInt(getEnv('SMTP_PORT', '587'), 10);
  const secure = getBooleanFromEnv('SMTP_SECURE', port === 465);
  const user = getEnv('SMTP_USER');
  const pass = getEnv('SMTP_PASS');

  if (!host) {
    console.warn('⚠️ SMTP host not configured; email sending disabled.');
    return null;
  }

  const transportConfig = {
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  };

  console.log('📡 Initialising SMTP transporter', {
    host,
    port,
    secure,
    hasAuth: !!transportConfig.auth,
  });

  return nodemailer.createTransport(transportConfig);
};

const getTransporter = () => {
  if (!transporter) {
    transporter = buildTransporter();
  }
  return transporter;
};

/**
 * Sends an email using the configured SMTP transporter.
 * @param {Object} params
 * @param {string|string[]} params.to - Recipient email address(es).
 * @param {string} params.subject - Email subject.
 * @param {string} params.text - Plain text body.
 * @param {string} params.html - HTML body.
 */
export const sendEmail = async ({ to, subject, text, html, attachments } = {}) => {
  const transporterInstance = getTransporter();

  if (!transporterInstance) {
    console.error('🚫 sendEmail aborted: SMTP transporter not configured.');
    throw new Error('SMTP configuration is missing; cannot send email.');
  }

  if (!to) {
    throw new Error('Recipient email address is required.');
  }

  console.log('📨 Sending email', {
    to,
    subject,
  });

  try {
    const from =
      getEnv('SMTP_FROM') ||
      getEnv('SMTP_USER') ||
      'no-reply@example.com';

    const result = await transporterInstance.sendMail({
      from,
      to,
      subject,
      text,
      html,
      attachments,
    });

    console.log('✅ Email dispatch succeeded', {
      to,
      messageId: result?.messageId,
      accepted: result?.accepted,
      response: result?.response,
      envelope: result?.envelope,
    });

    return result;
  } catch (error) {
    console.error('❌ Email dispatch failed', {
      to,
      subject,
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
    });
    throw error;
  }
};

/**
 * Sends an MT5 account creation email with account credentials.
 * @param {Object} params
 * @param {string} params.to - Recipient email address.
 * @param {string} [params.userName] - Name of the recipient.
 * @param {string} [params.accountName] - Label/name used for the MT5 account.
 * @param {string|number} params.login - MT5 login ID.
 * @param {string} [params.group] - MT5 group assigned to the account.
 * @param {number|string} [params.leverage] - MT5 leverage for the account.
 * @param {string} params.masterPassword - Master password for the account.
 * @param {string} params.investorPassword - Investor password for the account.
 */
export const sendMt5AccountEmail = async ({
  to,
  userName,
  accountName,
  login,
  group,
  leverage,
  masterPassword,
  investorPassword,
}) => {
  const recipientName = userName || 'Trader';
  const subject = 'Your MT5 trading account is ready';
  const fromDisplay = getEnv('SMTP_FROM', 'Zuperior');

  console.log('📧 Preparing MT5 account email', {
    to,
    login,
    accountName,
  });

  const plainText = [
    `Hi ${recipientName},`,
    '',
    'Your new MT5 trading account has been created successfully. Keep the credentials below secured:',
    '',
    `Login: ${login}`,
    accountName ? `Account Name: ${accountName}` : null,
    group ? `Group: ${group}` : null,
    leverage ? `Leverage: ${leverage}` : null,
    masterPassword ? `Master Password: ${masterPassword}` : null,
    investorPassword ? `Investor Password: ${investorPassword}` : null,
    '',
    'You can now sign in to the MT5 platform and start trading.',
    '',
    'Best regards,',
    fromDisplay,
  ]
    .filter(Boolean)
    .join('\n');

  const brandPrimary = '#6242a5';
  const brandPrimaryAlt = '#9f8bcf';
  const textColor = '#1f2937';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';
  const bgColor = '#f9fafb';

  // Logo URL handling: allow override via EMAIL_LOGO_URL, else fallback to `${CLIENT_URL}/logo.png`

  const detailRow = (label, value) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid ${borderColor};font-weight:600;white-space:nowrap;color:${textColor}">${label}</td>
        <td style="padding:12px 16px;border-bottom:1px solid ${borderColor};color:${textColor}">${value}</td>
      </tr>`;

  const detailsRows = [
    detailRow('Login', login),
    accountName ? detailRow('Account Name', accountName) : '',
    group ? detailRow('Group', group) : '',
    leverage ? detailRow('Leverage', `1:${leverage}`) : '',
    masterPassword ? detailRow('Master Password', masterPassword) : '',
    investorPassword ? detailRow('Investor Password', investorPassword) : '',
  ].join('');

  const dashboardUrl = getEnv('CLIENT_URL', 'https://dashboard.zuperior.com');
  const explicitLogo = getEnv('EMAIL_LOGO_URL');
  let logoUrl = explicitLogo || `${dashboardUrl?.replace(/\/$/, '')}/logo.png`;
  // If someone accidentally concatenated the host twice (e.g. http://host/http://host/_next/image?...), keep the trailing URL
  logoUrl = logoUrl.replace(/https?:\/\/[^/]+\/(https?:\/\/.*)/, '$1');
  const html = `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${bgColor};padding:24px 0;">
    <tr>
      <td align="center" style="padding:0 12px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
          <tr>
            <td style="background:linear-gradient(90deg, ${brandPrimary}, ${brandPrimaryAlt});padding:24px 24px;">
              <div style="display:flex;align-items:center;gap:10px">
                <img alt="Zuperior" src="${logoUrl}" style="height:28px;border:0;outline:none;display:block" />
                <div style="font-size:20px;line-height:28px;color:#fff;font-weight:700;">Zuperior</div>
              </div>
              <div style="font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;">MT5 Account Created</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px 24px;color:${textColor};">
              <div style="font-size:16px;line-height:24px;font-weight:600;">Hi ${recipientName},</div>
              <p style="margin:8px 0 0 0;color:${mutedColor};font-size:14px;line-height:22px;">
                Your new MT5 trading account has been created successfully. Keep these credentials safe.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
                <tbody>
                  ${detailsRows}
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 24px 28px 24px;">
              <a href="${dashboardUrl}" style="display:inline-block;background:${brandPrimary};background-image:linear-gradient(90deg, ${brandPrimary}, ${brandPrimaryAlt});color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:10px;">Open Dashboard</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px 24px;color:${mutedColor};font-size:12px;line-height:20px;">
              If you didn’t request this account, please contact support immediately.
            </td>
          </tr>
          <tr>
            <td style="background:#fafafa;padding:14px 24px;color:${mutedColor};font-size:12px;line-height:18px;border-top:1px solid ${borderColor};">
              © ${new Date().getFullYear()} Zuperior. All rights reserved
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

  const sendResult = await sendEmail({
    to,
    subject,
    text: plainText,
    html,
  });

  console.log('📧 MT5 account email sent', {
    to,
    login,
    messageId: sendResult?.messageId,
    accepted: sendResult?.accepted,
    response: sendResult?.response,
  });

  return sendResult;
};

export default {
  sendEmail,
  sendMt5AccountEmail,
};

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
 * @param {number|string} [params.leverage] - MT5 leverage for the account.
 * @param {string} params.masterPassword - Master password for the account.
 * @param {string} [params.accountType] - Type of account (Demo/Live).
 */
export const sendMt5AccountEmail = async ({
  to,
  userName,
  accountName,
  login,
  leverage,
  masterPassword,
  accountType = accountType,
}) => {
  const recipientName = userName || 'Trader';
  const subject = `Your ${accountType} MT5 trading account is ready`;
  const fromDisplay = getEnv('SMTP_FROM', 'Zuperior');

  console.log('📧 Preparing MT5 account email', {
    to,
    login,
    accountName,
    accountType,
  });

  const plainText = [
    `Hi ${recipientName},`,
    '',
    `Your new ${accountType} MT5 trading account has been created successfully. Keep the credentials below secured:`,
    '',
    `Login: ${login}`,
    accountName ? `Account Name: ${accountName}` : null,
    leverage ? `Leverage: ${leverage}` : null,
    masterPassword ? `Master Password: ${masterPassword}` : null,
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
    detailRow('Account Type', accountType),
    detailRow('Login', login),
    accountName ? detailRow('Account Name', accountName) : '',
    leverage ? detailRow('Leverage', `1:${leverage}`) : '',
    masterPassword ? detailRow('Password', masterPassword) : '',
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
              <div style="font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;">${accountType} MT5 Account Created</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px 24px;color:${textColor};">
              <div style="font-size:16px;line-height:24px;font-weight:600;">Hi ${recipientName},</div>
              <p style="margin:8px 0 0 0;color:${mutedColor};font-size:14px;line-height:22px;">
                Your new ${accountType} MT5 trading account has been created successfully. Keep these credentials safe.
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

/**
 * Sends a deposit request created confirmation email.
 */
export const sendDepositCreatedEmail = async ({ to, userName, accountLogin, amount, date }) => {
  const recipientName = userName || 'Trader';
  const subject = 'Deposit Request Created';
  const fromDisplay = getEnv('SMTP_FROM', 'Zuperior');

  const fDate = (() => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleString();
    } catch {
      return String(date);
    }
  })();

  const plainText = [
    `Hi ${recipientName},`,
    '',
    'We have received your deposit request. Here are the details:',
    '',
    `Account: ${accountLogin}`,
    `Amount: ${amount}`,
    `Date: ${fDate}`,
    '',
    'Our team will process your deposit and notify you once it is completed.',
    '',
    'Best regards,',
    fromDisplay,
  ].join('\n');

  const brandPrimary = '#6242a5';
  const brandPrimaryAlt = '#9f8bcf';
  const textColor = '#1f2937';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';
  const bgColor = '#f9fafb';

  const explicitLogo = getEnv('EMAIL_LOGO_URL');
  const clientBase = getEnv('CLIENT_URL', 'https://dashboard.zuperior.com');
  let logoUrl = explicitLogo || `${clientBase.replace(/\/$/, '')}/logo.png`;
  logoUrl = logoUrl.replace(/https?:\/\/[^/]+\/(https?:\/\/.*)/, '$1');

  const rows = [
    ['Account', accountLogin],
    ['Amount', amount],
    ['Date', fDate],
  ]
    .map(
      ([k, v]) => `
      <tr>
        <td style=\"padding:12px 16px;border-bottom:1px solid ${borderColor};font-weight:600;white-space:nowrap;color:${textColor}\">${k}</td>
        <td style=\"padding:12px 16px;border-bottom:1px solid ${borderColor};color:${textColor}\">${v}</td>
      </tr>`
    )
    .join('');

  const dashboardUrl = clientBase;
  const html = `
  <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:${bgColor};padding:24px 0;\">
    <tr>
      <td align=\"center\" style=\"padding:0 12px;\">
        <table role=\"presentation\" width=\"640\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;\">
          <tr>
            <td style=\"background:linear-gradient(90deg, ${brandPrimary}, ${brandPrimaryAlt});padding:24px 24px;\">
              <div style=\"display:flex;align-items:center;gap:10px\">
                <img alt=\"Zuperior\" src=\"${logoUrl}\" style=\"height:28px;border:0;outline:none;display:block\" />
                <div style=\"font-size:20px;line-height:28px;color:#fff;font-weight:700;\">Zuperior</div>
              </div>
              <div style=\"font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;\">Deposit Request Created</div>
            </td>
          </tr>
          <tr>
            <td style=\"padding:24px 24px 8px 24px;color:${textColor};\">
              <div style=\"font-size:16px;line-height:24px;font-weight:600;\">Hi ${recipientName},</div>
              <p style=\"margin:8px 0 0 0;color:${mutedColor};font-size:14px;line-height:22px;\">
                We have received your deposit request. Here are the details:
              </p>
            </td>
          </tr>
          <tr>
            <td style=\"padding:0 24px 24px 24px;\">
              <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border:1px solid ${borderColor};border-radius:12px;overflow:hidden;\">
                <tbody>${rows}</tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td align=\"center\" style=\"padding:0 24px 28px 24px;\">
              <a href=\"${dashboardUrl}\" style=\"display:inline-block;background:${brandPrimary};background-image:linear-gradient(90deg, ${brandPrimary}, ${brandPrimaryAlt});color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:10px;\">Open Dashboard</a>
            </td>
          </tr>
          <tr>
            <td style=\"background:#fafafa;padding:14px 24px;color:${mutedColor};font-size:12px;line-height:18px;border-top:1px solid ${borderColor};\">
              © ${new Date().getFullYear()} Zuperior. All rights reserved
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

  return sendEmail({ to, subject, text: plainText, html });
};

/**
 * Sends a withdrawal request created confirmation email.
 */
export const sendWithdrawalCreatedEmail = async ({ to, userName, accountLogin, amount, date }) => {
  const recipientName = userName || 'Trader';
  const subject = 'Withdrawal Request Created';
  const fromDisplay = getEnv('SMTP_FROM', 'Zuperior');

  const fDate = (() => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleString();
    } catch {
      return String(date);
    }
  })();

  const plainText = [
    `Hi ${recipientName},`,
    '',
    'We have received your withdrawal request. Here are the details:',
    '',
    `Account: ${accountLogin}`,
    `Amount: ${amount}`,
    `Date: ${fDate}`,
    '',
    'Our team will process your withdrawal and notify you once it is completed.',
    '',
    'Best regards,',
    fromDisplay,
  ].join('\n');

  const brandPrimary = '#6242a5';
  const brandPrimaryAlt = '#9f8bcf';
  const textColor = '#1f2937';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';
  const bgColor = '#f9fafb';

  const explicitLogo = getEnv('EMAIL_LOGO_URL');
  const clientBase = getEnv('CLIENT_URL', 'https://dashboard.zuperior.com');
  let logoUrl = explicitLogo || `${clientBase.replace(/\/$/, '')}/logo.png`;
  logoUrl = logoUrl.replace(/https?:\/\/[^/]+\/(https?:\/\/.*)/, '$1');

  const rows = [
    ['Account', accountLogin],
    ['Amount', amount],
    ['Date', fDate],
  ]
    .map(
      ([k, v]) => `
      <tr>
        <td style=\"padding:12px 16px;border-bottom:1px solid ${borderColor};font-weight:600;white-space:nowrap;color:${textColor}\">${k}</td>
        <td style=\"padding:12px 16px;border-bottom:1px solid ${borderColor};color:${textColor}\">${v}</td>
      </tr>`
    )
    .join('');

  const dashboardUrl = clientBase;
  const html = `
  <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:${bgColor};padding:24px 0;\">
    <tr>
      <td align=\"center\" style=\"padding:0 12px;\">
        <table role=\"presentation\" width=\"640\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;\">
          <tr>
            <td style=\"background:linear-gradient(90deg, ${brandPrimary}, ${brandPrimaryAlt});padding:24px 24px;\">
              <div style=\"display:flex;align-items:center;gap:10px\">
                <img alt=\"Zuperior\" src=\"${logoUrl}\" style=\"height:28px;border:0;outline:none;display:block\" />
                <div style=\"font-size:20px;line-height:28px;color:#fff;font-weight:700;\">Zuperior</div>
              </div>
              <div style=\"font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;\">Withdrawal Request Created</div>
            </td>
          </tr>
          <tr>
            <td style=\"padding:24px 24px 8px 24px;color:${textColor};\">
              <div style=\"font-size:16px;line-height:24px;font-weight:600;\">Hi ${recipientName},</div>
              <p style=\"margin:8px 0 0 0;color:${mutedColor};font-size:14px;line-height:22px;\">
                We have received your withdrawal request. Here are the details:
              </p>
            </td>
          </tr>
          <tr>
            <td style=\"padding:0 24px 24px 24px;\">
              <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border:1px solid ${borderColor};border-radius:12px;overflow:hidden;\">
                <tbody>${rows}</tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td align=\"center\" style=\"padding:0 24px 28px 24px;\">
              <a href=\"${dashboardUrl}\" style=\"display:inline-block;background:${brandPrimary};background-image:linear-gradient(90deg, ${brandPrimary}, ${brandPrimaryAlt});color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:10px;\">Open Dashboard</a>
            </td>
          </tr>
          <tr>
            <td style=\"background:#fafafa;padding:14px 24px;color:${mutedColor};font-size:12px;line-height:18px;border-top:1px solid ${borderColor};\">
              © ${new Date().getFullYear()} Zuperior. All rights reserved
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

  return sendEmail({ to, subject, text: plainText, html });
};

/**
 * Internal transfer email (completed)
 */
export const sendInternalTransferEmail = async ({ to, userName, fromAccount, toAccount, amount, date }) => {
  const recipientName = userName || 'Trader';
  const subject = 'Internal Transfer Completed';
  const fromDisplay = getEnv('SMTP_FROM', 'Zuperior');

  const plainText = [
    `Hi ${recipientName},`,
    '',
    'Your internal transfer has been completed successfully.',
    '',
    `From Account: ${fromAccount}`,
    `To Account: ${toAccount}`,
    `Amount: ${amount}`,
    `Date: ${date instanceof Date ? date.toLocaleString() : String(date)}`,
    '',
    'You can view your updated account balances in your dashboard.',
    '',
    'Best regards,',
    fromDisplay,
  ].join('\n');

  const brandPrimary = '#6242a5';
  const brandPrimaryAlt = '#9f8bcf';
  const textColor = '#1f2937';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';
  const bgColor = '#f9fafb';

  const fDate = (() => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleString();
    } catch {
      return String(date);
    }
  })();

  const rows = [
    ['From Account', fromAccount],
    ['To Account', toAccount],
    ['Amount', amount],
    ['Date', fDate],
  ]
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid ${borderColor};font-weight:600;white-space:nowrap;color:${textColor}">${k}</td>
        <td style="padding:12px 16px;border-bottom:1px solid ${borderColor};color:${textColor}">${v}</td>
      </tr>`
    )
    .join('');

  const dashboardUrl = getEnv('CLIENT_URL', 'https://dashboard.zuperior.com');
  const explicitLogo = getEnv('EMAIL_LOGO_URL');
  let logoUrl = explicitLogo || `${dashboardUrl?.replace(/\/$/, '')}/logo.png`;
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
              <div style="font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;">Internal Transfer Completed</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px 24px;color:${textColor};">
              <div style="font-size:16px;line-height:24px;font-weight:600;">Hi ${recipientName},</div>
              <p style="margin:8px 0 0 0;color:${mutedColor};font-size:14px;line-height:22px;">
                Your internal transfer has been completed successfully. Here are the details:
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
                <tbody>${rows}</tbody>
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
              If you didn't request this transfer, please contact support immediately.
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

  return sendEmail({ to, subject, text: plainText, html });
};

/**
 * Generic transaction completion email (Deposit/Withdrawal).
 */
export const sendTransactionCompletedEmail = async ({ to, userName, type, accountLogin, amount, date }) => {
  const recipientName = userName || 'Trader';
  const isDeposit = String(type).toLowerCase() === 'deposit';
  const subject = isDeposit ? 'Deposit Completed' : 'Withdrawal Completed';
  const fromDisplay = getEnv('SMTP_FROM', 'Zuperior');

  const plainText = [
    `Hi ${recipientName},`,
    '',
    `Your ${type.toLowerCase()} has been completed successfully.`,
    '',
    `Account: ${accountLogin}`,
    `Amount: ${amount}`,
    `Date: ${date instanceof Date ? date.toLocaleString() : String(date)}`,
    '',
    'You can view this transaction in your dashboard.',
    '',
    'Best regards,',
    fromDisplay,
  ].join('\n');

  const brandPrimary = '#6242a5';
  const brandPrimaryAlt = '#9f8bcf';
  const textColor = '#1f2937';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';
  const bgColor = '#f9fafb';

  const fDate = (() => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleString();
    } catch {
      return String(date);
    }
  })();

  const rows = [
    ['Account', accountLogin],
    ['Amount', amount],
    ['Date', fDate],
  ]
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid ${borderColor};font-weight:600;white-space:nowrap;color:${textColor}">${k}</td>
        <td style="padding:12px 16px;border-bottom:1px solid ${borderColor};color:${textColor}">${v}</td>
      </tr>`
    )
    .join('');

  const dashboardUrl = getEnv('CLIENT_URL', 'https://dashboard.zuperior.com');
  const explicitLogo = getEnv('EMAIL_LOGO_URL');
  let logoUrl = explicitLogo || `${dashboardUrl?.replace(/\/$/, '')}/logo.png`;
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
              <div style="font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;">${subject}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px 24px;color:${textColor};">
              <div style="font-size:16px;line-height:24px;font-weight:600;">Hi ${recipientName},</div>
              <p style="margin:8px 0 0 0;color:${mutedColor};font-size:14px;line-height:22px;">
                Your ${type.toLowerCase()} has been completed successfully. Here are the details:
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
                <tbody>${rows}</tbody>
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
              If you didn't request this transaction, please contact support immediately.
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

  return sendEmail({ to, subject, text: plainText, html });
};

/**
 * Sends a welcome email to new users after signup.
 * @param {Object} params
 * @param {string} params.to - Recipient email address.
 * @param {string} [params.userName] - Name of the recipient.
 */
export const sendWelcomeEmail = async ({ to, userName }) => {
  const recipientName = userName || 'Trader';
  const subject = 'Welcome to Zuperior! 🎉';
  const fromDisplay = getEnv('SMTP_FROM', 'Zuperior');

  console.log('📧 Preparing welcome email', {
    to,
    userName,
  });

  const plainText = [
    `Hi ${recipientName},`,
    '',
    'Welcome to Zuperior! 🎉',
    '',
    "We're thrilled to have you join our trading community. Your account has been created successfully.",
    '',
    'Get started with these quick steps:',
    '1. Complete your KYC verification to unlock all features',
    '2. Fund your account with your preferred payment method',
    '3. Start trading on our powerful MT5 platform',
    '',
    'Need help? Our support team is here for you 24/7.',
    '',
    'Happy Trading!',
    fromDisplay,
  ].join('\n');

  const brandPrimary = '#6242a5';
  const brandPrimaryAlt = '#9f8bcf';
  const textColor = '#1f2937';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';
  const bgColor = '#f9fafb';

  const explicitLogo = getEnv('EMAIL_LOGO_URL');
  const clientBase = getEnv('CLIENT_URL', 'https://dashboard.zuperior.com');
  let logoUrl = explicitLogo || `${clientBase.replace(/\/$/, '')}/logo.png`;
  logoUrl = logoUrl.replace(/https?:\/\/[^/]+\/(https?:\/\/.*)/, '$1');

  const html = `
  <!doctype html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      @media only screen and (max-width: 600px) {
        .main-table {
          width: 100% !important;
        }
        .content-padding {
          padding: 16px !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:24px;background:${bgColor};font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1)">
      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,${brandPrimary},${brandPrimaryAlt});padding:32px 24px;border-radius:16px 16px 0 0">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:center">
                <img src="${logoUrl}" alt="Zuperior" style="height:32px;margin-bottom:12px" />
                <div style="font-size:24px;color:#fff;font-weight:700;margin-bottom:4px">Zuperior</div>
                <div style="font-size:14px;color:rgba(255,255,255,0.9)">Welcome Aboard!</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Celebration Icon -->
      <tr>
        <td style="padding:32px 24px 16px;text-align:center">
          <div style="font-size:64px">🎉</div>
        </td>
      </tr>
      
      <!-- Greeting -->
      <tr>
        <td class="content-padding" style="padding:0 24px 16px">
          <div style="font-size:20px;font-weight:600;color:${textColor};margin-bottom:8px">Hi ${recipientName}!</div>
          <p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6">
            We're thrilled to have you join our trading community. Your account has been created successfully and you're all set to start your trading journey with us!
          </p>
        </td>
      </tr>
      
      <!-- Quick Steps -->
      <tr>
        <td class="content-padding" style="padding:16px 24px">
          <div style="background:#f8f9fa;border-radius:12px;padding:20px;border-left:4px solid ${brandPrimary}">
            <div style="font-size:16px;font-weight:600;color:${textColor};margin-bottom:12px">Get Started in 3 Easy Steps:</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:8px 0;vertical-align:top">
                  <div style="display:inline-block;background:${brandPrimary};color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:700;font-size:14px;margin-right:12px">1</div>
                  <span style="font-size:14px;color:#374151;line-height:1.6">Complete your KYC verification to unlock all features</span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;vertical-align:top">
                  <div style="display:inline-block;background:${brandPrimary};color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:700;font-size:14px;margin-right:12px">2</div>
                  <span style="font-size:14px;color:#374151;line-height:1.6">Fund your account with your preferred payment method</span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;vertical-align:top">
                  <div style="display:inline-block;background:${brandPrimary};color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:700;font-size:14px;margin-right:12px">3</div>
                  <span style="font-size:14px;color:#374151;line-height:1.6">Start trading on our powerful MT5 platform</span>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
      
      <!-- CTA Button -->
      <tr>
        <td class="content-padding" style="padding:16px 24px 32px;text-align:center">
          <a href="${clientBase}" style="display:inline-block;background:linear-gradient(135deg,${brandPrimary},${brandPrimaryAlt});color:#fff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:10px;font-size:16px;box-shadow:0 4px 6px rgba(98,66,165,0.3);transition:all 0.3s">
            Go to Dashboard
          </a>
        </td>
      </tr>
      
      <!-- Support Section -->
      <tr>
        <td class="content-padding" style="padding:16px 24px 24px;border-top:1px solid ${borderColor}">
          <div style="background:#fef3c7;border-radius:10px;padding:16px;text-align:center">
            <p style="margin:0;font-size:14px;color:#78350f;line-height:1.6">
              💬 <strong>Need help?</strong> Our support team is here for you 24/7.<br/>
              We're committed to making your trading experience exceptional.
            </p>
          </div>
        </td>
      </tr>
      
      <!-- Footer -->
      <tr>
        <td style="background:#fafafa;padding:20px 24px;font-size:12px;color:#6b7280;border-top:1px solid ${borderColor};border-radius:0 0 16px 16px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:center">
                <p style="margin:0 0 8px 0">© ${new Date().getFullYear()} Zuperior. All rights reserved.</p>
                <p style="margin:0;font-size:11px">You're receiving this email because you signed up for a Zuperior account.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;

  const sendResult = await sendEmail({
    to,
    subject,
    text: plainText,
    html,
  });

  console.log('📧 Welcome email sent', {
    to,
    messageId: sendResult?.messageId,
    accepted: sendResult?.accepted,
    response: sendResult?.response,
  });

  return sendResult;
};

/**
 * Sends an OTP email for password reset or verification
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} [params.name] - Name of the recipient
 * @param {string} params.otp - 6-digit OTP code
 * @param {string} [params.purpose] - Purpose of OTP ('password-change', 'verification', etc.)
 */
export const sendOtpEmail = async ({ to, name, otp, purpose = 'verification' }) => {
  const recipientName = name || 'User';
  
  // Customize subject and message based on purpose
  let subject, verificationMessage;
  if (purpose === 'password-change') {
    subject = 'Password Change Verification Code • Zuperior';
    verificationMessage = 'Use the one-time code below to verify your password change request.';
  } else if (purpose === 'withdrawal') {
    subject = 'Withdrawal Verification Code • Zuperior';
    verificationMessage = 'Use the one-time code below to verify and complete your withdrawal request.';
  } else if (purpose === 'two-factor-login') {
    subject = 'Login Verification Code • Zuperior';
    verificationMessage = 'Use the one-time code below to complete your login.';
  } else {
    subject = 'Verify your email • Zuperior';
    verificationMessage = 'Use the one-time code below to verify your email address.';
  }
  
  const brandPrimary = '#6242a5';
  const brandPrimaryAlt = '#9f8bcf';
  const textColor = '#1f2937';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';
  const bgColor = '#f9fafb';

  const explicitLogo = getEnv('EMAIL_LOGO_URL');
  const clientBase = getEnv('CLIENT_URL', 'https://dashboard.zuperior.com');
  let logoUrl = explicitLogo || `${clientBase.replace(/\/$/, '')}/logo.png`;
  logoUrl = logoUrl.replace(/https?:\/\/[^/]+\/(https?:\/\/.*)/, '$1');

  const plainText = [
    `Hi ${recipientName},`,
    '',
    verificationMessage,
    '',
    otp,
    '',
    'This code will expire in 10 minutes.',
    '',
    "If you didn't request this email, you can safely ignore it.",
    '',
    '- Team Zuperior'
  ].join('\n');

  const html = `
  <!doctype html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <meta name="color-scheme" content="light dark"/>
    <style>
      body{margin:0;padding:24px;background:${bgColor};font-family:Arial,Helvetica,sans-serif;color:${textColor}}
      .card{max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden}
      .header{background:linear-gradient(90deg,${brandPrimary},${brandPrimaryAlt});padding:16px 20px;display:flex;align-items:center;gap:10px}
      .title{margin:0;font-size:20px;color:#ffffff}
      .muted{color:${mutedColor}}
      .code{letter-spacing:6px;font-weight:700;font-size:28px;text-align:center;color:#111827;margin:18px 0 8px}
      .panel{margin-top:22px;padding:12px 16px;border:1px solid ${borderColor};border-radius:8px;color:${mutedColor};font-size:12px}
      .foot{margin-top:24px;font-size:12px;color:${mutedColor}}
      @media (prefers-color-scheme: dark){
        body{background:#0b0f1a;color:#e6e6e6}
        .card{background:#121828}
        .muted{color:#94a3b8}
        .code{color:#ffffff}
        .panel{border-color:#1f2937;color:#94a3b8}
        .foot{color:#94a3b8}
      }
    </style>
  </head>
  <body>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card">
      <tr>
        <td class="header">
          <img src="${logoUrl}" alt="Zuperior" style="height:28px;border:0;outline:none;display:block" />
          <h1 class="title">Zuperior</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:24px">
          <p class="muted" style="margin:0 0 12px 0;font-size:14px">${recipientName ? `Hi ${recipientName},` : 'Hi,'}</p>
          <p class="muted" style="margin:0 0 16px 0;font-size:14px">${verificationMessage}</p>
          <div class="code">${otp}</div>
          <p class="muted" style="margin:0 0 6px 0;font-size:12px;text-align:center">This code will expire in 10 minutes.</p>
          <div class="panel">If you didn't request this email, you can safely ignore it.</div>
          <p class="foot">— Team Zuperior</p>
        </td>
      </tr>
    </table>
  </body>
  </html>`;

  return sendEmail({ to, subject, text: plainText, html });
};

export default {
  sendEmail,
  sendMt5AccountEmail,
  sendDepositCreatedEmail,
  sendWithdrawalCreatedEmail,
  sendInternalTransferEmail,
  sendTransactionCompletedEmail,
  sendWelcomeEmail,
  sendOtpEmail,
};

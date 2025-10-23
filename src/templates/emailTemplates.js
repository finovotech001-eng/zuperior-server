// server/src/templates/emailTemplates.js

const brand = 'Zuperior';

const wrap = (title, bodyHtml) => `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <style>
      body{margin:0;padding:24px;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
      .card{max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden}
      .header{background:linear-gradient(90deg,#6242a5,#9f8bcf);padding:16px 20px}
      .title{margin:0;font-size:20px;color:#ffffff}
      .muted{color:#475569}
      .h2{font-size:16px;margin:0 0 8px 0;color:#111827}
      .p{margin:0 0 12px 0}
      .tbl{width:100%;border-collapse:collapse;margin-top:10px}
      .tbl th,.tbl td{padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-size:13px}
      .foot{margin-top:18px;font-size:12px;color:#475569}
      @media (prefers-color-scheme: dark){
        body{background:#0b0f1a;color:#e6e6e6}
        .card{background:#121828}
        .muted{color:#94a3b8}
        .h2{color:#fff}
        .tbl th,.tbl td{border-color:#1f2937}
        .foot{color:#94a3b8}
      }
    </style>
  </head>
  <body>
    <table role="presentation" class="card" cellpadding="0" cellspacing="0">
      <tr><td class="header"><h1 class="title">${brand}</h1></td></tr>
      <tr>
        <td style="padding:24px">
          <h2 class="h2">${title}</h2>
          ${bodyHtml}
          <p class="foot">— Team ${brand}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const money = (n, c = 'USD') => `${c} ${Number(n).toFixed(2)}`;

export const depositSubmitted = ({ name, amount, method, id, currency = 'USD' }) => ({
  subject: `${brand} • Deposit submitted`,
  html: wrap('Deposit Submitted', `
    <p class="p muted">Hi ${name || ''}, your deposit request has been received.</p>
    <table class="tbl"><tr><th>Amount</th><td>${money(amount, currency)}</td></tr>
    <tr><th>Method</th><td>${method || 'Manual'}</td></tr>
    <tr><th>Reference</th><td>${id}</td></tr></table>
  `),
});

export const depositApproved = ({ name, amount, id, currency = 'USD' }) => ({
  subject: `${brand} • Deposit approved`,
  html: wrap('Deposit Approved', `
    <p class="p muted">Hi ${name || ''}, your deposit has been approved and credited.</p>
    <table class="tbl"><tr><th>Amount</th><td>${money(amount, currency)}</td></tr>
    <tr><th>Reference</th><td>${id}</td></tr></table>
  `),
});

export const depositRejected = ({ name, amount, id, reason, currency = 'USD' }) => ({
  subject: `${brand} • Deposit rejected`,
  html: wrap('Deposit Rejected', `
    <p class="p muted">Hi ${name || ''}, unfortunately your deposit was rejected.</p>
    <table class="tbl"><tr><th>Amount</th><td>${money(amount, currency)}</td></tr>
    <tr><th>Reference</th><td>${id}</td></tr>
    <tr><th>Reason</th><td>${reason || 'Not specified'}</td></tr></table>
  `),
});

export const withdrawalSubmitted = ({ name, amount, id, currency = 'USD' }) => ({
  subject: `${brand} • Withdrawal submitted`,
  html: wrap('Withdrawal Submitted', `
    <p class="p muted">Hi ${name || ''}, your withdrawal request has been received.</p>
    <table class="tbl"><tr><th>Amount</th><td>${money(amount, currency)}</td></tr>
    <tr><th>Reference</th><td>${id}</td></tr></table>
  `),
});

export const withdrawalApproved = ({ name, amount, id, currency = 'USD' }) => ({
  subject: `${brand} • Withdrawal approved`,
  html: wrap('Withdrawal Approved', `
    <p class="p muted">Hi ${name || ''}, your withdrawal has been approved and processed.</p>
    <table class="tbl"><tr><th>Amount</th><td>${money(amount, currency)}</td></tr>
    <tr><th>Reference</th><td>${id}</td></tr></table>
  `),
});

export const withdrawalRejected = ({ name, amount, id, reason, currency = 'USD' }) => ({
  subject: `${brand} • Withdrawal rejected`,
  html: wrap('Withdrawal Rejected', `
    <p class="p muted">Hi ${name || ''}, your withdrawal was rejected.</p>
    <table class="tbl"><tr><th>Amount</th><td>${money(amount, currency)}</td></tr>
    <tr><th>Reference</th><td>${id}</td></tr>
    <tr><th>Reason</th><td>${reason || 'Not specified'}</td></tr></table>
  `),
});

export const internalTransfer = ({ name, fromAccount, toAccount, amount, transferId, currency = 'USD' }) => ({
  subject: `${brand} • Internal transfer confirmation`,
  html: wrap('Internal Transfer', `
    <p class="p muted">Hi ${name || ''}, your internal transfer was completed.</p>
    <table class="tbl"><tr><th>From</th><td>${fromAccount}</td></tr>
    <tr><th>To</th><td>${toAccount}</td></tr>
    <tr><th>Amount</th><td>${money(amount, currency)}</td></tr>
    <tr><th>Reference</th><td>${transferId}</td></tr></table>
  `),
});

export const liveAccountOpened = ({ name, mt5Login, group, leverage }) => ({
  subject: `${brand} • Live account created`,
  html: wrap('Live Trading Account Created', `
    <p class="p muted">Hi ${name || ''}, your live trading account is ready.</p>
    <table class="tbl"><tr><th>Login</th><td>${mt5Login}</td></tr>
    <tr><th>Group</th><td>${group}</td></tr>
    <tr><th>Leverage</th><td>${leverage}x</td></tr></table>
    <p class="muted p">Keep your master password secure. For your safety we do not email passwords.</p>
  `),
});

export const passwordChanged = ({ name }) => ({
  subject: `${brand} • Password changed`,
  html: wrap('Password Changed', `<p class="muted p">Hi ${name || ''}, your account password was successfully updated. If this wasn’t you, reset your password immediately and contact support.</p>`),
});

export const mt5PasswordChanged = ({ name, login }) => ({
  subject: `${brand} • MT5 password changed`,
  html: wrap('MT5 Password Changed', `<p class="muted p">Hi ${name || ''}, the password for MT5 login ${login} was changed. If this wasn’t you, please contact support immediately.</p>`),
});

export const forgotPassword = ({ name, link }) => ({
  subject: `${brand} • Reset your password`,
  html: wrap('Reset Password', `<p class="muted p">Hi ${name || ''}, click the link below to reset your password. This link will expire soon.</p><p class="p"><a href="${link}" target="_blank">Reset Password</a></p>`),
});

export const kycStatus = ({ name, status, reason }) => ({
  subject: `${brand} • KYC ${status}`,
  html: wrap('KYC Update', `<p class="muted p">Hi ${name || ''}, your KYC status is <b>${status}</b>.</p>${reason ? `<p class="muted p">Reason: ${reason}</p>` : ''}`),
});


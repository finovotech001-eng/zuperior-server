# Email Implementation Summary

This document provides an overview of all email functionality implemented in the Zuperior CRM system.

## 📧 Email Events Implemented

### 1. User Registration - Welcome Email ✅
**Trigger:** When a new user registers an account

**Template:** `welcomeEmail`

**Data Required:**
- name
- email

**Controller:** `auth.controller.js` → `register()`

**Example:**
```javascript
// Sent automatically after successful registration
{
  name: "John Doe",
  email: "john@example.com"
}
```

---

### 2. Deposit - Submitted ✅
**Trigger:** When user submits a deposit request

**Template:** `depositSubmitted`

**Data Required:**
- name
- amount
- method (e.g., "crypto", "bank")
- id (deposit ID)
- currency (default: "USD")

**Controller:** `deposit.controller.js` → `createDeposit()`

**Email Sent To:** User who created the deposit

---

### 3. Deposit - Approved ✅
**Trigger:** When admin approves a deposit

**Template:** `depositApproved`

**Data Required:**
- name
- amount
- id (deposit ID)
- currency

**Controller:** `deposit.controller.js` → `updateDepositStatus()`

**Email Sent To:** User who created the deposit

---

### 4. Deposit - Rejected ✅
**Trigger:** When admin rejects a deposit

**Template:** `depositRejected`

**Data Required:**
- name
- amount
- id (deposit ID)
- reason (rejection reason)
- currency

**Controller:** `deposit.controller.js` → `updateDepositStatus()`

**Email Sent To:** User who created the deposit

---

### 5. Withdrawal - Submitted ✅
**Trigger:** When user submits a withdrawal request

**Template:** `withdrawalSubmitted`

**Data Required:**
- name
- amount
- id (withdrawal ID)
- currency

**Controller:** `withdrawal.controller.js` → `createWithdrawal()`

**Email Sent To:** User who created the withdrawal

---

### 6. Withdrawal - Approved ✅
**Trigger:** When admin approves a withdrawal

**Template:** `withdrawalApproved`

**Data Required:**
- name
- amount
- id (withdrawal ID)
- currency

**Controller:** `adminWithdrawal.controller.js` → `approveWithdrawal()`

**Email Sent To:** User who created the withdrawal

---

### 7. Withdrawal - Rejected ✅
**Trigger:** When admin rejects a withdrawal

**Template:** `withdrawalRejected`

**Data Required:**
- name
- amount
- id (withdrawal ID)
- reason (rejection reason)
- currency

**Controller:** `adminWithdrawal.controller.js` → `rejectWithdrawal()`

**Email Sent To:** User who created the withdrawal

---

### 8. Internal Transfer ✅
**Trigger:** When user completes an internal transfer between MT5 accounts

**Template:** `internalTransfer`

**Data Required:**
- name
- fromAccount (source MT5 account)
- toAccount (destination MT5 account)
- amount
- transferId (transaction reference)
- currency

**Controller:** `internalTransfer.controller.js` → `internalTransfer()`

**Email Sent To:** User who initiated the transfer

---

### 9. Live Account Opened ✅
**Trigger:** When a new MT5 live account is created

**Template:** `liveAccountOpened`

**Data Required:**
- name
- mt5Login (MT5 account number)
- group (account type: Pro/Standard)
- leverage (e.g., "100x")

**Controller:** `mt5.controller.js` → `createAccount()` and `storeAccount()`

**Email Sent To:** User who owns the account

---

### 10. User Password Changed ✅
**Trigger:** When user changes their account password

**Template:** `passwordChanged`

**Data Required:**
- name

**Controller:** `user.controller.js` → `changePassword()`

**Email Sent To:** User who changed their password

---

### 11. MT5 Password Changed ✅
**Trigger:** When user changes their MT5 account password

**Template:** `mt5PasswordChanged`

**Data Required:**
- name
- login (MT5 account number)

**Controller:** `mt5.controller.js` → `changeMt5Password()`

**Email Sent To:** User who owns the MT5 account

---

### 12. Forgot Password ✅
**Trigger:** When user requests a password reset

**Template:** `forgotPassword`

**Data Required:**
- name
- link (password reset URL with token)

**Controller:** `auth.controller.js` → `forgotPassword()`

**Email Sent To:** User who requested the reset

**Note:** Also sends `passwordChanged` confirmation after successful reset

---

### 13. KYC Status Update ✅
**Trigger:** When KYC verification status changes

**Template:** `kycStatus`

**Data Required:**
- name
- status (e.g., "Verified", "Declined", "Partially Verified")
- reason (optional - only for declined/rejected)

**Controller:** `kyc.controller.js` → `handleCallback()`

**Email Sent To:** User whose KYC was updated

---

## 📝 Email Templates

All templates are located in: `zuperior-server/src/templates/emailTemplates.js`

### Template Features:
- ✅ Responsive design
- ✅ Dark mode support
- ✅ Mobile-friendly
- ✅ Consistent branding
- ✅ Professional styling
- ✅ Table formatting for transaction details
- ✅ Clear call-to-action buttons (where applicable)

### Template Structure:
Each template exports an object with:
- `subject` - Email subject line
- `html` - HTML email body

## 🔧 Email Service

**Location:** `zuperior-server/src/services/mail.service.js`

### Functions:

#### `sendMail({ to, subject, html, text })`
Low-level function for sending emails

#### `sendTemplate({ to, subject, html })`
Convenience wrapper that auto-generates text version from HTML

### Configuration:
Uses nodemailer with the following environment variables:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## 🚀 API Endpoints

### Public (No Auth)
- `POST /api/forgot-password` - Request password reset
- `POST /api/reset-password` - Reset password with token

### Protected (Auth Required)
- `PUT /api/password` - Change account password
- `POST /api/mt5/change-password` - Change MT5 password

### Automatic (No Direct Endpoint)
All other emails are sent automatically when their triggering events occur (deposit, withdrawal, transfer, KYC, etc.)

## ✅ Testing Email Functionality

### 1. Test SMTP Configuration
```bash
curl -X POST http://localhost:5000/api/system/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test",
    "message": "Testing SMTP"
  }'
```

### 2. Test Registration (Welcome Email)
```bash
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "country": "US"
  }'
```

### 3. Test Password Reset
```bash
# Request reset
curl -X POST http://localhost:5000/api/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Check email for reset link, then:
curl -X POST http://localhost:5000/api/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TOKEN_FROM_EMAIL",
    "newPassword": "newpass123",
    "confirmPassword": "newpass123"
  }'
```

### 4. Test Deposit Flow
```bash
# Create deposit (requires auth token)
curl -X POST http://localhost:5000/api/deposit/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "mt5AccountId": "12345",
    "amount": 1000,
    "method": "crypto"
  }'
```

## 📊 Email Logs

All email operations are logged with these prefixes:
- `✅` Success
- `⚠️` Warning/Non-critical failure
- `❌` Critical error

Example logs:
```
✅ Welcome email sent to: user@example.com
⚠️ Email(send deposit submitted) failed: SMTP connection timeout
✅ Password reset email sent to: user@example.com
```

## 🛡️ Error Handling

All email sending is wrapped in try-catch blocks with:
- **Non-blocking errors:** Emails fail gracefully without breaking the main operation
- **Detailed logging:** All failures are logged with context
- **User-friendly messages:** Main operation success is not affected by email failures

Example:
```javascript
try {
  const tpl = depositApproved({ name, amount, id });
  await sendTemplate({ to: email, subject: tpl.subject, html: tpl.html });
} catch (e) {
  console.warn('Email(send deposit approved) failed:', e?.message);
}
```

## 🔐 Security Considerations

1. **Password Reset Tokens:**
   - Tokens are hashed before storage (SHA-256)
   - Tokens expire after 1 hour
   - Tokens are single-use (marked as used after successful reset)
   - Token validation includes expiry and usage checks

2. **Email Content:**
   - Passwords are never sent via email
   - Reset links contain tokens, not credentials
   - Email logs show recipient but not content

3. **Rate Limiting:**
   - Consider implementing rate limits on forgot-password endpoint
   - Monitor for abuse patterns

## 📈 Monitoring

Key metrics to monitor:
- Email send success rate
- Email bounce rate
- Failed SMTP connections
- Password reset requests
- Email send latency

## 🐛 Common Issues

### Emails not sending
- Check SMTP credentials in .env
- Verify SMTP server is reachable
- Check spam folders
- Review server logs

### Emails in spam
- Set up SPF records
- Configure DKIM signing
- Use verified sending domain
- Warm up new sending domains

### Wrong email content
- Verify template parameters
- Check template file exports
- Review controller email calls

## 🎯 Future Enhancements

Potential improvements to consider:
- [ ] Email queue for better reliability
- [ ] Email templates management UI
- [ ] A/B testing for email content
- [ ] Email analytics dashboard
- [ ] Attachment support
- [ ] Multi-language support
- [ ] Email preferences per user
- [ ] Retry logic for failed emails
- [ ] Webhook for email events

---

**Last Updated:** October 2024
**Version:** 1.0.0
**Status:** Production Ready ✅


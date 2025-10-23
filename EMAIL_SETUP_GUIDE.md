# Email Setup Guide for Zuperior CRM

This guide will help you configure email functionality for the Zuperior CRM system.

## Overview

The email system is already implemented and ready to send emails for the following events:
- ✅ User Registration (Welcome Email)
- ✅ Deposit (Submitted, Approved, Rejected)
- ✅ Withdrawal (Submitted, Approved, Rejected)
- ✅ Internal Transfer Confirmation
- ✅ Live Account Creation
- ✅ Password Changed (User Account)
- ✅ MT5 Password Changed
- ✅ Forgot Password / Reset Password
- ✅ KYC Verification Status Updates

## SMTP Configuration

### Step 1: Set Up Environment Variables

Create or update your `.env` file in the `zuperior-server` directory with the following SMTP settings:

```env
# SMTP Email Configuration
SMTP_HOST=smtp.your-email-provider.com
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASS=your-email-password
SMTP_FROM=Zuperior <noreply@zuperior.com>

# Client URL (for password reset links)
CLIENT_URL=http://localhost:3000
```

### Step 2: Choose Your Email Provider

#### Option 1: Gmail (For Development/Testing)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Zuperior <your-gmail@gmail.com>
```

**Important for Gmail:**
1. Enable 2-Factor Authentication on your Google Account
2. Generate an "App Password" at: https://myaccount.google.com/apppasswords
3. Use the generated app password (not your regular Gmail password)

#### Option 2: SendGrid

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=Zuperior <noreply@yourdomain.com>
```

#### Option 3: Mailgun

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-smtp-password
SMTP_FROM=Zuperior <noreply@yourdomain.com>
```

#### Option 4: AWS SES (Simple Email Service)

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-smtp-username
SMTP_PASS=your-ses-smtp-password
SMTP_FROM=Zuperior <noreply@yourdomain.com>
```

#### Option 5: Custom SMTP Server

```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-password
SMTP_FROM=Zuperior <noreply@yourdomain.com>
```

### Step 3: Update Database Schema

Before the email functionality works completely, you need to run the database migration to add the `PasswordResetToken` table:

```bash
cd zuperior-server
npx prisma migrate dev --name add_password_reset_token
```

Or if you prefer to just regenerate the Prisma client:

```bash
npx prisma generate
```

### Step 4: Test Email Configuration

You can test your SMTP configuration using the system email test endpoint:

```bash
# Make sure your server is running
cd zuperior-server
npm start

# In another terminal, test the email
curl -X POST http://localhost:5000/api/system/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "message": "This is a test email"
  }'
```

## Email Templates

All email templates are located in: `zuperior-server/src/templates/emailTemplates.js`

The templates use a responsive design with:
- Dark mode support
- Mobile-friendly layout
- Consistent branding
- Professional styling

You can customize the templates by editing the `emailTemplates.js` file.

## API Endpoints

### Public Endpoints (No Authentication Required)

#### POST `/api/forgot-password`
Request a password reset link.

```json
{
  "email": "user@example.com"
}
```

#### POST `/api/reset-password`
Reset password using token from email.

```json
{
  "token": "reset-token-from-email",
  "newPassword": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

### Protected Endpoints (Authentication Required)

#### POST `/api/mt5/change-password`
Change MT5 account password.

```json
{
  "login": "12345678",
  "passwordType": "main",
  "newPassword": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

`passwordType` can be:
- `"main"` - Master password
- `"investor"` - Investor password

#### PUT `/api/password`
Change user account password.

```json
{
  "oldPassword": "oldpassword123",
  "newPassword": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

## Troubleshooting

### Emails Not Sending

1. **Check SMTP credentials**: Verify that your SMTP settings are correct in `.env`
2. **Check server logs**: Look for email errors in the console output
3. **Check firewall**: Ensure port 587 (or 465 for SSL) is not blocked
4. **Check spam folder**: Emails might be landing in spam
5. **Verify email provider limits**: Some providers have rate limits

### Common Errors

#### "SMTP verify failed"
- This is a warning, not an error. Emails will still be attempted.
- Some SMTP servers don't support the verify command.

#### "Authentication failed"
- Double-check your SMTP_USER and SMTP_PASS
- For Gmail, make sure you're using an App Password
- For other providers, verify your credentials

#### "Connection timeout"
- Check that SMTP_HOST and SMTP_PORT are correct
- Verify your firewall settings
- Try using port 465 with `secure: true` if 587 doesn't work

#### "Invalid sender address"
- Make sure SMTP_FROM matches an email you have permission to send from
- Some providers require the FROM address to match the authenticated user

## Email Logs

All email operations are logged to the console with the following format:
- ✅ Success: `Email(send [type]) sent to: email@example.com`
- ⚠️ Warning: `Email(send [type]) failed: [error message]`

## Security Best Practices

1. **Never commit `.env` file** - It contains sensitive credentials
2. **Use environment-specific configurations** - Different settings for dev/staging/production
3. **Rotate credentials regularly** - Change SMTP passwords periodically
4. **Use app-specific passwords** - When using Gmail or similar services
5. **Enable rate limiting** - Prevent abuse of email endpoints
6. **Use verified domains** - For production, use a verified sending domain

## Production Recommendations

For production environments, we recommend:

1. **Use a dedicated email service** like SendGrid, Mailgun, or AWS SES
2. **Set up SPF and DKIM records** to improve deliverability
3. **Use a custom domain** for professional appearance
4. **Monitor email metrics** like bounce rates and complaints
5. **Implement email queue** for handling high volumes
6. **Add rate limiting** to prevent abuse

## Support

If you encounter issues with email configuration, please:
1. Check the server console logs
2. Verify your SMTP credentials
3. Test with the `/api/system/test-email` endpoint
4. Contact your email provider's support if issues persist

---

Last Updated: October 2024


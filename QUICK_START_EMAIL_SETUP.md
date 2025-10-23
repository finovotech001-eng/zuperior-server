# Quick Start: Email Setup for Zuperior CRM

Follow these steps to get email functionality working in 5 minutes!

## Step 1: Update Database Schema (2 minutes)

```bash
cd zuperior-server
npx prisma migrate dev --name add_password_reset_token
npx prisma generate
```

## Step 2: Configure SMTP Settings (1 minute)

Create or update `zuperior-server/.env`:

### For Testing with Gmail:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=Zuperior <your-gmail@gmail.com>
CLIENT_URL=http://localhost:3000
```

**Get Gmail App Password:**
1. Go to: https://myaccount.google.com/apppasswords
2. Generate "App Password" for "Mail"
3. Copy the 16-character password
4. Paste it as SMTP_PASS (no spaces)

### For Production (Recommended):
```env
# Using SendGrid (Free tier: 100 emails/day)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=YOUR_SENDGRID_API_KEY
SMTP_FROM=Zuperior <noreply@yourdomain.com>
CLIENT_URL=https://yourdomain.com
```

## Step 3: Restart Server (30 seconds)

```bash
# Stop the server (Ctrl+C if running)
# Start the server
npm start
```

## Step 4: Test Email (1 minute)

### Test SMTP Connection:
```bash
curl -X POST http://localhost:5000/api/system/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "subject": "Test Email",
    "message": "If you receive this, SMTP is working!"
  }'
```

### Test Password Reset:
```bash
curl -X POST http://localhost:5000/api/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "existing-user@example.com"}'
```

Check your email inbox (and spam folder)!

## ✅ All Automated Emails

Once configured, emails will automatically be sent for:

1. **User registers** → Welcome email
2. **User requests password reset** → Reset link email
3. **User resets password** → Confirmation email
4. **User changes password** → Security notification
5. **Deposit submitted** → Confirmation email
6. **Deposit approved** → Success notification
7. **Deposit rejected** → Rejection notice with reason
8. **Withdrawal submitted** → Confirmation email
9. **Withdrawal approved** → Success notification
10. **Withdrawal rejected** → Rejection notice
11. **Internal transfer** → Transfer confirmation
12. **MT5 account created** → Welcome with account details
13. **MT5 password changed** → Security notification
14. **KYC status updated** → Status notification

## 🎉 That's It!

Your email system is now ready. All emails will be sent automatically when their events occur.

## 🐛 Troubleshooting

### "Connection timeout" or "ECONNREFUSED"
❌ **Problem:** Can't connect to SMTP server

✅ **Solution:** 
- Check SMTP_HOST and SMTP_PORT are correct
- Try port 465 instead of 587
- Check firewall settings

### "Authentication failed" or "Invalid credentials"
❌ **Problem:** SMTP login failed

✅ **Solution:**
- For Gmail: Use App Password, not regular password
- Verify SMTP_USER and SMTP_PASS are correct
- Check for extra spaces in .env file

### "Prisma Client error" or "Unknown field PasswordResetToken"
❌ **Problem:** Database not updated

✅ **Solution:**
```bash
npx prisma migrate dev
npx prisma generate
# Restart your server
```

### Emails go to spam
❌ **Problem:** Low sender reputation

✅ **Solution:**
- Use a verified sending domain
- Set up SPF/DKIM records
- Use a professional email service (SendGrid, Mailgun, etc.)

## 📚 More Help

- **Full Setup Guide:** [EMAIL_SETUP_GUIDE.md](./EMAIL_SETUP_GUIDE.md)
- **Database Migration:** [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md)
- **Implementation Details:** [EMAIL_IMPLEMENTATION_SUMMARY.md](./EMAIL_IMPLEMENTATION_SUMMARY.md)

## 🆘 Still Not Working?

1. Check server console logs for errors
2. Verify .env file is in correct location
3. Restart server after .env changes
4. Test with `/api/system/test-email` endpoint
5. Check your email provider's documentation

---

**Quick Links:**
- [Gmail App Passwords](https://myaccount.google.com/apppasswords)
- [SendGrid Free Tier](https://sendgrid.com/pricing/)
- [Mailgun Free Trial](https://www.mailgun.com/pricing/)

---

Last Updated: October 2024


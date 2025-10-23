// server/src/controllers/system.controller.js
import { sendMail } from '../services/mail.service.js';

export const testEmail = async (req, res) => {
  try {
    const { to } = req.body || {};
    if (!to) return res.status(400).json({ success: false, message: 'to is required' });

    await sendMail({
      to,
      subject: 'Zuperior Email Test',
      html: '<p>Hello, this is a test email from Zuperior backend.</p>',
      text: 'Hello, this is a test email from Zuperior backend.'
    });

    return res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    console.error('Test email failed:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to send email' });
  }
};


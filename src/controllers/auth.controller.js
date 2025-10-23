// zuperior-dashboard/server/src/controllers/auth.controller.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dbService from '../services/db.service.js';
import { sendTemplate } from '../services/mail.service.js';
import { forgotPassword as forgotPasswordEmail } from '../templates/emailTemplates.js';

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

const buildCookieOptions = (overrides = {}) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: TOKEN_MAX_AGE_MS,
  ...overrides,
});

const setAuthCookies = (res, { token, clientId }) => {
  if (!token) return;

  res.cookie('token', token, buildCookieOptions());

  if (clientId) {
    res.cookie(
      'clientId',
      clientId,
      buildCookieOptions({
        httpOnly: false,
      })
    );
  }
};

/**
 * Handles the registration (signup) of a new user.
 */
export const register = async (req, res) => {
    const { name, email, password, country, phone, emailVerified } = req.body;

    // 1. Basic validation - match exactly what the form sends
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Please enter all required fields: name, email, and password.' });
    }

    try {
        // 2. Check if user already exists
        const existingUser = await dbService.prisma.User.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        // 3. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 4. Save the new user to the database - include phone field
        const newUser = await dbService.prisma.User.create({
            data: {
                name,
                email,
                password: hashedPassword,
                country,
                phone: phone || null, // Include phone field from form
                emailVerified: emailVerified === true ? true : undefined,
            },
            // Select fields to return
            select: { id: true, clientId: true, name: true, email: true, emailVerified: true },
        });

        // 5. Generate JWT Token
        const token = jwt.sign(
            { id: newUser.id, clientId: newUser.clientId },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        // 6. Send welcome email
        try {
            const { welcomeEmail } = await import('../templates/emailTemplates.js');
            const tpl = welcomeEmail({ name: newUser.name, email: newUser.email });
            await sendTemplate({ to: newUser.email, subject: tpl.subject, html: tpl.html });
            console.log('✅ Welcome email sent to:', newUser.email);
        } catch (emailError) {
            console.warn('Failed to send welcome email:', emailError?.message);
        }

        // 7. Send success response
        setAuthCookies(res, { token, clientId: newUser.clientId });
        res.status(201).json({
            token,
            clientId: newUser.clientId,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                emailVerified: newUser.emailVerified
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
};

/**
 * Handles the login (sign in) of an existing user.
 */
export const login = async (req, res) => {
    const { email, password } = req.body;

    // 1. Basic validation
    if (!email || !password) {
        return res.status(400).json({ message: 'Please provide both email and password.' });
    }

    try {
        // 2. Find the user by email
        const user = await dbService.prisma.User.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // 3. Compare the provided password with the hashed password in the database
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // 4. Generate JWT Token
        const token = jwt.sign(
            { id: user.id, clientId: user.clientId },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        // 5. Send success response
        setAuthCookies(res, { token, clientId: user.clientId });
        res.status(200).json({
            token,
            clientId: user.clientId,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

/**
 * Handles forgot password - sends reset link via email
 */
export const forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
    }

    try {
        // Find user by email
        const user = await dbService.prisma.User.findUnique({ where: { email } });
        
        // Always return success for security (don't reveal if email exists)
        if (!user) {
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

        // Store reset token in database
        await dbService.prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                token: hashedToken,
                expiresAt
            }
        });

        // Create reset link
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        const resetLink = `${clientUrl}/reset-password?token=${resetToken}`;

        // Send email with reset link
        try {
            const tpl = forgotPasswordEmail({ name: user.name, link: resetLink });
            await sendTemplate({ to: user.email, subject: tpl.subject, html: tpl.html });
            console.log('✅ Password reset email sent to:', user.email);
        } catch (emailError) {
            console.error('❌ Failed to send reset email:', emailError);
            return res.status(500).json({
                success: false,
                message: 'Failed to send reset email. Please try again later.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
    }
};

/**
 * Handles password reset with token
 */
export const resetPassword = async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({
            success: false,
            message: 'Token, new password, and confirmation are required'
        });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({
            success: false,
            message: 'Passwords do not match'
        });
    }

    if (newPassword.length < 8 || newPassword.length > 100) {
        return res.status(400).json({
            success: false,
            message: 'Password must be between 8 and 100 characters'
        });
    }

    try {
        // Hash the token to match what's stored in database
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find valid reset token
        const resetRecord = await dbService.prisma.passwordResetToken.findFirst({
            where: {
                token: hashedToken,
                expiresAt: { gte: new Date() },
                used: false
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        password: true
                    }
                }
            }
        });

        if (!resetRecord) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Check if new password is same as old password
        const sameAsOld = await bcrypt.compare(newPassword, resetRecord.user.password);
        if (sameAsOld) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from your current password'
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update user password and mark token as used
        await dbService.prisma.$transaction([
            dbService.prisma.user.update({
                where: { id: resetRecord.userId },
                data: { password: hashedPassword }
            }),
            dbService.prisma.passwordResetToken.update({
                where: { id: resetRecord.id },
                data: { used: true }
            })
        ]);

        console.log('✅ Password reset successful for user:', resetRecord.user.email);

        // Send confirmation email
        try {
            const { passwordChanged } = await import('../templates/emailTemplates.js');
            const tpl = passwordChanged({ name: resetRecord.user.name });
            await sendTemplate({ to: resetRecord.user.email, subject: tpl.subject, html: tpl.html });
        } catch (e) {
            console.warn('Email(password changed confirmation) failed:', e?.message);
        }

        res.status(200).json({
            success: true,
            message: 'Password reset successful. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.'
        });
    }
};

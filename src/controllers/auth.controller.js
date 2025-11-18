// zuperior-dashboard/server/src/controllers/auth.controller.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dbService from '../services/db.service.js';
import * as mt5Service from '../services/mt5.service.js';
import { sendMt5AccountEmail, sendWelcomeEmail } from '../services/email.service.js';
import { toTitleCase } from '../utils/stringUtils.js';
import { parseUserAgent } from '../utils/userAgentParser.js';
import { sendTwoFactorOTP, verifyTwoFactorOTP } from '../services/twoFactor.service.js';
// Fix: Changed to namespace import for named exports

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
    console.log('🎯 REGISTER ENDPOINT CALLED:', { 
        name: req.body?.name, 
        email: req.body?.email,
        timestamp: new Date().toISOString() 
    });
    
    const { name, email, password, country, phone, emailVerified } = req.body;

    // 1. Basic validation - match exactly what the form sends
    if (!name || !email || !password) {
        console.log('❌ Validation failed - missing required fields');
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
        // Auto-capitalize the name (title case)
        const titleCaseName = toTitleCase(name);
        const newUser = await dbService.prisma.User.create({
            data: {
                name: titleCaseName,
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

        // 6. Send success response immediately
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
        
        // 6a. Send welcome email to new user (async, fire-and-forget)
        setImmediate(() => {
            sendWelcomeEmail({ to: newUser.email, userName: newUser.name }).catch(err => {
                console.error('💥 Failed to send welcome email:', err);
            });
        });
        console.log('✅ Welcome email scheduled to be sent to:', newUser.email);
        
        // 7. Create Standard Trading account for new user (async, fire-and-forget)
        // This runs in background and doesn't block the response
        console.log('📋 Registration successful, initiating MT5 account creation...', {
            userId: newUser.id,
            email: newUser.email,
            timestamp: new Date().toISOString()
        });
        
        // Create MT5 account creation function
        // NOTE: Using the original signup password (before hashing) as master password
        const createMT5Account = async () => {
            console.log('🔵 MT5 account creation function started executing...');
            try {
                console.log('🚀 Starting MT5 account creation for new user:', { userId: newUser.id, email });
                
                // Use the signup password as the master password for MT5 account
                // The password is still in the request body and hasn't been hashed in this scope
                const masterPassword = password; // Use the original signup password
                const investorPassword = masterPassword + 'Inv';
                
                console.log('🔐 Using signup password as MT5 master password');
                console.log('📝 Master password length:', masterPassword ? masterPassword.length : 0);
                
                // Use title-cased name for MT5 account
                const titleCaseName = toTitleCase(name);
                const standardAccountData = {
                    name: titleCaseName.trim(),
                    group: 'real\\Bbook\\Standard\\dynamic-2000x-20Pips',
                    leverage: 2000, // Changed from 1000 to 2000 as per requirement
                    masterPassword: masterPassword,
                    investorPassword: investorPassword,
                    email: email || '',
                    country: country || '',
                    city: '',
                    phone: phone || '',
                    comment: 'Auto-created Standard account on registration'
                };

                console.log('📝 Standard account data:', JSON.stringify({
                    ...standardAccountData,
                    masterPassword: '[REDACTED]', // Don't log password in production
                    investorPassword: '[REDACTED]'
                }, null, 2));
                
                // Call MT5 API to create account using the service
                // openMt5Account returns response.data.Data when Success === true
                const mt5Response = await mt5Service.openMt5Account(standardAccountData);
                console.log('📊 MT5 API Response (Data):', JSON.stringify(mt5Response, null, 2));
                console.log('🔍 MT5 Response Type:', typeof mt5Response);
                console.log('🔍 MT5 Response Keys:', mt5Response ? Object.keys(mt5Response) : 'null');
                
                // Extract login from the data (service already extracted Data portion)
                const mt5Login = mt5Response?.Login || mt5Response?.login || mt5Response?.Login || mt5Response?.accountId;

                if (!mt5Login || mt5Login === 0) {
                    console.error('❌ MT5 account creation did not return a valid login ID');
                    console.error('📊 Full response:', JSON.stringify(mt5Response, null, 2));
                    throw new Error('MT5 API did not return an account login.');
                }

                console.log('✅ Standard MT5 account created successfully:', mt5Login);

                // Store MT5 account in database with Live account type (default for registration)
                // Determine package from group (Standard or Pro)
                const groupLower = standardAccountData.group.toLowerCase();
                const packageValue = groupLower.includes('pro') ? 'Pro' : 'Startup';
                
                let dbSaved = false;
                try {
                    // Use title-cased name for nameOnAccount
                    const titleCaseNameOnAccount = toTitleCase(name);
                    await dbService.prisma.mT5Account.create({
                        data: {
                            accountId: mt5Login.toString(),
                            userId: newUser.id,
                            accountType: 'Live',
                            password: masterPassword, // Store the signup password as master password
                            leverage: 2000, // Changed from 1000 to 2000 as per requirement
                            nameOnAccount: titleCaseNameOnAccount.trim(), // Store the name on account (title case)
                            package: packageValue // Store the package (Startup or Pro)
                        }
                    });
                    console.log('✅ MT5 account stored in database:', {
                        accountId: mt5Login.toString(),
                        accountType: 'Live',
                        leverage: 2000,
                        nameOnAccount: titleCaseNameOnAccount.trim(),
                        package: packageValue
                    });
                    dbSaved = true;
                } catch (dbError) {
                    console.error('❌ Failed to store MT5 account in database:', dbError.message);
                    console.error('📊 Database error details:', dbError);
                    // Continue to send email even if DB save fails (account exists in MT5)
                }
                
                // Send welcome email with account details
                try {
                    console.log('📧 Preparing to send welcome email...');
                    await sendMt5AccountEmail({
                        to: email,
                        userName: titleCaseName, // Use title-cased name
                        accountName: standardAccountData.name,
                        login: mt5Login,
                        group: standardAccountData.group,
                        leverage: 2000, // Changed from 1000 to 2000
                        masterPassword: masterPassword,
                        investorPassword: investorPassword,
                        accountType: 'Live'
                    });
                    console.log('✅ Welcome email sent to user with MT5 account details');
                } catch (emailError) {
                    console.error('❌ Failed to send welcome email:', emailError.message);
                    console.error('📊 Email error details:', emailError);
                    // Account is created even if email fails - don't throw
                }
                
            } catch (mt5Error) {
                // Log full error details for debugging
                console.error('❌ Failed to create standard MT5 account for user:', newUser.id);
                console.error('📊 Error message:', mt5Error.message);
                console.error('📊 Error stack:', mt5Error.stack);
                if (mt5Error.response) {
                    console.error('📊 Error response status:', mt5Error.response.status);
                    console.error('📊 Error response data:', JSON.stringify(mt5Error.response.data, null, 2));
                }
                // Registration already succeeded, account creation failure is handled gracefully
            }
        };
        
        // Execute immediately after response is sent using setImmediate
        setImmediate(() => {
            createMT5Account().catch(err => {
                console.error('💥 Unhandled error in MT5 account creation:', err);
            });
        });
        
        // Also log that we scheduled it
        console.log('✅ MT5 account creation scheduled to run with leverage 2000 and signup password as master password');

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

        // 3.5. Check if user is active
        if (user.status !== 'active' && user.status !== 'Active') {
            const statusMessage = user.status ? user.status.charAt(0).toUpperCase() + user.status.slice(1).toLowerCase() : 'Inactive';
            return res.status(403).json({ 
                message: `You are ${statusMessage} user and not allowed please contact support.` 
            });
        }

        // 3.6. Check if 2FA is enabled
        if (user.twoFactorEnabled) {
            try {
                // Send 2FA OTP
                const otpResult = await sendTwoFactorOTP(user.email, user.name);
                
                return res.status(200).json({
                    requiresTwoFactor: true,
                    otpKey: otpResult.otpKey,
                    message: 'Please verify the OTP sent to your email to complete login.',
                });
            } catch (otpError) {
                console.error('Error sending 2FA OTP:', otpError);
                return res.status(500).json({
                    message: 'Failed to send verification code. Please try again.',
                });
            }
        }

        // 4. Generate JWT Token (only if 2FA is not enabled)
        const token = jwt.sign(
            { id: user.id, clientId: user.clientId },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        // 4.5. Generate Refresh Token
        const refreshToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + TOKEN_MAX_AGE_MS);

        // 5. Parse user agent and create login log + refresh token (async, fire-and-forget)
        setImmediate(async () => {
            try {
                const userAgent = req.headers['user-agent'] || '';
                const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || null;
                console.log(`[Login Log] 📝 User Agent received: ${userAgent.substring(0, 100)}...`);
                
                const parsed = parseUserAgent(userAgent);
                const { device, browser } = parsed;
                const deviceName = device ? `${device}${browser ? ` - ${browser}` : ''}` : null;
                
                console.log(`[Login Log] 🔍 Parsed - Device: ${device}, Browser: ${browser}`);
                
                // Create refresh token with device info
                try {
                    await dbService.prisma.RefreshToken.create({
                        data: {
                            id: crypto.randomBytes(16).toString('hex'), // VarChar ID
                            userId: user.id,
                            token: refreshToken,
                            expiresAt: expiresAt,
                            deviceName: deviceName,
                            ipAddress: ipAddress,
                            userAgent: userAgent || null,
                            lastActivity: new Date(),
                            revoked: false,
                        }
                    });
                    console.log(`✅ Refresh token created for user ${user.id}`);
                } catch (tokenError) {
                    console.warn('⚠️ Failed to create refresh token:', tokenError.message);
                    // Don't block login if token creation fails
                }
                
                // Create login activity log
                const loginLog = await dbService.prisma.UserLoginLog.create({
                    data: {
                        userId: user.id,
                        user_agent: userAgent || null,
                        device: device || null,
                        browser: browser || null,
                        success: true,
                    }
                });
                
                console.log(`✅ Login activity logged successfully for user ${user.id}:`, {
                    logId: loginLog.id,
                    device: loginLog.device,
                    browser: loginLog.browser,
                    userAgent: loginLog.user_agent ? loginLog.user_agent.substring(0, 50) + '...' : null
                });
            } catch (logError) {
                console.error('⚠️ Failed to log login activity:', logError);
                console.error('⚠️ Error details:', {
                    message: logError.message,
                    stack: logError.stack,
                    userId: user.id
                });
                // Don't block login if logging fails
            }
        });

        // 6. Send success response
        setAuthCookies(res, { token, clientId: user.clientId });
        res.status(200).json({
            token,
            refreshToken, // Include refresh token in response
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
 * Handles 2FA verification during login
 * POST /api/auth/verify-two-factor-login
 */
export const verifyTwoFactorLogin = async (req, res) => {
    const { email, otpKey, otp } = req.body;

    // 1. Basic validation
    if (!email || !otpKey || !otp) {
        return res.status(400).json({ 
            success: false,
            message: 'Email, OTP key, and OTP are required.' 
        });
    }

    try {
        // 2. Find the user by email
        const user = await dbService.prisma.User.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid credentials.' 
            });
        }

        // 3. Check if 2FA is enabled
        if (!user.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                message: 'Two-factor authentication is not enabled for this account.',
            });
        }

        // 4. Verify OTP
        const verification = await verifyTwoFactorOTP(otpKey, otp, email);
        
        if (!verification.valid) {
            return res.status(400).json({
                success: false,
                message: verification.message || 'Invalid or expired OTP.',
            });
        }

        // 5. Check if user is active
        if (user.status !== 'active' && user.status !== 'Active') {
            const statusMessage = user.status ? user.status.charAt(0).toUpperCase() + user.status.slice(1).toLowerCase() : 'Inactive';
            return res.status(403).json({ 
                success: false,
                message: `You are ${statusMessage} user and not allowed please contact support.` 
            });
        }

        // 6. Generate JWT Token
        const token = jwt.sign(
            { id: user.id, clientId: user.clientId },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        // 7. Generate Refresh Token
        const refreshToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + TOKEN_MAX_AGE_MS);

        // 8. Parse user agent and create login log + refresh token (async, fire-and-forget)
        setImmediate(async () => {
            try {
                const userAgent = req.headers['user-agent'] || '';
                const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || null;
                
                const parsed = parseUserAgent(userAgent);
                const { device, browser } = parsed;
                const deviceName = device ? `${device}${browser ? ` - ${browser}` : ''}` : null;
                
                // Create refresh token with device info
                try {
                    await dbService.prisma.RefreshToken.create({
                        data: {
                            id: crypto.randomBytes(16).toString('hex'),
                            userId: user.id,
                            token: refreshToken,
                            expiresAt: expiresAt,
                            deviceName: deviceName,
                            ipAddress: ipAddress,
                            userAgent: userAgent || null,
                            lastActivity: new Date(),
                            revoked: false,
                        }
                    });
                } catch (tokenError) {
                    console.warn('⚠️ Failed to create refresh token:', tokenError.message);
                }
                
                // Create login activity log
                await dbService.prisma.UserLoginLog.create({
                    data: {
                        userId: user.id,
                        user_agent: userAgent || null,
                        device: device || null,
                        browser: browser || null,
                        success: true,
                    }
                });
            } catch (logError) {
                console.error('⚠️ Failed to log login activity:', logError);
            }
        });

        // 9. Send success response
        setAuthCookies(res, { token, clientId: user.clientId });
        res.status(200).json({
            success: true,
            token,
            refreshToken,
            clientId: user.clientId,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error('2FA verification error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error during 2FA verification.' 
        });
    }
};

/**
 * Handles token refresh using refresh token
 * POST /api/auth/refresh
 */
export const refreshToken = async (req, res) => {
    try {
        const { refreshToken: refreshTokenValue } = req.body;

        if (!refreshTokenValue) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        // Find the refresh token in database
        const refreshTokenRecord = await dbService.prisma.RefreshToken.findUnique({
            where: { token: refreshTokenValue },
            include: { User: true }
        });

        if (!refreshTokenRecord) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Check if token is revoked
        if (refreshTokenRecord.revoked) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token has been revoked'
            });
        }

        // Check if token is expired
        if (new Date() > refreshTokenRecord.expiresAt) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token has expired'
            });
        }

        // Check if user exists and is active
        const user = refreshTokenRecord.User;
        if (!user || user.status !== 'active') {
            return res.status(401).json({
                success: false,
                message: 'User account is not active'
            });
        }

        // Update last activity
        await dbService.prisma.RefreshToken.update({
            where: { id: refreshTokenRecord.id },
            data: { lastActivity: new Date() }
        });

        // Generate new JWT token
        const newToken = jwt.sign(
            { id: user.id, clientId: user.clientId },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Set new token in cookies
        setAuthCookies(res, { token: newToken, clientId: user.clientId });

        return res.status(200).json({
            success: true,
            token: newToken,
            clientId: user.clientId,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during token refresh'
        });
    }
};

/**
 * Handles user logout by clearing all authentication cookies and revoking refresh token
 */
export const logout = async (req, res) => {
    try {
        // Get refresh token from request if available
        const { refreshToken: refreshTokenValue } = req.body;
        
        // If refresh token provided, revoke it
        if (refreshTokenValue) {
            try {
                await dbService.prisma.RefreshToken.updateMany({
                    where: {
                        token: refreshTokenValue,
                        revoked: { not: true }
                    },
                    data: {
                        revoked: true,
                        lastActivity: new Date()
                    }
                });
            } catch (tokenError) {
                console.warn('Could not revoke refresh token:', tokenError.message);
            }
        }

        // Clear all authentication cookies
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 0, // Expire immediately
        };

        // Clear token cookie
        res.clearCookie('token', cookieOptions);
        
        // Clear clientId cookie
        res.clearCookie('clientId', {
            ...cookieOptions,
            httpOnly: false, // clientId is not httpOnly
        });

        // Also try to clear any other potential auth cookies
        res.clearCookie('access_token', cookieOptions);
        res.clearCookie('accessToken', cookieOptions);
        res.clearCookie('userToken', cookieOptions);
        res.clearCookie('session', cookieOptions);

        return res.status(200).json({
            success: true,
            message: 'Logged out successfully. All cookies cleared.'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error during logout.' 
        });
    }
};
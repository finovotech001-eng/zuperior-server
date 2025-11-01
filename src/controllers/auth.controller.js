// zuperior-dashboard/server/src/controllers/auth.controller.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dbService from '../services/db.service.js';
import * as mt5Service from '../services/mt5.service.js';
import { sendMt5AccountEmail, sendWelcomeEmail } from '../services/email.service.js';
import { toTitleCase } from '../utils/stringUtils.js';
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
                const packageValue = groupLower.includes('pro') ? 'Pro' : 'Standard';
                
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
                            package: packageValue // Store the package (Standard or Pro)
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
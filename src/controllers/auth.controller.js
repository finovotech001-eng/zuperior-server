// zuperior-dashboard/server/src/controllers/auth.controller.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dbService from '../services/db.service.js';
import * as mt5Service from '../services/mt5.service.js';
import { sendMt5AccountEmail } from '../services/email.service.js';
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
        
        // 7. Create Standard Trading account for new user (async, fire-and-forget)
        // This runs in background and doesn't block the response
        setImmediate(async () => {
            try {
                // Generate passwords for MT5 account
                const masterPassword = crypto.randomBytes(8).toString('hex');
                const investorPassword = masterPassword + 'inv';
                
                const standardAccountData = {
                    name: name.trim(),
                    group: 'real\\Bbook\\Standard\\dynamic-2000x-20Pips',
                    leverage: 100,
                    masterPassword: masterPassword,
                    investorPassword: investorPassword,
                    password: masterPassword,
                    email: email || '',
                    country: country || '',
                    city: '',
                    phone: phone || '',
                    comment: 'Auto-created Standard account on registration'
                };

                console.log('🚀 Creating standard MT5 account for new user...');
                console.log('📝 Standard account data:', standardAccountData);
                
                const mt5Response = await mt5Service.openMt5Account(standardAccountData);
                console.log('📊 MT5 API Response:', JSON.stringify(mt5Response, null, 2));
                console.log('🔍 MT5 Response Type:', typeof mt5Response);
                console.log('🔍 MT5 Response Keys:', mt5Response ? Object.keys(mt5Response) : 'null');
                
                // openMt5Account returns just the Data portion
                // So mt5Response IS the data object itself
                const mt5Login = mt5Response?.Login || mt5Response?.login || mt5Response?.Login || mt5Response?.accountId;

                if (mt5Login) {
                    console.log('✅ Standard MT5 account created successfully:', mt5Login);

                    // Store MT5 account in database with Live account type (default for registration)
                    await dbService.prisma.mT5Account.create({
                        data: {
                            accountId: mt5Login.toString(),
                            userId: newUser.id,
                            accountType: 'Live',
                            password: masterPassword,
                            leverage: 100
                        }
                    });
                    
                    console.log('✅ MT5 account stored in database');
                    
                    // Send welcome email with account details
                    console.log('📧 Preparing to send welcome email...');
                    await sendMt5AccountEmail({
                        to: email,
                        userName: name,
                        accountName: standardAccountData.name,
                        accountType: 'Live',
                        login: mt5Login,
                        group: standardAccountData.group,
                        leverage: 100,
                        masterPassword: masterPassword,
                        investorPassword: investorPassword
                    });

                    console.log('✅ Welcome email sent to user with MT5 account details');
                } else {
                    console.error('⚠️ MT5 account creation did not return a valid login ID');
                }
            } catch (mt5Error) {
                // Log error but don't block registration success
                console.error('⚠️ Failed to create standard MT5 account:', mt5Error.message);
                // Registration already succeeded, account creation failure is handled gracefully
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

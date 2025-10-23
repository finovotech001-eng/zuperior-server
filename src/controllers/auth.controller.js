// zuperior-dashboard/server/src/controllers/auth.controller.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dbService from '../services/db.service.js';

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
    const { name, email, password, country, phone } = req.body;

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
            },
            // Select fields to return
            select: { id: true, clientId: true, name: true, email: true },
        });

        // 5. Generate JWT Token
        const token = jwt.sign(
            { id: newUser.id, clientId: newUser.clientId },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        // 6. Send success response
        setAuthCookies(res, { token, clientId: newUser.clientId });
        res.status(201).json({
            token,
            clientId: newUser.clientId,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email
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

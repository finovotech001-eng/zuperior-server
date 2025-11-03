// zuperior-dashboard/server/src/index.js

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.routes.js'; // Ensure this path is correct
import userRoutes from './routes/user.routes.js';

// --- Configuration ---
const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// --- Middleware ---
const defaultClientOrigin = 'http://localhost:3000';

// Configure CORS with explicit origin function
app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            
            const allowedOrigins = (process.env.CLIENT_URL || defaultClientOrigin)
                .split(',')
                .map((origin) => origin.trim().replace(/\/$/, ''))
                .filter(Boolean);
            
            // Always allow localhost:3000 for development
            allowedOrigins.push('http://localhost:3000');
            
            console.log('CORS request from origin:', origin);
            console.log('Allowed origins:', allowedOrigins);
            
            if (allowedOrigins.includes(origin)) {
                console.log('CORS: Allowing origin:', origin);
                callback(null, true);
            } else {
                console.log('CORS: Blocking origin:', origin);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
        exposedHeaders: ["Authorization"],
        maxAge: 86400, // 24 hours
    })
);

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept images and PDFs only
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
        }
    }
});

// Body parsing middleware - Increase limit for base64-encoded images (up to 10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Make multer upload available globally
app.use((req, res, next) => {
    req.upload = upload;
    next();
});

// Ensure multipart form data (with optional proof file) is parsed
app.use('/api/manual-deposit/create', (req, res, next) => {
    upload.single('proofFile')(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'File upload error'
            });
        }
        next();
    });
});

// --- Health Check Route ---
app.get('/', (req, res) => {
    res.status(200).send('Zuperior API is running!');
});

// --- Routes ---
app.use('/api', authRoutes); // Authentication routes (Login/Register)
app.use('/api/user', userRoutes);

// --- Start Server ---
async function main() {
    try {
        await prisma.$connect();
        console.log('Database connected successfully.');

        // Ensure minimal required tables exist if migrations haven't run
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "PaymentMethod" (
                  "id" TEXT PRIMARY KEY,
                  "userId" TEXT NOT NULL,
                  "address" TEXT NOT NULL,
                  "currency" TEXT NOT NULL DEFAULT 'USDT',
                  "network" TEXT NOT NULL DEFAULT 'TRC20',
                  "status" TEXT NOT NULL DEFAULT 'pending',
                  "approvedAt" TIMESTAMP(3),
                  "approvedBy" TEXT,
                  "rejectionReason" TEXT,
                  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentMethod_userId_idx" ON "PaymentMethod" ("userId")`);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentMethod_status_idx" ON "PaymentMethod" ("status")`);
            console.log('Ensured PaymentMethod table exists.');
        } catch (e) {
            console.warn('Could not ensure PaymentMethod table:', e.message);
        }

        // Initialize Socket.IO
        try {
            const { initSocket } = await import('./socket.js');
            initSocket(server);
            console.log('Socket.IO initialized');
        } catch (e) {
            console.warn('Socket.IO not initialized:', e.message);
        }

        server.listen(PORT, async () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`API URL: http://localhost:${PORT}/`);

            // Register MT5 routes after server starts
            try {
                const mt5Routes = await import('./routes/mt5.routes.js');
                app.use('/api', mt5Routes.default);
                console.log('MT5 routes registered at /api/mt5/*');
            } catch (error) {
                console.error('Failed to load MT5 routes:', error.message);
            }

            // Register KYC routes
            try {
                const kycRoutes = await import('./routes/kyc.routes.js');
                app.use('/api', kycRoutes.default);
                console.log('KYC routes registered at /api/kyc/*');
            } catch (error) {
                console.error('Failed to load KYC routes:', error.message);
            }

            // Register Manual Deposit routes
            try {
                const manualDepositRoutes = await import('./routes/manualDeposit.routes.js');
                app.use('/api', manualDepositRoutes.default);
                console.log('Manual Deposit routes registered at /api/manual-deposit/*');
            } catch (error) {
                console.error('Failed to load Manual Deposit routes:', error.message);
            }

            // Register Admin routes
            try {
                const adminRoutes = await import('./routes/admin.routes.js');
                app.use('/api/admin', adminRoutes.default);
                console.log('Admin routes registered at /api/admin/*');
            } catch (error) {
                console.error('Failed to load Admin routes:', error.message);
            }

            // Register Internal Transfer routes
            try {
                const internalTransferRoutes = await import('./routes/internalTransfer.routes.js');
                app.use('/api', internalTransferRoutes.default);
                console.log('Internal Transfer routes registered at /api/internal-transfer');
            } catch (error) {
                console.error('Failed to load Internal Transfer routes:', error.message);
            }

            // Register Withdrawal routes
            try {
                const withdrawalRoutes = await import('./routes/withdrawal.routes.js');
                app.use('/api', withdrawalRoutes.default);
                console.log('Withdrawal routes registered at /api/withdraw/*');
            } catch (error) {
                console.error('Failed to load Withdrawal routes:', error.message);
            }

            // Register Support routes
            try {
                const supportRoutes = await import('./routes/support.routes.js');
                app.use('/api/support', supportRoutes.default);
                console.log('Support routes registered at /api/support/*');
            } catch (error) {
                console.error('Failed to load Support routes:', error.message);
            }
        });
    } catch (error) {
        console.error('Failed to start server or connect to database:', error);
        process.exit(1);
    }
}

main();

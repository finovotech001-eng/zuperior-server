// server/src/app.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';

dotenv.config();
const app = express();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Import Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import mt5Routes from './routes/mt5.routes.js';
import depositRoutes from './routes/deposit.routes.js';
import adminRoutes from './routes/admin.routes.js';
import kycRoutes from './routes/kyc.routes.js';
import internalTransferRoutes from './routes/internalTransfer.routes.js';
// ... import other routes (txRoutes, kycRoutes)

// Middleware
const defaultOrigin = "http://localhost:3000";
const corsOrigins = (process.env.CLIENT_URL || defaultOrigin)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
); // CORS configured to allow trusted origins
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add multer upload to request object for routes that need it
app.use('/api/deposit/create', (req, res, next) => {
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

// Add multer for manual deposit route
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

// Routes
// Note: Use /v1/ or /api/ for your endpoint prefix to match your Next.js proxy pattern
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', mt5Routes);
app.use('/api', depositRoutes);
app.use('/api', adminRoutes);
app.use('/api', kycRoutes);
app.use('/api', internalTransferRoutes);
// app.use('/api', txRoutes);

// Simple health check
app.get('/', (req, res) => res.status(200).send('ZuperiorCRM Backend Running!'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('MT5 routes registered at /api/mt5/*');
});

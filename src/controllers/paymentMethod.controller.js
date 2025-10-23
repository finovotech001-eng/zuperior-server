import dbService from '../services/db.service.js';
import { randomUUID } from 'crypto';

// Create a new payment method for the user
export const createPaymentMethod = async (req, res) => {
  try {
    const { address, currency, network } = req.body;
    const userId = req.user.id; // Assuming user is authenticated

    if (!address) {
      return res.status(400).json({
        status: 'Error',
        message: 'Wallet address is required'
      });
    }

    // No validation on address format

    let paymentMethod;
    try {
      paymentMethod = await dbService.prisma.paymentMethod.create({
        data: {
          id: randomUUID(),
          userId,
          address,
          currency: currency || 'USDT',
          network: (network || 'TRC20').replace(/[-\s]/g, ''),
          status: 'pending'
        }
      });
    } catch (innerErr) {
      const msg = String(innerErr?.message || innerErr);
      // Handle table not existing: create it and retry once
      if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('P2021')) {
        try {
          await dbService.prisma.$executeRawUnsafe(`
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
          paymentMethod = await dbService.prisma.paymentMethod.create({
            data: {
              id: randomUUID(),
              userId,
              address,
              currency: currency || 'USDT',
              network: (network || 'TRC20').replace(/[-\s]/g, ''),
              status: 'pending'
            }
          });
        } catch (retryErr) {
          console.error('Retry create payment method failed:', retryErr);
          throw retryErr;
        }
      } else {
        throw innerErr;
      }
    }

    return res.status(201).json({
      status: 'Success',
      message: 'Payment method submitted for approval',
      data: paymentMethod
    });
  } catch (error) {
    console.error('Error creating payment method:', error);
    return res.status(500).json({
      status: 'Error',
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get user's payment methods
export const getUserPaymentMethods = async (req, res) => {
  try {
    const userId = req.user.id;

    const rows = await dbService.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    // Shape response to match frontend expectations
    const data = rows.map(r => ({
      id: r.id,
      address: r.address,
      currency: r.currency,
      network: r.network,
      status: r.status,
      submittedAt: r.createdAt,
      approvedAt: r.approvedAt ?? undefined,
      rejectionReason: r.rejectionReason ?? undefined,
    }));

    return res.status(200).json({ status: 'Success', data });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    return res.status(500).json({
      status: 'Error',
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Admin: Get all payment methods
export const getAllPaymentMethods = async (req, res) => {
  try {
    const { status } = req.query;

    const where = status ? { status } : {};

    const paymentMethods = await dbService.prisma.paymentMethod.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      status: 'Success',
      data: paymentMethods
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    return res.status(500).json({
      status: 'Error',
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Admin: Approve payment method
export const approvePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const paymentMethod = await dbService.prisma.paymentMethod.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: adminId
      }
    });

    return res.status(200).json({
      status: 'Success',
      message: 'Payment method approved',
      data: paymentMethod
    });
  } catch (error) {
    console.error('Error approving payment method:', error);
    return res.status(500).json({
      status: 'Error',
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Admin: Reject payment method
export const rejectPaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    const paymentMethod = await dbService.prisma.paymentMethod.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectionReason: reason,
        approvedBy: adminId
      }
    });

    return res.status(200).json({
      status: 'Success',
      message: 'Payment method rejected',
      data: paymentMethod
    });
  } catch (error) {
    console.error('Error rejecting payment method:', error);
    return res.status(500).json({
      status: 'Error',
      message: 'Internal server error',
      error: error.message
    });
  }
};

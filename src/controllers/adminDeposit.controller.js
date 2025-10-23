// server/src/controllers/adminDeposit.controller.js

import { PrismaClient } from '@prisma/client';
import { depositMt5Balance } from '../services/mt5.service.js';
import { logActivity } from './activityLog.controller.js';

const prisma = new PrismaClient();

// Get all manual deposits with filters
export const getAllManualDeposits = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      status = '',
      userId = '',
      startDate = '',
      endDate = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    if (status) {
      where.status = status;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Get deposits with user info
    const deposits = await prisma.Deposit.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            clientId: true
          }
        }
      },
      orderBy: {
        [sortBy]: sortOrder
      },
      skip,
      take: limitNum
    });

    // Get total count for pagination
    const total = await prisma.Deposit.count({ where });

    res.json({
      success: true,
      data: {
        deposits,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching manual deposits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manual deposits'
    });
  }
};

// Get deposit by ID with full details
export const getDepositById = async (req, res) => {
  try {
    const { id } = req.params;

    const deposit = await prisma.ManualDeposit.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            clientId: true,
            phone: true,
            country: true
          }
        }
      }
    });

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: 'Deposit not found'
      });
    }

    res.json({
      success: true,
      data: deposit
    });
  } catch (error) {
    console.error('Error fetching deposit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deposit'
    });
  }
};

// Approve deposit
export const approveDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    const deposit = await prisma.ManualDeposit.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: 'Deposit not found'
      });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Deposit is not in pending status'
      });
    }

    // Call MT5 API to deposit balance
    try {
      const mt5Response = await depositMt5Balance(
        deposit.mt5AccountId,
        deposit.amount,
        comment || `Manual deposit approved - ${deposit.id}`
      );

      if (!mt5Response.success) {
        // Update MT5 transaction to failed
        await prisma.MT5Transaction.updateMany({
          where: { 
            depositId: id,
            status: 'pending'
          },
          data: {
            status: 'failed',
            comment: `MT5 deposit failed - ${mt5Response.message || 'Unknown error'}`,
            processedBy: req.user.id,
            processedAt: new Date(),
            updatedAt: new Date()
          }
        });

        return res.status(400).json({
          success: false,
          message: 'Failed to deposit to MT5 account',
          details: mt5Response.message
        });
      }

      // Update deposit status
      const updatedDeposit = await prisma.Deposit.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: req.user.id,
          approvedAt: new Date(),
          processedAt: new Date()
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      // Update existing MT5 transaction record to completed
      await prisma.MT5Transaction.updateMany({
        where: { 
          depositId: id,
          status: 'pending'
        },
        data: {
          status: 'completed',
          processedBy: req.user.id,
          processedAt: new Date(),
          comment: comment || `Manual deposit approved - ${deposit.id}`,
          updatedAt: new Date()
        }
      });

      // Update linked transaction status to completed
      await prisma.Transaction.updateMany({
        where: { depositId: id },
        data: {
          status: 'completed',
          transactionId: deposit.transactionHash || deposit.id,
          updatedAt: new Date()
        }
      });

      // Log activity
      await logActivity(
        deposit.userId,
        req.user.id,
        'approve',
        'deposit',
        {
          entityId: id,
          amount: deposit.amount,
          mt5AccountId: deposit.mt5AccountId,
          comment
        },
        req.ip,
        req.get('User-Agent')
      );

      res.json({
        success: true,
        data: updatedDeposit,
        message: 'Deposit approved successfully'
      });
    } catch (mt5Error) {
      console.error('MT5 API error:', mt5Error);
      
      // Update MT5 transaction to failed
      await prisma.MT5Transaction.updateMany({
        where: { 
          depositId: id,
          status: 'pending'
        },
        data: {
          status: 'failed',
          comment: `MT5 deposit error - ${mt5Error.message}`,
          processedBy: req.user.id,
          processedAt: new Date(),
          updatedAt: new Date()
        }
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to process MT5 deposit',
        details: mt5Error.message
      });
    }
  } catch (error) {
    console.error('Error approving deposit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve deposit'
    });
  }
};

// Reject deposit
export const rejectDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const deposit = await prisma.Deposit.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: 'Deposit not found'
      });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Deposit is not in pending status'
      });
    }

    // Update deposit status
    const updatedDeposit = await prisma.Deposit.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectionReason,
        rejectedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Update MT5 transaction to rejected
    await prisma.MT5Transaction.updateMany({
      where: { 
        depositId: id,
        status: 'pending'
      },
      data: {
        status: 'rejected',
        comment: rejectionReason || 'Deposit rejected',
        processedBy: req.user.id,
        processedAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Update linked transaction status to rejected
    await prisma.Transaction.updateMany({
      where: { depositId: id },
      data: {
        status: 'rejected',
        updatedAt: new Date()
      }
    });

    // Log activity
    await logActivity(
      deposit.userId,
      req.user.id,
      'reject',
      'deposit',
      {
        entityId: id,
        amount: deposit.amount,
        rejectionReason
      },
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      data: updatedDeposit,
      message: 'Deposit rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting deposit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject deposit'
    });
  }
};

// Get deposit statistics
export const getDepositStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get deposit counts by status
    const statusStats = await prisma.Deposit.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        status: true
      },
      _sum: {
        amount: true
      }
    });

    // Get total amounts
    const totalStats = await prisma.Deposit.aggregate({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _sum: {
        amount: true
      },
      _count: true
    });

    // Get daily deposit amounts
    const dailyStats = await prisma.$queryRaw`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM "Deposit"
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    res.json({
      success: true,
      data: {
        statusStats,
        totalStats,
        dailyStats,
        period: `${days} days`
      }
    });
  } catch (error) {
    console.error('Error fetching deposit stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deposit statistics'
    });
  }
};


// server/src/controllers/adminWithdrawal.controller.js

import { PrismaClient } from '@prisma/client';
import { withdrawMt5Balance } from '../services/mt5.service.js';
import { logActivity } from './activityLog.controller.js';

const prisma = new PrismaClient();

// Get all withdrawals with filters
export const getAllWithdrawals = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      status = '',
      method = '',
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

    if (method) {
      where.method = method;
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

    // Get withdrawals with user info
    const withdrawals = await prisma.Withdrawal.findMany({
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
    const total = await prisma.Withdrawal.count({ where });

    res.json({
      success: true,
      data: {
        withdrawals,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawals'
    });
  }
};

// Get withdrawal by ID with full details
export const getWithdrawalById = async (req, res) => {
  try {
    const { id } = req.params;

    const withdrawal = await prisma.Withdrawal.findUnique({
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

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    res.json({
      success: true,
      data: withdrawal
    });
  } catch (error) {
    console.error('Error fetching withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawal'
    });
  }
};

// Approve withdrawal
export const approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    const withdrawal = await prisma.Withdrawal.findUnique({
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

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal is not in pending status'
      });
    }

    // Call MT5 API to withdraw balance
    try {
      const mt5Response = await withdrawMt5Balance(
        withdrawal.mt5AccountId,
        withdrawal.amount,
        comment || `Withdrawal approved - ${withdrawal.id}`
      );

      if (!mt5Response.success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to withdraw from MT5 account',
          details: mt5Response.message
        });
      }

      // Update withdrawal status
      const updatedWithdrawal = await prisma.Withdrawal.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: req.user.id,
          approvedAt: new Date()
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

      // Create MT5 transaction record
      await prisma.MT5Transaction.create({
        data: {
          type: 'Withdrawal',
          amount: withdrawal.amount,
          status: 'completed',
          paymentMethod: withdrawal.method,
          transactionId: withdrawal.id,
          comment: comment || `Withdrawal approved - ${withdrawal.id}`,
          mt5AccountId: withdrawal.mt5AccountId
        }
      });

      // Update linked transaction status to completed
      await prisma.Transaction.updateMany({
        where: { withdrawalId: id },
        data: {
          status: 'completed',
          transactionId: withdrawal.id,
          updatedAt: new Date()
        }
      });

      // Log activity
      await logActivity(
        withdrawal.userId,
        req.user.id,
        'approve',
        'withdrawal',
        {
          entityId: id,
          amount: withdrawal.amount,
          method: withdrawal.method,
          mt5AccountId: withdrawal.mt5AccountId,
          comment
        },
        req.ip,
        req.get('User-Agent')
      );

      res.json({
        success: true,
        data: updatedWithdrawal,
        message: 'Withdrawal approved successfully'
      });
    } catch (mt5Error) {
      console.error('MT5 API error:', mt5Error);
      return res.status(500).json({
        success: false,
        message: 'Failed to process MT5 withdrawal',
        details: mt5Error.message
      });
    }
  } catch (error) {
    console.error('Error approving withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve withdrawal'
    });
  }
};

// Reject withdrawal
export const rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const withdrawal = await prisma.Withdrawal.findUnique({
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

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal is not in pending status'
      });
    }

    // Update withdrawal status
    const updatedWithdrawal = await prisma.Withdrawal.update({
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

    // Log activity
    await logActivity(
      withdrawal.userId,
      req.user.id,
      'reject',
      'withdrawal',
      {
        entityId: id,
        amount: withdrawal.amount,
        method: withdrawal.method,
        rejectionReason
      },
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      data: updatedWithdrawal,
      message: 'Withdrawal rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject withdrawal'
    });
  }
};

// Get withdrawal statistics
export const getWithdrawalStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get withdrawal counts by status
    const statusStats = await prisma.Withdrawal.groupBy({
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

    // Get withdrawal counts by method
    const methodStats = await prisma.Withdrawal.groupBy({
      by: ['method'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        method: true
      },
      _sum: {
        amount: true
      }
    });

    // Get total amounts
    const totalStats = await prisma.Withdrawal.aggregate({
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

    // Get daily withdrawal amounts
    const dailyStats = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM "Withdrawal"
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    res.json({
      success: true,
      data: {
        statusStats,
        methodStats,
        totalStats,
        dailyStats,
        period: `${days} days`
      }
    });
  } catch (error) {
    console.error('Error fetching withdrawal stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawal statistics'
    });
  }
};


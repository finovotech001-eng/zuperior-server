// server/src/controllers/adminStats.controller.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await prisma.User.count();

    // Get email unverified count
    const emailUnverified = await prisma.User.count({
      where: { emailVerified: false }
    });

    // Get KYC pending count
    const kycPending = await prisma.KYC.count({
      where: { verificationStatus: 'Pending' }
    });

    // Get total MT5 accounts
    const mt5Accounts = await prisma.MT5Account.count();

    // Get total deposits (approved)
    const totalDepositsResult = await prisma.ManualDeposit.aggregate({
      where: { status: 'approved' },
      _sum: { amount: true }
    });
    const totalDeposits = totalDepositsResult._sum.amount || 0;

    // Get total withdrawals (approved)
    const totalWithdrawalsResult = await prisma.Withdrawal.aggregate({
      where: { status: 'approved' },
      _sum: { amount: true }
    });
    const totalWithdrawals = totalWithdrawalsResult._sum.amount || 0;

    // Get pending deposits count
    const pendingDeposits = await prisma.ManualDeposit.count({
      where: { status: 'pending' }
    });

    // Get pending withdrawals count
    const pendingWithdrawals = await prisma.Withdrawal.count({
      where: { status: 'pending' }
    });

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = await prisma.ActivityLog.findMany({
      where: {
        createdAt: {
          gte: thirtyDaysAgo
        }
      },
      include: {
        admin: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20
    });

    // Group recent activity by entity for dashboard display
    const activityByEntity = recentActivity.reduce((acc, activity) => {
      if (!acc[activity.entity]) {
        acc[activity.entity] = [];
      }
      acc[activity.entity].push(activity);
      return acc;
    }, {});

    const dashboardData = {
      totalUsers,
      emailUnverified,
      kycPending,
      mt5Accounts,
      totalDeposits,
      totalWithdrawals,
      pendingDeposits,
      pendingWithdrawals,
      recentActivity: Object.entries(activityByEntity).map(([entity, activities]) => ({
        entity,
        count: activities.length,
        latest: activities[0]?.createdAt
      }))
    };

    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

// Get user statistics for a specific user
export const getUserStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.User.findUnique({
      where: { id: userId },
      include: {
        manualDeposits: {
          where: { status: 'approved' }
        },
        withdrawals: {
          where: { status: 'approved' }
        },
        mt5Accounts: true,
        transactions: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const totalDeposits = user.manualDeposits.reduce((sum, deposit) => sum + deposit.amount, 0);
    const totalWithdrawals = user.withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);

    const stats = {
      totalDeposits,
      totalWithdrawals,
      depositCount: user.manualDeposits.length,
      withdrawalCount: user.withdrawals.length,
      mt5Accounts: user.mt5Accounts.length,
      transactions: user.transactions.length,
      netAmount: totalDeposits - totalWithdrawals,
      accountBalance: user.mt5Accounts.reduce((sum, account) => sum + (account.balance || 0), 0),
      accountEquity: user.mt5Accounts.reduce((sum, account) => sum + (account.equity || 0), 0)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics'
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
    const statusStats = await prisma.ManualDeposit.groupBy({
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
    const totalStats = await prisma.ManualDeposit.aggregate({
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
      FROM "ManualDeposit"
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

// Get KYC statistics
export const getKycStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get KYC counts by status
    const statusStats = await prisma.KYC.groupBy({
      by: ['verificationStatus'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        verificationStatus: true
      }
    });

    // Get verification type stats
    const verificationStats = await prisma.KYC.aggregate({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        isDocumentVerified: true,
        isAddressVerified: true
      }
    });

    // Get daily KYC submissions
    const dailyStats = await prisma.$queryRaw`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM "KYC"
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    res.json({
      success: true,
      data: {
        statusStats,
        verificationStats,
        dailyStats,
        period: `${days} days`
      }
    });
  } catch (error) {
    console.error('Error fetching KYC stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KYC statistics'
    });
  }
};

// Get activity log statistics
export const getActivityStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get activity counts by action
    const actionStats = await prisma.ActivityLog.groupBy({
      by: ['action'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        action: true
      }
    });

    // Get activity counts by entity
    const entityStats = await prisma.ActivityLog.groupBy({
      by: ['entity'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        entity: true
      }
    });

    // Get daily activity counts
    const dailyStats = await prisma.$queryRaw`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM "ActivityLog"
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    res.json({
      success: true,
      data: {
        actionStats,
        entityStats,
        dailyStats,
        period: `${days} days`
      }
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity statistics'
    });
  }
};
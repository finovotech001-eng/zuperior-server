// server/src/controllers/admin.controller.js

import { logActivity } from './activityLog.controller.js';
import dbService from '../services/db.service.js';

// Get all users with pagination, search, and filters
export const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      search = '',
      status = '',
      kycStatus = '',
      emailVerified = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { clientId: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (status) {
      where.status = status;
    }

    if (emailVerified !== '') {
      where.emailVerified = emailVerified === 'true';
    }

    if (kycStatus) {
      where.kyc = {
        verificationStatus: kycStatus
      };
    }

    // Get users with relations
    const users = await dbService.prisma.user.findMany({
      where,
      include: {
        kyc: true,
        mt5Accounts: {
          select: {
            id: true,
            accountId: true,
            balance: true,
            equity: true,
            isEnabled: true
          }
        },
        manualDeposits: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true
          }
        },
        withdrawals: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            mt5Accounts: true,
            manualDeposits: true,
            withdrawals: true
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
    const total = await dbService.prisma.user.count({ where });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

// Get user by ID with full details
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await dbService.prisma.user.findUnique({
      where: { id },
      include: {
        kyc: true,
        mt5Accounts: {
          include: {
            mt5Transactions: {
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          }
        },
        manualDeposits: {
          orderBy: { createdAt: 'desc' }
        },
        withdrawals: {
          orderBy: { createdAt: 'desc' }
        },
        accounts: true,
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, country, status, role, emailVerified } = req.body;

    const user = await dbService.prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prepare update data
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (country !== undefined) updateData.country = country;
    if (status !== undefined) updateData.status = status;
    if (role !== undefined) updateData.role = role;
    if (emailVerified !== undefined) updateData.emailVerified = emailVerified;

    // Update user
    const updatedUser = await dbService.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        kyc: true,
        mt5Accounts: {
          select: {
            id: true,
            accountId: true,
            balance: true
          }
        }
      }
    });

    // Log activity
    await logActivity(
      id,
      req.user.id,
      'update',
      'user',
      {
        entityId: id,
        oldValues: {
          name: user.name,
          phone: user.phone,
          country: user.country,
          status: user.status,
          role: user.role,
          emailVerified: user.emailVerified
        },
        newValues: {
          name: updatedUser.name,
          phone: updatedUser.phone,
          country: updatedUser.country,
          status: updatedUser.status,
          role: updatedUser.role,
          emailVerified: updatedUser.emailVerified
        }
      },
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      data: updatedUser,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
};

// Ban/Unban user
export const banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;

    if (!action || !['ban', 'unban'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Valid action (ban/unban) is required'
      });
    }

    const user = await dbService.prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const newStatus = action === 'ban' ? 'banned' : 'active';

    // Update user status
    const updatedUser = await dbService.prisma.user.update({
      where: { id },
      data: {
        status: newStatus
      },
      include: {
        kyc: true,
        mt5Accounts: {
          select: {
            id: true,
            accountId: true
          }
        }
      }
    });

    // Log activity
    await logActivity(
      id,
      req.user.id,
      action,
      'user',
      {
        entityId: id,
        reason,
        oldStatus: user.status,
        newStatus: updatedUser.status
      },
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      data: updatedUser,
      message: `User ${action}ned successfully`
    });
  } catch (error) {
    console.error('Error banning user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to ban user'
    });
  }
};

// Get user statistics
export const getUserStats = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await dbService.prisma.user.findUnique({
      where: { id },
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
      netAmount: totalDeposits - totalWithdrawals
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

// Export users to CSV
export const exportUsers = async (req, res) => {
  try {
    const {
      status = '',
      kycStatus = '',
      emailVerified = '',
      startDate = '',
      endDate = ''
    } = req.query;

    // Build where clause
    const where = {};

    if (status) {
      where.status = status;
    }

    if (emailVerified !== '') {
      where.emailVerified = emailVerified === 'true';
    }

    if (kycStatus) {
      where.kyc = {
        verificationStatus: kycStatus
      };
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

    // Get users for export
    const users = await dbService.prisma.user.findMany({
      where,
      include: {
        kyc: true,
        mt5Accounts: {
          select: {
            accountId: true,
            balance: true,
            equity: true
          }
        },
        manualDeposits: {
          where: { status: 'approved' },
          select: { amount: true }
        },
        withdrawals: {
          where: { status: 'approved' },
          select: { amount: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Convert to CSV format
    const csvHeaders = [
      'Client ID',
      'Name',
      'Email',
      'Phone',
      'Country',
      'Status',
      'Role',
      'Email Verified',
      'KYC Status',
      'MT5 Accounts',
      'Total Deposits',
      'Total Withdrawals',
      'Created At'
    ];

    const csvRows = users.map(user => [
      user.clientId,
      user.name || '',
      user.email,
      user.phone || '',
      user.country || '',
      user.status,
      user.role,
      user.emailVerified ? 'Yes' : 'No',
      user.kyc?.verificationStatus || 'Not Submitted',
      user.mt5Accounts.length,
      user.manualDeposits.reduce((sum, deposit) => sum + deposit.amount, 0).toFixed(2),
      user.withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0).toFixed(2),
      user.createdAt.toISOString()
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="users_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export users'
    });
  }
};

// Get MT5 accounts for a specific user (Admin)
export const getUserMt5Accounts = async (req, res) => {
  try {
    const { id: userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Verify user exists
    const user = await dbService.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Fetch MT5 accounts for the user
    const accounts = await dbService.prisma.mT5Account.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' }
    });

    console.log('🔍 Admin fetching MT5 accounts for user:', userId);
    console.log('📊 Number of accounts found:', accounts.length);

    res.json({
      success: true,
      message: 'MT5 accounts retrieved successfully',
      data: {
        accounts: accounts.map(account => ({
          id: account.id,
          accountId: account.accountId,
          balance: account.balance,
          equity: account.equity,
          isEnabled: account.isEnabled,
          createdAt: account.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching user MT5 accounts:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

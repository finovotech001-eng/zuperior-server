// server/src/controllers/deposit.controller.js

console.log('Deposit controller loaded');

import { depositMt5Balance } from '../services/mt5.service.js';
import { logActivity } from './activityLog.controller.js';
import dbService from '../services/db.service.js';

// Create a new deposit request
export const createDeposit = async (req, res) => {
    try {
        // Handle FormData requests (forwarded from Next.js API)
        let mt5AccountId, amount, method = 'manual', transactionHash, proofFileUrl, bankDetails, cryptoAddress;

        // Check if this is FormData (from Next.js API proxy)
        if (req.body && typeof req.body === 'object' && req.body._boundary) {
            // This is FormData - extract fields
            mt5AccountId = req.body.fields?.mt5AccountId || req.body.mt5AccountId;
            amount = req.body.fields?.amount || req.body.amount;
            method = req.body.fields?.method || req.body.method || 'manual';
            transactionHash = req.body.fields?.transactionHash || req.body.transactionHash;
            proofFileUrl = req.body.fields?.proofFileUrl || req.body.proofFileUrl;
            bankDetails = req.body.fields?.bankDetails || req.body.bankDetails;
            cryptoAddress = req.body.fields?.cryptoAddress || req.body.cryptoAddress;

            // Handle file if present
            if (req.body.file || req.file) {
                const file = req.body.file || req.file;
                proofFileUrl = `https://storage.example.com/proof-files/${Date.now()}-${file.originalname}`;
                console.log('📁 File uploaded:', file.originalname);
            }
        } else {
            // Handle direct JSON request or regular form data
            mt5AccountId = req.body.mt5AccountId;
            amount = req.body.amount;
            method = req.body.method || 'manual';
            transactionHash = req.body.transactionHash;
            proofFileUrl = req.body.proofFileUrl;
            bankDetails = req.body.bankDetails;
            cryptoAddress = req.body.cryptoAddress;

            // Handle file upload if present
            if (req.file) {
                proofFileUrl = `https://storage.example.com/proof-files/${Date.now()}-${req.file.originalname}`;
                console.log('📁 File uploaded:', req.file.originalname);
            }
        }

        const userId = req.user.id;

        // Validate required fields
        if (!mt5AccountId || !amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing or invalid fields: mt5AccountId, amount (must be > 0)'
            });
        }

        // Verify the MT5 account belongs to the authenticated user
        console.log('🔍 Looking up MT5 account:', { mt5AccountId, userId });
        const account = await dbService.prisma.mT5Account.findFirst({
            where: {
                accountId: mt5AccountId,
                userId: userId
            }
        });

        if (!account) {
            console.error('❌ MT5 account not found:', { mt5AccountId, userId });
            return res.status(404).json({
                success: false,
                message: 'MT5 account not found or access denied'
            });
        }

        console.log('✅ MT5 account verified:', account.id);

        // Create deposit record
        console.log('🔄 Creating deposit record for user:', userId);
        console.log('📊 Deposit data:', {
            userId,
            mt5AccountId,
            amount: parseFloat(amount),
            method,
            transactionHash,
            proofFileUrl,
            bankDetails,
            cryptoAddress,
            status: 'pending'
        });

        const deposit = await dbService.prisma.deposit.create({
            data: {
                userId: userId,
                mt5AccountId: account.id,
                amount: parseFloat(amount),
                currency: 'USD',
                method: method,
                paymentMethod: method,
                transactionHash: transactionHash || null,
                proofFileUrl: proofFileUrl || null,
                bankDetails: bankDetails || null,
                cryptoAddress: cryptoAddress || null,
                status: 'pending'
            }
        });

        // Create transaction record linked to deposit
        await dbService.prisma.transaction.create({
            data: {
                userId: userId,
                type: 'deposit',
                amount: parseFloat(amount),
                currency: 'USD',
                status: 'pending',
                paymentMethod: method,
                description: `${method} deposit request - ${deposit.id}`,
                depositId: deposit.id
            }
        });

        // Create MT5 transaction record immediately when deposit is requested
        await dbService.prisma.mT5Transaction.create({
            data: {
                type: 'Deposit',
                amount: parseFloat(amount),
                currency: 'USD',
                status: 'pending',
                paymentMethod: method,
                transactionId: transactionHash || deposit.id,
                comment: `${method} deposit request - ${deposit.id}`,
                depositId: deposit.id,
                userId: userId,
                mt5AccountId: account.id
            }
        });

        console.log('✅ Deposit request created successfully:', deposit.id);
        console.log('📋 Created deposit record:', deposit);

        res.status(201).json({
            success: true,
            message: 'Deposit request created successfully',
            data: deposit
        });

    } catch (error) {
        console.error('❌ Error creating deposit:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error details:', {
            name: error.name,
            message: error.message,
            code: error.code,
            meta: error.meta
        });

        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error',
            error: error.code || 'UNKNOWN_ERROR'
        });
    }
};

// Get all deposits for a user
export const getUserDeposits = async (req, res) => {
    try {
        const userId = req.user.id;

        const deposits = await dbService.prisma.Deposit.findMany({
            where: { userId: userId },
            include: {
                transactions: true
            },
            orderBy: { createdAt: 'desc' }
        });

        console.log(`✅ Retrieved ${deposits.length} deposits for user`);

        res.json({
            success: true,
            message: 'Deposits retrieved successfully',
            data: deposits
        });

    } catch (error) {
        console.error('Error fetching deposits:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// Update deposit status (Admin only)
export const updateDepositStatus = async (req, res) => {
    try {
        const { depositId } = req.params;
        const { status, rejectionReason } = req.body;

        if (!['pending', 'approved', 'rejected', 'failed'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be: pending, approved, rejected, or failed'
            });
        }

        // Find the deposit
        const deposit = await dbService.prisma.Deposit.findUnique({
            where: { id: depositId },
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

        // Prepare update data
        const updateData = {
            status: status,
            updatedAt: new Date()
        };

        if (status === 'approved') {
            updateData.approvedBy = req.user.id;
            updateData.approvedAt = new Date();
            updateData.processedAt = new Date();
        } else if (status === 'rejected') {
            updateData.rejectedAt = new Date();
            updateData.rejectionReason = rejectionReason || 'No reason provided';
        }

        // Update the deposit
        const updatedDeposit = await dbService.prisma.Deposit.update({
            where: { id: depositId },
            data: updateData,
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

        // Update linked transaction status
        await dbService.prisma.Transaction.updateMany({
            where: { depositId: depositId },
            data: {
                status: status,
                updatedAt: new Date()
            }
        });

        // If approved, automatically deposit to MT5 account
        if (status === 'approved') {
            try {
                const mt5Response = await depositMt5Balance(
                    deposit.mt5AccountId,
                    deposit.amount,
                    `Deposit approved - ${deposit.id}`
                );

                if (mt5Response.Success) {
                    console.log('✅ Deposit approved and MT5 balance updated');

                    // Update existing MT5 transaction record to completed
                    await dbService.prisma.MT5Transaction.updateMany({
                        where: { 
                            depositId: depositId,
                            status: 'pending'
                        },
                        data: {
                            status: 'completed',
                            processedBy: req.user.id,
                            processedAt: new Date(),
                            comment: `Deposit approved - ${deposit.id}`,
                            updatedAt: new Date()
                        }
                    });

                    // Update transaction status to completed
                    await dbService.prisma.Transaction.updateMany({
                        where: { depositId: depositId },
                        data: {
                            status: 'completed',
                            transactionId: deposit.transactionHash || deposit.id,
                            updatedAt: new Date()
                        }
                    });
                } else {
                    console.error('❌ Failed to update MT5 balance:', mt5Response.Message);

                    // Update MT5 transaction to failed
                    await dbService.prisma.MT5Transaction.updateMany({
                        where: { 
                            depositId: depositId,
                            status: 'pending'
                        },
                        data: {
                            status: 'failed',
                            comment: `MT5 deposit failed - ${mt5Response.Message}`,
                            processedBy: req.user.id,
                            processedAt: new Date(),
                            updatedAt: new Date()
                        }
                    });
                }
            } catch (mt5Error) {
                console.error('❌ Error updating MT5 balance:', mt5Error);
                
                // Update MT5 transaction to failed
                await dbService.prisma.MT5Transaction.updateMany({
                    where: {
                        depositId: depositId,
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
            }
        } else if (status === 'rejected') {
            // Update MT5 transaction to rejected
            await dbService.prisma.MT5Transaction.updateMany({
                where: { 
                    depositId: depositId,
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
        }

        // Log activity
        await logActivity(
            deposit.userId,
            req.user.id,
            status === 'approved' ? 'approve' : 'reject',
            'deposit',
            {
                entityId: depositId,
                amount: deposit.amount,
                method: deposit.method,
                mt5AccountId: deposit.mt5AccountId,
                status,
                rejectionReason
            },
            req.ip,
            req.get('User-Agent')
        );

        console.log(`✅ Deposit status updated to: ${status}`);

        res.json({
            success: true,
            message: `Deposit ${status} successfully`,
            data: updatedDeposit
        });

    } catch (error) {
        console.error('Error updating deposit status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// Get all deposits (Admin only)
export const getAllDeposits = async (req, res) => {
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

        // Get deposits with user info and pagination
        const deposits = await dbService.prisma.Deposit.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        clientId: true
                    }
                },
                transactions: {
                    select: {
                        id: true,
                        status: true,
                        createdAt: true
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
        const total = await dbService.prisma.Deposit.count({ where });

        console.log(`✅ Retrieved ${deposits.length} deposits for admin`);

        res.json({
            success: true,
            message: 'All deposits retrieved successfully',
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
        console.error('Error fetching all deposits:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// Get deposit by ID with full details
export const getDepositById = async (req, res) => {
    try {
        const { id } = req.params;

        const deposit = await dbService.prisma.Deposit.findUnique({
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
                },
                transactions: true
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

// Get deposit statistics
export const getDepositStats = async (req, res) => {
    try {
        const { days = 30 } = req.query;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Get deposit counts by status
        const statusStats = await dbService.prisma.Deposit.groupBy({
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

        // Get deposit counts by method
        const methodStats = await dbService.prisma.Deposit.groupBy({
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
        const totalStats = await dbService.prisma.Deposit.aggregate({
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
        const dailyStats = await dbService.prisma.$queryRaw`
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
                methodStats,
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

// Get transactions by MT5 account ID
export const getTransactionsByAccountId = async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.user.id; // Ensure user can only access their own data

        // Verify the MT5 account belongs to the authenticated user
        const account = await dbService.prisma.MT5Account.findFirst({
            where: {
                accountId: accountId,
                userId: userId
            }
        });

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'MT5 account not found or access denied'
            });
        }

        // Fetch transactions related to deposits for this account
        const transactions = await dbService.prisma.Transaction.findMany({
            where: {
                deposit: {
                    mt5AccountId: accountId
                }
            },
            include: {
                deposit: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                },
                withdrawal: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        console.log(`✅ Retrieved ${transactions.length} transactions for account ${accountId}`);

        res.json({
            success: true,
            message: 'Transactions retrieved successfully',
            data: transactions
        });

    } catch (error) {
        console.error('Error fetching transactions by account ID:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

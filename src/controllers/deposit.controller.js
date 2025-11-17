// server/src/controllers/deposit.controller.js

console.log('Deposit controller loaded');

import { depositMt5Balance } from '../services/mt5.service.js';
import { logActivity } from './activityLog.controller.js';
import { createNotification } from './notification.controller.js';
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

        // Create notification for deposit
        await createNotification(
            userId,
            'deposit',
            'Deposit Request Created',
            `Your deposit request of $${parseFloat(amount).toFixed(2)} has been submitted and is pending approval.`,
            { depositId: deposit.id, amount: parseFloat(amount), status: 'pending', method }
        );

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

                    // Create notification for approved deposit
                    await createNotification(
                        deposit.user.id,
                        'deposit',
                        'Deposit Approved',
                        `Your deposit of $${updatedDeposit.amount.toFixed(2)} has been approved and credited to your account.`,
                        { depositId: deposit.id, amount: updatedDeposit.amount, status: 'approved' }
                    );

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

// Get transactions by MT5 account ID (combined from Deposit and Withdrawal tables)
export const getTransactionsByAccountId = async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.user.id; // Ensure user can only access their own data

        // Verify the MT5 account belongs to the authenticated user
        const account = await dbService.prisma.mT5Account.findFirst({
            where: { accountId: String(accountId), userId },
            select: { id: true, accountId: true }
        });

        if (!account) {
            return res.status(404).json({ success: false, message: 'MT5 account not found or access denied' });
        }

        // Pull entries directly from Deposit and Withdrawal tables for this MT5 account
        const [deposits, withdrawals] = await Promise.all([
            dbService.prisma.Deposit.findMany({
                where: { mt5AccountId: account.id },
                orderBy: { createdAt: 'desc' }
            }),
            dbService.prisma.Withdrawal.findMany({
                where: { mt5AccountId: account.id },
                orderBy: { createdAt: 'desc' }
            })
        ]);

        // Normalize to a single list with a common shape for the client
        const mapDeposit = (d) => ({
            id: d.id,
            type: 'deposit',
            amount: Number(d.amount || 0),
            currency: d.currency || 'USD',
            status: d.status || 'pending',
            paymentMethod: d.paymentMethod || d.method || 'manual',
            description: d.transactionHash || d.method || d.paymentMethod || 'Deposit',
            createdAt: d.createdAt,
            // Mark internal transfers clearly for the UI
            isInternalTransfer: (d.paymentMethod === 'internal_transfer' || d.method === 'internal_transfer') ? true : false,
            direction: 'in',
        });
        const mapWithdrawal = (w) => ({
            id: w.id,
            type: 'withdrawal',
            amount: Number(w.amount || 0),
            currency: w.currency || 'USD',
            status: w.status || 'pending',
            paymentMethod: w.paymentMethod || w.method || 'manual',
            description: w.walletAddress || w.bankDetails || w.method || 'Withdrawal',
            createdAt: w.createdAt,
            // Mark internal transfers clearly for the UI
            isInternalTransfer: (w.paymentMethod === 'internal_transfer' || w.method === 'internal_transfer') ? true : false,
            direction: 'out',
        });

        const combined = [
            ...deposits.map(mapDeposit),
            ...withdrawals.map(mapWithdrawal)
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        console.log(`✅ Retrieved ${combined.length} combined entries from Deposit/Withdrawal for account ${accountId}`);

        return res.json({
            success: true,
            message: 'Transactions retrieved successfully',
            data: combined,
        });
    } catch (error) {
        console.error('Error fetching transactions by account ID:', error);
        return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
};

// Create Cregis card deposit request
export const createCregisCardDeposit = async (req, res) => {
    try {
        const { mt5AccountId, amount, cregisOrderId, paymentUrl, currency = 'USD' } = req.body;
        const userId = req.user.id;

        console.log('💳 Creating Cregis card deposit:', {
            userId,
            mt5AccountId,
            amount,
            cregisOrderId
        });

        // Validate required fields
        if (!mt5AccountId || !amount || !cregisOrderId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: mt5AccountId, amount, cregisOrderId'
            });
        }

        // Verify the MT5 account belongs to the user
        const account = await dbService.prisma.mT5Account.findFirst({
            where: {
                id: mt5AccountId,
                userId: userId
            }
        });

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'MT5 account not found or access denied'
            });
        }

        // Create deposit record
        const deposit = await dbService.prisma.deposit.create({
            data: {
                userId: userId,
                mt5AccountId: account.id,
                amount: parseFloat(amount),
                currency: currency,
                method: 'credit_card',
                paymentMethod: 'cregis_card',
                externalTransactionId: cregisOrderId,
                status: 'pending'
            }
        });

        // Create transaction record linked to deposit
        try {
            await dbService.prisma.transaction.create({
                data: {
                    userId: userId,
                    type: 'deposit',
                    amount: parseFloat(amount),
                    currency: currency,
                    status: 'pending',
                    paymentMethod: 'cregis_card',
                    description: `Cregis card deposit - ${cregisOrderId}`,
                    depositId: deposit.id
                }
            });
        } catch (transactionError) {
            console.warn('Could not create transaction record:', transactionError.message);
        }

        // Create MT5 transaction record
        try {
            await dbService.prisma.mT5Transaction.create({
                data: {
                    type: 'Deposit',
                    amount: parseFloat(amount),
                    currency: currency,
                    status: 'pending',
                    paymentMethod: 'cregis_card',
                    transactionId: cregisOrderId,
                    comment: `Cregis card deposit - ${cregisOrderId}`,
                    depositId: deposit.id,
                    userId: userId,
                    mt5AccountId: account.id
                }
            });
        } catch (mt5TransactionError) {
            console.warn('Could not create MT5 transaction record:', mt5TransactionError.message);
        }

        console.log('✅ Cregis card deposit created:', deposit.id);

        res.status(201).json({
            success: true,
            data: {
                depositId: deposit.id,
                status: deposit.status
            }
        });

    } catch (error) {
        console.error('Error creating Cregis card deposit:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// Create Cregis crypto deposit request
export const createCregisCryptoDeposit = async (req, res) => {
    try {
        const { mt5AccountId, amount, currency = 'USDT', network = 'TRC20', cregisOrderId, paymentUrl } = req.body;
        const userId = req.user.id;

        console.log('🪙 Creating Cregis crypto deposit:', {
            userId,
            mt5AccountId,
            amount,
            currency,
            network,
            cregisOrderId
        });

        // Validate required fields
        if (!mt5AccountId || !amount || !cregisOrderId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: mt5AccountId, amount, cregisOrderId'
            });
        }

        // Verify the MT5 account belongs to the user
        const account = await dbService.prisma.mT5Account.findFirst({
            where: {
                id: mt5AccountId,
                userId: userId
            }
        });

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'MT5 account not found or access denied'
            });
        }

        // Create deposit record
        // Note: Store cregisOrderId (order_id) as externalTransactionId for callback matching
        // Also store cregisId if provided (for additional lookup)
        const deposit = await dbService.prisma.deposit.create({
            data: {
                userId: userId,
                mt5AccountId: account.id,
                amount: parseFloat(amount),
                currency: currency,
                method: 'crypto',
                paymentMethod: `cregis_${currency.toLowerCase()}`,
                externalTransactionId: cregisOrderId, // This is the order_id (third_party_id) for callback matching
                // Note: cregisOrderId and cregisId fields don't exist in schema, only externalTransactionId
                cryptoAddress: null, // Will be updated by callback
                status: 'pending'
            }
        });
        
        console.log('✅ Deposit created with externalTransactionId:', cregisOrderId, 'for callback matching');

        // Create transaction record linked to deposit
        try {
            await dbService.prisma.transaction.create({
                data: {
                    userId: userId,
                    type: 'deposit',
                    amount: parseFloat(amount),
                    currency: currency,
                    status: 'pending',
                    paymentMethod: `cregis_${currency.toLowerCase()}`,
                    description: `Cregis ${currency} deposit - ${cregisOrderId}`,
                    depositId: deposit.id
                }
            });
        } catch (transactionError) {
            console.warn('Could not create transaction record:', transactionError.message);
        }

        // Create MT5 transaction record
        try {
            await dbService.prisma.mT5Transaction.create({
                data: {
                    type: 'Deposit',
                    amount: parseFloat(amount),
                    currency: currency,
                    status: 'pending',
                    paymentMethod: `cregis_${currency.toLowerCase()}`,
                    transactionId: cregisOrderId,
                    comment: `Cregis ${currency} deposit - ${cregisOrderId}`,
                    depositId: deposit.id,
                    userId: userId,
                    mt5AccountId: account.id
                }
            });
        } catch (mt5TransactionError) {
            console.warn('Could not create MT5 transaction record:', mt5TransactionError.message);
        }

        console.log('✅ Cregis crypto deposit created:', deposit.id);

        res.status(201).json({
            success: true,
            data: {
                depositId: deposit.id,
                status: deposit.status
            }
        });

    } catch (error) {
        console.error('Error creating Cregis crypto deposit:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// Handle Cregis payment callback (no auth required - webhook from Cregis)
export const handleCregisCallback = async (req, res) => {
    try {
        const {
            cregis_id,
            third_party_id,
            status,
            order_amount,
            order_currency,
            received_amount,
            paid_currency,
            txid,
            tx_hash,
            from_address,
            to_address,
            block_height,
            block_time,
            payment_detail, // Array of payment details
        } = req.body;

        console.log('📥 [CREGIS CALLBACK] ========== RECEIVED CALLBACK ==========');
        console.log('📥 [CREGIS CALLBACK] Full callback data:', JSON.stringify(req.body, null, 2));
        
        // Extract receive_amount from payment_detail if not directly provided
        let actualReceivedAmount = received_amount;
        if (!actualReceivedAmount && payment_detail && Array.isArray(payment_detail) && payment_detail.length > 0) {
            // Try to get receive_amount from first payment_detail entry
            actualReceivedAmount = payment_detail[0].receive_amount || payment_detail[0].pay_amount;
            console.log('💰 [CREGIS CALLBACK] Extracted receive_amount from payment_detail:', actualReceivedAmount);
        }
        
        // Extract tx_hash from payment_detail if not directly provided
        let actualTxHash = tx_hash || txid;
        if (!actualTxHash && payment_detail && Array.isArray(payment_detail) && payment_detail.length > 0) {
            actualTxHash = payment_detail[0].tx_id || payment_detail[0].txid;
            console.log('🔗 [CREGIS CALLBACK] Extracted tx_hash from payment_detail:', actualTxHash);
        }
        
        console.log('📥 [CREGIS CALLBACK] Key fields:', {
            cregis_id,
            third_party_id,
            status,
            order_amount,
            order_currency,
            received_amount: actualReceivedAmount,
            paid_currency,
            txid,
            tx_hash: actualTxHash,
            from_address,
            to_address,
            has_payment_detail: !!payment_detail
        });

        // Find deposit by externalTransactionId (cregis_id or third_party_id)
        // Note: cregisId and cregisOrderId fields don't exist in schema, only externalTransactionId
        const deposit = await dbService.prisma.deposit.findFirst({
            where: {
                OR: [
                    { externalTransactionId: cregis_id },
                    { externalTransactionId: third_party_id }
                ]
            },
            include: {
                mt5Account: true,
                user: true
            }
        });

        // If deposit not found, we cannot create it here because we don't have user/account info
        // The deposit should have been created when checkout was initiated
        if (!deposit) {
            console.error('❌ Deposit not found for callback:', { cregis_id, third_party_id });
            console.error('❌ This means the deposit record was not created during checkout');
            console.error('❌ Cannot process payment without deposit record');
            return res.status(404).json({
                success: false,
                message: 'Deposit not found. Please ensure deposit was created during checkout.',
                cregis_id,
                third_party_id
            });
        }

        console.log('✅ Found deposit:', deposit.id);

        // Map Cregis status to internal deposit status
        const mapCregisStatus = (cregisStatus) => {
            const statusLower = cregisStatus?.toLowerCase();
            if (['paid', 'complete', 'success', 'confirmed'].includes(statusLower)) {
                return 'approved';
            } else if (['rejected', 'failed', 'cancelled', 'expired'].includes(statusLower)) {
                return 'rejected';
            }
            return 'pending';
        };

        const mappedStatus = mapCregisStatus(status);
        console.log('📋 Status mapping:', status, '->', mappedStatus);

        // Prepare update data
        const updateData = {
            status: mappedStatus,
            updatedAt: new Date()
        };

        // Update transaction hash if provided (use extracted value)
        if (actualTxHash) {
            updateData.transactionHash = actualTxHash;
        }

        // Update crypto address if provided
        if (to_address) {
            updateData.depositAddress = to_address;
        }

        // Update with timestamps based on mapped status
        if (mappedStatus === 'approved') {
            updateData.approvedAt = new Date();
            updateData.processedAt = new Date();
            // Note: processedBy field doesn't exist in Deposit schema, only in MT5Transaction
        } else if (mappedStatus === 'rejected') {
            updateData.rejectedAt = new Date();
            updateData.rejectionReason = `Cregis status: ${status}`;
        }

        // Update deposit in database
        const updatedDeposit = await dbService.prisma.deposit.update({
            where: { id: deposit.id },
            data: updateData
        });

        console.log('✅ Deposit status updated in DB:', deposit.id, '->', mappedStatus);

        // Ensure Transaction record exists, create if it doesn't
        let transaction = await dbService.prisma.transaction.findFirst({
            where: { depositId: deposit.id }
        });

        if (!transaction) {
            console.log('📝 Creating Transaction record for deposit:', deposit.id);
            transaction = await dbService.prisma.transaction.create({
                data: {
                    userId: deposit.userId,
                    type: 'deposit',
                    amount: deposit.amount,
                    currency: order_currency || deposit.currency || 'USD',
                    status: mappedStatus,
                    paymentMethod: deposit.paymentMethod || deposit.method || 'cregis',
                    description: `Cregis deposit - ${cregis_id || third_party_id}`,
                    depositId: deposit.id,
                    transactionId: actualTxHash || deposit.transactionHash,
                    updatedAt: new Date()
                }
            });
            console.log('✅ Transaction record created:', transaction.id);
        } else {
            await dbService.prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: mappedStatus,
                    transactionId: actualTxHash || transaction.transactionId || deposit.transactionHash,
                    updatedAt: new Date()
                }
            });
            console.log('✅ Transaction record updated:', transaction.id);
        }

        // Ensure MT5Transaction record exists, create if it doesn't
        let mt5Transaction = await dbService.prisma.mT5Transaction.findFirst({
            where: { depositId: deposit.id }
        });

        if (!mt5Transaction) {
            console.log('📝 Creating MT5Transaction record for deposit:', deposit.id);
            mt5Transaction = await dbService.prisma.mT5Transaction.create({
                data: {
                    type: 'Deposit',
                    amount: deposit.amount,
                    currency: order_currency || deposit.currency || 'USD',
                    status: mappedStatus,
                    paymentMethod: deposit.paymentMethod || deposit.method || 'cregis',
                    transactionId: actualTxHash || `DEP_${Date.now()}_${deposit.mt5Account.accountId}`,
                    comment: `Cregis deposit - ${cregis_id || third_party_id}`,
                    depositId: deposit.id,
                    userId: deposit.userId,
                    mt5AccountId: deposit.mt5AccountId,
                    updatedAt: new Date()
                }
            });
            console.log('✅ MT5Transaction record created:', mt5Transaction.id);
        } else {
            await dbService.prisma.mT5Transaction.update({
                where: { id: mt5Transaction.id },
                data: {
                    status: mappedStatus,
                    transactionId: actualTxHash || mt5Transaction.transactionId || deposit.transactionHash,
                    updatedAt: new Date()
                }
            });
            console.log('✅ MT5Transaction record updated:', mt5Transaction.id);
        }

        // If payment is confirmed, add balance to MT5 account using AddClientBalance API
        // This will directly credit the balance to the MT5 account in the MT5 server
        const isSuccessStatus = mappedStatus === 'approved';
        
        if (isSuccessStatus) {
            try {
                // Use actualReceivedAmount (extracted from payment_detail or callback), fallback to order_amount, then deposit.amount
                const amountToCredit = actualReceivedAmount 
                    ? parseFloat(actualReceivedAmount) 
                    : (order_amount ? parseFloat(order_amount) : deposit.amount);
                
                console.log('💰 Preparing to add balance to MT5 account:', {
                    depositId: deposit.id,
                    mt5AccountId: deposit.mt5Account.id,
                    mt5AccountLogin: deposit.mt5Account.accountId,
                    received_amount: actualReceivedAmount,
                    order_amount,
                    deposit_amount: deposit.amount,
                    amountToCredit
                });

                // Verify accountId exists and convert to string (MT5 API expects string)
                if (!deposit.mt5Account || !deposit.mt5Account.accountId) {
                    throw new Error(`MT5 accountId is missing for deposit ${deposit.id}`);
                }

                // Convert accountId to string to ensure proper format for MT5 API
                // This is the MT5 login number that will receive the balance
                const mt5Login = String(deposit.mt5Account.accountId).trim();
                
                if (!mt5Login) {
                    throw new Error(`Invalid MT5 accountId for deposit ${deposit.id}: ${deposit.mt5Account.accountId}`);
                }
                
                console.log('📤 Calling AddClientBalance API to add balance to MT5 account:', {
                    endpoint: `Users/${mt5Login}/AddClientBalance`,
                    mt5Login: mt5Login,
                    balance: amountToCredit,
                    comment: `Cregis deposit confirmed - ${deposit.id}`
                });
                
                // IMPORTANT: This API call adds the balance directly to the MT5 account in the MT5 server
                // The balance will be credited to the MT5 account with login = mt5Login
                const mt5Response = await depositMt5Balance(
                    mt5Login,
                    amountToCredit,
                    `Cregis deposit confirmed - ${deposit.id}`
                );

                console.log('📥 AddClientBalance API Response:', JSON.stringify(mt5Response, null, 2));

                if (mt5Response && mt5Response.Success) {
                    const newBalance = mt5Response.Data?.Balance || mt5Response.Data?.balance || 'N/A';
                    console.log('✅ MT5 balance credited successfully via AddClientBalance API');
                    console.log('💰 New MT5 Account Balance:', newBalance);
                    console.log('📊 Full MT5 Response:', JSON.stringify(mt5Response, null, 2));
                    
                    // Update deposit with received amount and mark as completed
                    await dbService.prisma.deposit.update({
                        where: { id: deposit.id },
                        data: { 
                            status: 'completed',
                            amount: amountToCredit // Update with actual received amount
                            // Note: paidAmount field doesn't exist in schema, removed
                        }
                    });

                    // Update MT5 transaction record (should already exist from above)
                    await dbService.prisma.mT5Transaction.updateMany({
                        where: { depositId: deposit.id },
                        data: {
                            type: 'Deposit',
                            amount: amountToCredit,
                            status: 'completed',
                            transactionId: actualTxHash || deposit.transactionHash,
                            comment: `Cregis deposit confirmed - ${deposit.id}`,
                            processedBy: 'cregis_webhook',
                            processedAt: new Date(),
                            updatedAt: new Date()
                        }
                    });

                    // Update main transaction record (should already exist from above)
                    await dbService.prisma.transaction.updateMany({
                        where: { depositId: deposit.id },
                        data: {
                            type: 'deposit',
                            amount: amountToCredit,
                            status: 'completed',
                            transactionId: actualTxHash || deposit.transactionHash,
                            updatedAt: new Date()
                        }
                    });
                } else {
                    const errorMessage = mt5Response?.Message || mt5Response?.message || 'Unknown error';
                    console.error('❌ Failed to credit MT5 balance via AddClientBalance:', errorMessage);
                    console.error('📊 Full MT5 Response:', JSON.stringify(mt5Response, null, 2));
                    
                    // Update deposit status to failed
                    await dbService.prisma.deposit.update({
                        where: { id: deposit.id },
                        data: {
                            status: 'failed',
                            rejectionReason: `MT5 AddClientBalance failed: ${errorMessage}`,
                            updatedAt: new Date()
                        }
                    });
                    
                    // Update transaction to failed
                    await dbService.prisma.transaction.updateMany({
                        where: { depositId: deposit.id },
                        data: {
                            status: 'failed',
                            updatedAt: new Date()
                        }
                    });

                    // Update MT5 transaction to failed
                    await dbService.prisma.mT5Transaction.updateMany({
                        where: { depositId: deposit.id },
                        data: {
                            status: 'failed',
                            comment: `MT5 AddClientBalance failed: ${errorMessage}`,
                            updatedAt: new Date()
                        }
                    });
                }
            } catch (mt5Error) {
                console.error('❌ Error calling AddClientBalance API:', mt5Error);
                console.error('❌ Error stack:', mt5Error.stack);
                
                // Update deposit status to failed
                await dbService.prisma.deposit.update({
                    where: { id: deposit.id },
                    data: {
                        status: 'failed',
                        rejectionReason: `MT5 API error: ${mt5Error.message || 'Unknown error'}`,
                        updatedAt: new Date()
                    }
                });
                
                // Update transaction to failed
                await dbService.prisma.transaction.updateMany({
                    where: { depositId: deposit.id },
                    data: {
                        status: 'failed',
                        updatedAt: new Date()
                    }
                });

                // Update MT5 transaction to failed
                await dbService.prisma.mT5Transaction.updateMany({
                    where: { depositId: deposit.id },
                    data: {
                        status: 'failed',
                        comment: `MT5 API error: ${mt5Error.message || 'Unknown error'}`,
                        updatedAt: new Date()
                    }
                });
            }
        }

        console.log('✅ Callback processed successfully');

        res.json({
            success: true,
            message: 'Callback processed successfully',
            data: {
                depositId: deposit.id,
                status: updatedDeposit.status
            }
        });

    } catch (error) {
        console.error('❌ Error processing Cregis callback:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

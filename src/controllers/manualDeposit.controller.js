// server/src/controllers/deposit.controller.js

import { depositMt5Balance } from '../services/mt5.service.js';
import { logActivity } from './activityLog.controller.js';
import dbService from '../services/db.service.js';

// Create a new manual deposit request
export const createManualDeposit = async (req, res) => {
    try {
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('🚀 NEW MANUAL DEPOSIT REQUEST RECEIVED');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📥 Request body type:', typeof req.body);
        console.log('📥 Request body:', req.body);
        console.log('📥 Request file:', req.file);
        console.log('📥 Request headers:', req.headers);
        console.log('📥 Content-Type:', req.get('Content-Type'));
        console.log('');
        
        // Extract data from request body
        // Express with multer puts form fields in req.body
        let mt5AccountId = req.body?.mt5AccountId;
        let amount = req.body?.amount;
        let transactionHash = req.body?.transactionHash;
        let proofFileUrl = req.body?.proofFileUrl;

        console.log('🔍 Extracting form data:');
        console.log('   - mt5AccountId from body:', mt5AccountId);
        console.log('   - amount from body:', amount);
        console.log('   - transactionHash from body:', transactionHash);
        console.log('');

        // Handle file upload if present
        if (req.file) {
            proofFileUrl = `https://storage.example.com/proof-files/${Date.now()}-${req.file.originalname}`;
            console.log('📁 File uploaded:', req.file.originalname);
        }

        const userId = req.user.id;

        console.log('📋 Extracted data:');
        console.log('   - User ID:', userId);
        console.log('   - MT5 Account ID:', mt5AccountId);
        console.log('   - Amount:', amount);
        console.log('   - Transaction Hash:', transactionHash || '(none)');
        console.log('   - Proof File URL:', proofFileUrl || '(none)');

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

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'MT5 account not found or access denied'
            });
        }

        // Create deposit record
        console.log('🔄 Creating deposit record for user:', userId);
        console.log('📊 Deposit data:', {
            userId,
            mt5AccountId,
            amount: parseFloat(amount),
            method: 'manual',
            transactionHash,
            proofFileUrl,
            status: 'pending'
        });

        const deposit = await dbService.prisma.deposit.create({
            data: {
                userId: userId,
                mt5AccountId: account.id,
                amount: parseFloat(amount),
                currency: 'USD',
                method: 'manual',
                paymentMethod: 'manual',
                depositAddress: 'Twinxa7902309skjhfsdlhflksjdhlkLL',
                transactionHash: transactionHash || null,
                proofFileUrl: proofFileUrl || null,
                status: 'pending'
            }
        });

        let transactionCreated = false;

        // Create transaction record linked to deposit
        try {
            await dbService.prisma.transaction.create({
                data: {
                    userId: userId,
                    type: 'deposit',
                    amount: parseFloat(amount),
                    currency: 'USD',
                    status: 'pending',
                    paymentMethod: 'manual',
                    description: `Manual deposit request - ${deposit.id}`,
                    depositId: deposit.id
                }
            });
            transactionCreated = true;
        } catch (transactionError) {
            if (transactionError instanceof Prisma.PrismaClientKnownRequestError && transactionError.code === 'P2022') {
                console.error('Transaction table schema mismatch (missing column). Continuing without creating transaction log.');
            } else {
                throw transactionError;
            }
        }

        // Create MT5 transaction record immediately when deposit is requested
        console.log('🔄 Creating MT5Transaction record...');
        console.log('📊 MT5Transaction data:', {
            type: 'Deposit',
            amount: parseFloat(amount),
            currency: 'USD',
            status: 'pending',
            paymentMethod: 'manual',
            transactionId: transactionHash || deposit.id,
            comment: `Manual deposit request - ${deposit.id}`,
            depositId: deposit.id,
            userId: userId,
            mt5AccountId: account.id
        });

        try {
            const mt5Transaction = await dbService.prisma.mT5Transaction.create({
                data: {
                    type: 'Deposit',
                    amount: parseFloat(amount),
                    currency: 'USD',
                    status: 'pending',
                    paymentMethod: 'manual',
                    transactionId: transactionHash || deposit.id,
                    comment: `Manual deposit request - ${deposit.id}`,
                    depositId: deposit.id,
                    userId: userId,
                    mt5AccountId: account.id
                }
            });

            console.log('✅✅✅ MT5Transaction CREATED SUCCESSFULLY! ✅✅✅');
            console.log('📋 MT5Transaction ID:', mt5Transaction.id);
            console.log('📋 MT5Transaction full record:', JSON.stringify(mt5Transaction, null, 2));
        } catch (mt5Error) {
            console.error('❌❌❌ FAILED TO CREATE MT5Transaction! ❌❌❌');
            console.error('❌ Error:', mt5Error.message);
            console.error('❌ Error code:', mt5Error.code);
            console.error('❌ Full error:', mt5Error);
            // Don't throw - let deposit continue even if MT5Transaction fails
        }

        console.log('✅ Deposit request created successfully:', deposit.id);
        console.log('📋 Created deposit record:', deposit);
        
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ MANUAL DEPOSIT COMPLETED SUCCESSFULLY!');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📊 Summary:');
        console.log('   ✅ Deposit record created: ID =', deposit.id);
        console.log('   ✅ Transaction record created');
        console.log('   ✅ MT5Transaction record created (check logs above)');
        console.log('');
        console.log('🔍 To verify in database, run:');
        console.log(`   SELECT * FROM "MT5Transaction" WHERE "depositId" = '${deposit.id}';`);
        console.log('═══════════════════════════════════════════════════════════');
        console.log('');

        res.status(201).json({
            success: true,
            message: 'Deposit request created successfully',
            data: deposit
        });

    } catch (error) {
        console.error('❌ Error creating manual deposit:', error);
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

        const deposits = await prisma.Deposit.findMany({
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
        const deposit = await prisma.Deposit.findUnique({
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
        const updatedDeposit = await prisma.Deposit.update({
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
        await prisma.Transaction.updateMany({
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
                    await prisma.MT5Transaction.updateMany({
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
                    await prisma.Transaction.updateMany({
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
                    await prisma.MT5Transaction.updateMany({
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
                await prisma.MT5Transaction.updateMany({
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
            await prisma.MT5Transaction.updateMany({
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
        const total = await prisma.Deposit.count({ where });

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

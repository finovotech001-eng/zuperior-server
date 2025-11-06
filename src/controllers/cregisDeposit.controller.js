// server/src/controllers/cregisDeposit.controller.js

import dbService from '../services/db.service.js';

/**
 * Create Cregis deposit record when payment order is created
 */
export const createCregisDepositRecord = async (req, res) => {
    try {
        const { mt5AccountId, amount, currency, cregisOrderId, paymentUrl } = req.body;
        const userId = req.user.id;

        console.log('💳 Creating Cregis deposit record:', {
            userId,
            mt5AccountId,
            amount,
            currency,
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
                currency: currency || 'USD',
                method: 'cregis',
                paymentMethod: 'cregis_checkout',
                externalTransactionId: cregisOrderId,
                status: 'pending'
            }
        });

        // Create transaction record
        await dbService.prisma.transaction.create({
            data: {
                userId: userId,
                type: 'deposit',
                amount: parseFloat(amount),
                currency: currency || 'USD',
                status: 'pending',
                paymentMethod: 'cregis_checkout',
                description: `Cregis checkout deposit - ${cregisOrderId}`,
                depositId: deposit.id
            }
        });

        // Create MT5 transaction record
        await dbService.prisma.mT5Transaction.create({
            data: {
                type: 'Deposit',
                amount: parseFloat(amount),
                currency: currency || 'USD',
                status: 'pending',
                paymentMethod: 'cregis_checkout',
                transactionId: cregisOrderId,
                comment: `Cregis checkout deposit - ${cregisOrderId}`,
                depositId: deposit.id,
                userId: userId,
                mt5AccountId: account.id
            }
        });

        console.log('✅ Cregis deposit record created:', deposit.id);

        res.status(201).json({
            success: true,
            data: {
                depositId: deposit.id,
                status: deposit.status
            }
        });

    } catch (error) {
        console.error('Error creating Cregis deposit record:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

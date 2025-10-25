// zuperior-dashboard/server/src/controllers/internalTransfer.controller.js

import * as mt5Service from '../services/mt5.service.js';
import prisma from '../services/db.service.js';

export const internalTransfer = async (req, res) => {
    let transaction = null;

    try {
        const { fromAccount, toAccount, amount, comment } = req.body;

        // Get user ID from authenticated request
        const userId = req.user.id;

        // Validate required fields
        if (!fromAccount || !toAccount || !amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing or invalid fields: fromAccount, toAccount, amount (must be > 0)'
            });
        }

        // Validate amount is a valid number
        const transferAmount = parseFloat(amount);
        if (isNaN(transferAmount) || transferAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be a valid positive number'
            });
        }

        // Prevent self-transfer
        if (fromAccount.toString() === toAccount.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot transfer to the same account'
            });
        }

        // Verify both accounts belong to the authenticated user
        const [fromAcc, toAcc] = await Promise.all([
            prisma.MT5Account.findFirst({
                where: {
                    accountId: fromAccount.toString(),
                    userId: userId
                }
            }),
            prisma.MT5Account.findFirst({
                where: {
                    accountId: toAccount.toString(),
                    userId: userId
                }
            })
        ]);

        if (!fromAcc) {
            return res.status(404).json({
                success: false,
                message: 'Source account not found or access denied'
            });
        }

        if (!toAcc) {
            return res.status(404).json({
                success: false,
                message: 'Destination account not found or access denied'
            });
        }

        // Get current balance for source account to validate sufficient funds
        const sourceProfile = await mt5Service.getMt5UserProfile(fromAccount);
        if (!sourceProfile) {
            return res.status(400).json({
                success: false,
                message: 'Unable to retrieve source account balance'
            });
        }

        const currentBalance = parseFloat(sourceProfile.Balance || 0);
        if (currentBalance < transferAmount) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Available: $${currentBalance.toFixed(2)}, Required: $${transferAmount.toFixed(2)}`
            });
        }

        // Set minimum and maximum transfer limits
        const MIN_TRANSFER = 0.01;
        const MAX_TRANSFER = 100000;

        if (transferAmount < MIN_TRANSFER) {
            return res.status(400).json({
                success: false,
                message: `Minimum transfer amount is $${MIN_TRANSFER}`
            });
        }

        if (transferAmount > MAX_TRANSFER) {
            return res.status(400).json({
                success: false,
                message: `Maximum transfer amount is $${MAX_TRANSFER}`
            });
        }

        // Start database transaction for audit trail
        transaction = await prisma.$transaction(async (tx) => {
            console.log(`🔄 Starting internal transfer: ${fromAccount} → ${toAccount} ($${transferAmount})`);

            // Step 1: Deduct from source account using MT5 API
            console.log(`📤 Deducting $${transferAmount} from account ${fromAccount}`);
            const withdrawResponse = await mt5Service.withdrawMt5Balance(
                fromAccount,
                transferAmount,
                comment || `Internal transfer to ${toAccount}`
            );

            if (!withdrawResponse.Success) {
                throw new Error(`Failed to deduct from source account: ${withdrawResponse.Message}`);
            }

            const sourceNewBalance = withdrawResponse.Data?.Balance;
            console.log(`✅ Successfully deducted from ${fromAccount}. New balance: $${sourceNewBalance}`);

            // Step 2: Add to destination account using MT5 API
            console.log(`📥 Adding $${transferAmount} to account ${toAccount}`);
            const depositResponse = await mt5Service.depositMt5Balance(
                toAccount,
                transferAmount,
                comment || `Internal transfer from ${fromAccount}`
            );

            if (!depositResponse.Success) {
                // If deposit fails, the withdrawal has already succeeded
                // We cannot rollback the MT5 withdrawal, so we need to handle this as a critical error
                console.error(`❌ CRITICAL: Withdrawal succeeded but deposit failed for transfer ${fromAccount} → ${toAccount}`);
                throw new Error(`Failed to credit destination account: ${depositResponse.Message}. Please contact support immediately.`);
            }

            const destNewBalance = depositResponse.Data?.Balance;
            console.log(`✅ Successfully added to ${toAccount}. New balance: $${destNewBalance}`);

            // Step 3: Create transaction records for audit trail with "Internal Transfer" type
            const transferId = `INT_${Date.now()}_${fromAccount}_${toAccount}`;

            // Create source transaction (debit from source account)
            const sourceTransaction = await tx.MT5Transaction.create({
                data: {
                    type: 'Internal Transfer Out',
                    amount: transferAmount,
                    status: 'completed',
                    comment: comment || `Internal transfer to account ${toAccount}`,
                    mt5AccountId: fromAcc.id,
                    transactionId: `${transferId}_OUT`,
                    userId: userId,
                    paymentMethod: 'internal_transfer',
                    processedAt: new Date()
                }
            });

            // Create destination transaction (credit to destination account) and link to source
            const destTransaction = await tx.MT5Transaction.create({
                data: {
                    type: 'Internal Transfer In',
                    amount: transferAmount,
                    status: 'completed',
                    comment: `${comment || 'Internal transfer'} from account ${fromAccount} (Ref: ${sourceTransaction.id})`,
                    mt5AccountId: toAcc.id,
                    transactionId: `${transferId}_IN`,
                    userId: userId,
                    paymentMethod: 'internal_transfer',
                    processedAt: new Date()
                }
            });

            console.log(`✅ Internal Transfer transactions created:`);
            console.log(`   - Source (OUT): ${sourceTransaction.id} | Account: ${fromAccount} | Amount: -$${transferAmount}`);
            console.log(`   - Destination (IN): ${destTransaction.id} | Account: ${toAccount} | Amount: +$${transferAmount}`);

            return {
                transferId,
                sourceNewBalance,
                destNewBalance,
                sourceTransaction: sourceTransaction.id,
                destTransaction: destTransaction.id
            };
        });

        // Log successful transfer
        console.log(`✅ Internal transfer completed successfully: ${fromAccount} → ${toAccount} ($${transferAmount})`);
        console.log(`📊 Transfer ID: ${transaction.transferId}`);

        res.json({
            success: true,
            message: 'Internal transfer completed successfully',
            data: {
                transferId: transaction.transferId,
                fromAccount: fromAccount,
                toAccount: toAccount,
                amount: transferAmount,
                fromBalance: transaction.sourceNewBalance,
                toBalance: transaction.destNewBalance,
                sourceTransactionId: transaction.sourceTransaction,
                destTransactionId: transaction.destTransaction
            }
        });

    } catch (error) {
        console.error('❌ Internal transfer failed:', error);

        // Enhanced error logging for debugging
        if (error.message.includes('CRITICAL')) {
            console.error('🚨 CRITICAL ERROR: Manual intervention required for transfer rollback');
            // In a production system, you might want to:
            // 1. Send alerts to administrators
            // 2. Create a support ticket
            // 3. Queue the transaction for manual review
        }

        // If we have a database transaction, it will be rolled back automatically
        // But MT5 API changes cannot be rolled back automatically

        res.status(500).json({
            success: false,
            message: error.message || 'Internal transfer failed',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
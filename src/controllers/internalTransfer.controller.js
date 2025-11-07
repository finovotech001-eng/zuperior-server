// zuperior-dashboard/server/src/controllers/internalTransfer.controller.js

import * as mt5Service from '../services/mt5.service.js';
import dbService from '../services/db.service.js';
import { sendInternalTransferEmail } from '../services/email.service.js';

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
            dbService.prisma.mT5Account.findFirst({
                where: {
                    accountId: fromAccount.toString(),
                    userId: userId
                }
            }),
            dbService.prisma.mT5Account.findFirst({
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
        transaction = await dbService.prisma.$transaction(async (tx) => {
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

            // Create Withdrawal record for source account
            const withdrawal = await tx.Withdrawal.create({
                data: {
                    userId: userId,
                    mt5AccountId: fromAcc.id,
                    amount: transferAmount,
                    currency: 'USD',
                    method: 'internal_transfer',
                    paymentMethod: 'internal_transfer',
                    status: 'completed',
                    processedAt: new Date(),
                    externalTransactionId: sourceTransaction.id
                }
            });

            // Create Deposit record for destination account
            const deposit = await tx.Deposit.create({
                data: {
                    userId: userId,
                    mt5AccountId: toAcc.id,
                    amount: transferAmount,
                    currency: 'USD',
                    method: 'internal_transfer',
                    paymentMethod: 'internal_transfer',
                    status: 'approved',
                    approvedAt: new Date(),
                    processedAt: new Date(),
                    externalTransactionId: destTransaction.id
                }
            });

            console.log(`✅ Created Withdrawal record: ${withdrawal.id} for account ${fromAccount}`);
            console.log(`✅ Created Deposit record: ${deposit.id} for account ${toAccount}`);

            // Create Transaction records for both accounts
            const fromTransaction = await tx.Transaction.create({
                data: {
                    userId: userId,
                    type: 'transfer',
                    amount: transferAmount,
                    currency: 'USD',
                    status: 'completed',
                    paymentMethod: 'internal_transfer',
                    description: `Internal transfer to account ${toAccount}`,
                    withdrawalId: withdrawal.id
                }
            });

            const toTransaction = await tx.Transaction.create({
                data: {
                    userId: userId,
                    type: 'transfer',
                    amount: transferAmount,
                    currency: 'USD',
                    status: 'completed',
                    paymentMethod: 'internal_transfer',
                    description: `Internal transfer from account ${fromAccount}`,
                    depositId: deposit.id
                }
            });

            console.log(`✅ Created Transaction record: ${fromTransaction.id} for withdrawal`);
            console.log(`✅ Created Transaction record: ${toTransaction.id} for deposit`);

            return {
                transferId,
                sourceNewBalance,
                destNewBalance,
                sourceTransaction: sourceTransaction.id,
                destTransaction: destTransaction.id,
                withdrawalId: withdrawal.id,
                depositId: deposit.id,
                fromTransactionId: fromTransaction.id,
                toTransactionId: toTransaction.id
            };
        });

        // Log successful transfer
        console.log(`✅ Internal transfer completed successfully: ${fromAccount} → ${toAccount} ($${transferAmount})`);
        console.log(`📊 Transfer ID: ${transaction.transferId}`);

        // Send notification email (do not block response on failure)
        try {
            const to = req.user?.email;
            if (to) {
                await sendInternalTransferEmail({
                    to,
                    userName: req.user?.name,
                    fromAccount,
                    toAccount,
                    amount: transferAmount,
                    date: new Date(),
                });
            } else {
                console.warn('⚠️ No recipient email for internal transfer', { userId });
            }
        } catch (mailErr) {
            console.error('❌ Failed to send internal transfer email:', mailErr?.message || mailErr);
        }

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
                destTransactionId: transaction.destTransaction,
                withdrawalId: transaction.withdrawalId,
                depositId: transaction.depositId,
                fromTransactionId: transaction.fromTransactionId,
                toTransactionId: transaction.toTransactionId
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

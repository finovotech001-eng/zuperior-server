// zuperior-dashboard/server/src/controllers/mt5.controller.js

import * as mt5Service from '../services/mt5.service.js';
import dbService from '../services/db.service.js';
import { sendMt5AccountEmail, sendInternalTransferEmail, sendTransactionCompletedEmail } from '../services/email.service.js';

// 4.1 GET /api/mt5/groups
export const getGroups = async (req, res) => {
    try {
        // Call the MT5 Service to fetch all groups
        const groups = await mt5Service.getMt5Groups();

        // Return the RAW data. The filtering logic is handled in the Next.js API Proxy,
        // as per the initial design for that specific route.
        res.json(groups);
    } catch (error) {
        console.error("Error in getGroups controller:", error.message);
        // Forward the error message from the service layer to the client
        res.status(500).json({ message: error.message });
    }
};

// 4.2 POST /api/mt5/create-account
export const createAccount = async (req, res) => {
    try {
        const {
            name,
            group,
            leverage = 100,
            masterPassword,
            investorPassword,
            email,
            country,
            city,
            phone,
            comment
        } = req.body;

        // Get user ID from authenticated request
        const userId = req.user.id;

        // Validate required fields
        if (!name || !group || !masterPassword || !investorPassword) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, group, masterPassword, investorPassword'
            });
        }

        // Validate group is one of the allowed groups
        const allowedGroups = [
            'real\\Bbook\\Pro\\dynamic-2000x-10P',
            'real\\Bbook\\Standard\\dynamic-2000x-20Pips'
        ];

        if (!allowedGroups.includes(group)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid group. Only Pro and Standard accounts are allowed.'
            });
        }

        // Prepare MT5 account data
        const mt5AccountData = {
            name,
            group,
            leverage,
            masterPassword,
            investorPassword,
            password: masterPassword, // Legacy field
            email: email || '',
            country: country || '',
            city: city || '',
            phone: phone || '',
            comment: comment || 'Created from CRM'
        };

        // Call MT5 API to create account
        const mt5Response = await mt5Service.openMt5Account(mt5AccountData);

        const successFlag =
            typeof mt5Response?.Success !== 'undefined'
                ? mt5Response.Success
                : typeof mt5Response?.success !== 'undefined'
                    ? mt5Response.success
                    : true;

        if (successFlag === false) {
            return res.status(400).json({
                success: false,
                message: mt5Response.Message || mt5Response.message || 'Failed to create MT5 account'
            });
        }

        const mt5Data = mt5Response?.Data || mt5Response?.data || mt5Response;
        const mt5Login = mt5Data?.Login || mt5Data?.login;

        if (!mt5Login) {
            return res.status(500).json({
                success: false,
                message: 'MT5 API did not return an account login.'
            });
        }

        const recipientEmail = (email && email.trim()) || req.user?.email;

        const leverageValue = parseInt(leverage) || 100;

        console.log('🗄️ Preparing to store MT5 account and send welcome email...', {
            userId,
            mt5Login,
            leverage: leverageValue,
            hasRecipient: !!recipientEmail
        });

        const storeAccountPromise = dbService.prisma.mT5Account.create({
            data: {
                accountId: mt5Login.toString(),
                userId,
                password: masterPassword,
                leverage: leverageValue
            }
        });

        const emailPromise = recipientEmail
            ? (async () => {
                console.log('📧 Dispatching MT5 account email (concurrent with DB save)', {
                    to: recipientEmail,
                    userId,
                    mt5Login,
                });

                const result = await sendMt5AccountEmail({
                    to: recipientEmail,
                    userName: req.user?.name || name,
                    accountName: name,
                    login: mt5Login,
                    group,
                    leverage: leverageValue,
                    masterPassword,
                    investorPassword,
                });

                console.log('📬 MT5 account email response', {
                    to: recipientEmail,
                    messageId: result?.messageId,
                    accepted: result?.accepted,
                    rejected: result?.rejected,
                    response: result?.response,
                    envelope: result?.envelope,
                });

                return result;
            })()
            : (async () => {
                console.warn('⚠️ MT5 account created but no email recipient available.', {
                    userId,
                    mt5Login,
                });
                return null;
            })();

        const [storeAccountOutcome, emailOutcome] = await Promise.allSettled([storeAccountPromise, emailPromise]);

        if (storeAccountOutcome.status === 'rejected') {
            console.error('❌ Failed to store MT5 account in database. Email outcome:', emailOutcome);
            throw storeAccountOutcome.reason;
        }

        const newAccount = storeAccountOutcome.value;

        console.log('✅ MT5 account stored successfully in database', {
            id: newAccount.id,
            accountId: newAccount.accountId,
        });

        if (emailOutcome.status === 'rejected') {
            console.error('❌ MT5 account email failed to send:', {
                message: emailOutcome.reason?.message,
                stack: emailOutcome.reason?.stack,
            });
        } else if (emailOutcome.value) {
            console.log('✅ MT5 account email send resolved successfully');
        } else {
            console.log('ℹ️ MT5 account email skipped (no recipient provided)');
        }

        res.json({
            success: true,
            message: 'MT5 account created successfully',
            data: {
                mt5Login: mt5Login,
                accountId: newAccount.id
            }
        });

    } catch (error) {
        console.error('Error creating MT5 account:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// 4.3 POST /api/mt5/deposit
export const deposit = async (req, res) => {
    try {
        const { login, balance, comment } = req.body;

        // Get user ID from authenticated request
        const userId = req.user.id;

        // Validate required fields
        if (!login || !balance || balance <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing or invalid fields: login, balance (must be > 0)'
            });
        }

        // Verify the MT5 account belongs to the authenticated user
        const account = await dbService.prisma.mT5Account.findFirst({
            where: {
                accountId: login.toString(),
                userId: userId
            }
        });

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'MT5 account not found or access denied'
            });
        }

        // Call MT5 API to add balance
        const mt5Response = await mt5Service.depositMt5Balance(login, balance, comment || 'Deposit via CRM');

        if (!mt5Response.Success) {
            return res.status(400).json({
                success: false,
                message: mt5Response.Message || 'Failed to deposit to MT5 account'
            });
        }

        const mt5Data = mt5Response.Data;

        console.log('✅ Deposit successful for account:', login);

        // Create transaction record
        await dbService.prisma.MT5Transaction.create({
            data: {
                type: 'Deposit',
                amount: parseFloat(balance),
                status: 'completed',
                comment: comment || 'Deposit via CRM',
                mt5AccountId: account.id,
                transactionId: `DEP_${Date.now()}_${login}`
            }
        });

        // Notify user via email
        try {
            const to = req.user?.email;
            if (to) {
                await sendTransactionCompletedEmail({
                    to,
                    userName: req.user?.name,
                    type: 'Deposit',
                    accountLogin: login,
                    amount: balance,
                    date: new Date(),
                });
            }
        } catch (mailErr) {
            console.error('❌ Failed to send deposit email:', mailErr?.message || mailErr);
        }

        res.json({
            success: true,
            message: 'Deposit successful',
            data: {
                login: login,
                amount: balance,
                newBalance: mt5Data.Balance
            }
        });

    } catch (error) {
        console.error('Error depositing to MT5 account:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// Additional method: Get all MT5 accounts for a user
export const getUserAccounts = async (req, res) => {
    try {
        const userId = req.user.id;

        const accounts = await dbService.prisma.mT5Account.findMany({
            where: { userId: userId },
            orderBy: { createdAt: 'desc' }
        });

        console.log('🔍 Fetching user MT5 accounts from database...');
        console.log('👤 User ID:', userId);
        console.log('📊 Number of accounts found:', accounts.length);

        accounts.forEach((account, index) => {
            console.log(`📋 Account ${index + 1}:`, {
                id: account.id,
                accountId: account.accountId,
                createdAt: account.createdAt
            });
        });

        res.json({
            Success: true,
            Message: 'User accounts retrieved successfully',
            Data: {
                accounts: accounts.map(account => ({
                    id: account.id,
                    accountId: account.accountId,
                    createdAt: account.createdAt
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching user MT5 accounts:', error);
        res.status(500).json({
            Success: false,
            Message: error.message || 'Internal server error'
        });
    }
};

// 4.4 POST /api/mt5/withdraw
export const withdraw = async (req, res) => {
    try {
        const { login, balance, comment } = req.body;

        // Get user ID from authenticated request
        const userId = req.user.id;

        // Validate required fields
        if (!login || !balance || balance <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing or invalid fields: login, balance (must be > 0)'
            });
        }

        // Verify the MT5 account belongs to the authenticated user and get current balance
        const account = await dbService.prisma.mT5Account.findFirst({
            where: {
                accountId: login.toString(),
                userId: userId
            }
        });

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'MT5 account not found or access denied'
            });
        }

        // Call MT5 API to deduct balance (MT5 will validate sufficient balance)
        const mt5Response = await mt5Service.withdrawMt5Balance(login, balance, comment || 'Withdrawal via CRM');

        if (!mt5Response.Success) {
            return res.status(400).json({
                success: false,
                message: mt5Response.Message || 'Failed to withdraw from MT5 account'
            });
        }

        const mt5Data = mt5Response.Data;

        console.log('✅ Withdrawal successful for account:', login);

        // Create transaction record
        await dbService.prisma.MT5Transaction.create({
            data: {
                type: 'Withdrawal',
                amount: parseFloat(balance),
                status: 'completed',
                comment: comment || 'Withdrawal via CRM',
                mt5AccountId: account.id,
                transactionId: `WDR_${Date.now()}_${login}`
            }
        });

        // Notify user via email
        try {
            const to = req.user?.email;
            if (to) {
                await sendTransactionCompletedEmail({
                    to,
                    userName: req.user?.name,
                    type: 'Withdrawal',
                    accountLogin: login,
                    amount: balance,
                    date: new Date(),
                });
            }
        } catch (mailErr) {
            console.error('❌ Failed to send withdrawal email:', mailErr?.message || mailErr);
        }

        res.json({
            success: true,
            message: 'Withdrawal successful',
            data: {
                login: login,
                amount: balance,
                newBalance: mt5Data.Balance
            }
        });

    } catch (error) {
        console.error('Error withdrawing from MT5 account:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// 4.5 GET /api/mt5/user-profile/:login
export const getUserProfile = async (req, res) => {
    try {
        const { login } = req.params;

        // Get user ID from authenticated request
        const userId = req.user.id;

        console.log('🔍 Fetching profile for account:', login, 'User:', userId);

        // Validate login parameter
        if (!login) {
            return res.status(400).json({
                success: false,
                message: 'Login parameter is required'
            });
        }

        // Verify the MT5 account belongs to the authenticated user
        const account = await dbService.prisma.mT5Account.findFirst({
            where: {
                accountId: login.toString(),
                userId: userId
            }
        });

        if (!account) {
            console.log('❌ Account not found in database or access denied:', { login, userId });
            return res.status(404).json({
                success: false,
                message: 'MT5 account not found or access denied'
            });
        }

        console.log('✅ Account verified in database, fetching from MT5 API...');

        // Call MT5 API to get fresh profile data
        const mt5Data = await mt5Service.getMt5UserProfile(login);

        if (!mt5Data) {
            console.log('❌ MT5 API returned no data for account:', login);
            return res.status(400).json({
                success: false,
                message: 'Failed to fetch MT5 user profile from external API'
            });
        }

        console.log('✅ MT5 account profile retrieved successfully:', login);

        // Return the full MT5 profile data
        res.json({
            success: true,
            message: 'User profile retrieved successfully',
            data: mt5Data
        });

    } catch (error) {
        console.error('❌ Error fetching MT5 user profile for account', req.params.login, ':', error.message || error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// 4.7 POST /api/mt5/internal-transfer
export const internalTransfer = async (req, res) => {
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

        // Verify both accounts belong to the authenticated user
        const [fromAcc, toAcc] = await Promise.all([
            dbService.prisma.MT5Account.findFirst({
                where: {
                    accountId: fromAccount.toString(),
                    userId: userId
                }
            }),
            dbService.prisma.MT5Account.findFirst({
                where: {
                    accountId: toAccount.toString(),
                    userId: userId
                }
            })
        ]);

        if (!fromAcc) {
            return res.status(404).json({
                success: false,
                message: 'From account not found or access denied'
            });
        }

        if (!toAcc) {
            return res.status(404).json({
                success: false,
                message: 'To account not found or access denied'
            });
        }

        // Call MT5 API to deduct from fromAccount
        const withdrawResponse = await mt5Service.withdrawMt5Balance(fromAccount, amount, comment || 'Internal transfer');

        if (!withdrawResponse.Success) {
            return res.status(400).json({
                success: false,
                message: withdrawResponse.Message || 'Failed to deduct from source account'
            });
        }

        // Call MT5 API to add to toAccount
        const depositResponse = await mt5Service.depositMt5Balance(toAccount, amount, comment || 'Internal transfer');

        if (!depositResponse.Success) {
            // If deposit fails, we might need to reverse the withdrawal, but for now, just report the error
            return res.status(400).json({
                success: false,
                message: depositResponse.Message || 'Failed to credit to destination account'
            });
        }

        console.log('✅ Internal transfer successful:', { fromAccount, toAccount, amount });

        // Create transaction records for both accounts
        await Promise.all([
            dbService.prisma.MT5Transaction.create({
                data: {
                    type: 'Withdrawal',
                    amount: parseFloat(amount),
                    status: 'completed',
                    comment: comment || 'Internal transfer',
                    mt5AccountId: fromAcc.id,
                    transactionId: `INT_WDR_${Date.now()}_${fromAccount}`
                }
            }),
            dbService.prisma.MT5Transaction.create({
                data: {
                    type: 'Deposit',
                    amount: parseFloat(amount),
                    status: 'completed',
                    comment: comment || 'Internal transfer',
                    mt5AccountId: toAcc.id,
                    transactionId: `INT_DEP_${Date.now()}_${toAccount}`
                }
            })
        ]);

        // Notify user via email about the internal transfer
        try {
            const to = req.user?.email;
            if (to) {
                await sendInternalTransferEmail({
                    to,
                    userName: req.user?.name,
                    fromAccount,
                    toAccount,
                    amount,
                    date: new Date(),
                });
            }
        } catch (mailErr) {
            console.error('❌ Failed to send internal transfer email:', mailErr?.message || mailErr);
        }

        res.json({
            success: true,
            message: 'Internal transfer successful',
            data: {
                fromAccount: fromAccount,
                toAccount: toAccount,
                amount: amount,
                fromBalance: withdrawResponse.Data?.Balance,
                toBalance: depositResponse.Data?.Balance
            }
        });

    } catch (error) {
        console.error('Error in internal transfer:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// 4.6 POST /api/mt5/store-account
export const storeAccount = async (req, res) => {
    try {
        const { accountId, userName, userEmail, password, leverage } = req.body;

        console.log('🔄 SERVER: Storing MT5 account in database...');
        console.log('📊 Account ID:', accountId);
        console.log('👤 User Name:', userName);
        console.log('📧 User Email:', userEmail);
        console.log('🔐 Password provided:', !!password);
        console.log('⚡ Leverage:', leverage);

        // Validate required fields
        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID is required'
            });
        }

        if (!userName || !userEmail) {
            return res.status(400).json({
                success: false,
                message: 'User name and email are required'
            });
        }

        // Find user by name and email
        const user = await dbService.prisma.user.findFirst({
            where: {
                name: userName,
                email: userEmail
            }
        });

        if (!user) {
            console.log('❌ User not found with name:', userName, 'and email:', userEmail);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('✅ Found user:', user.name, 'with ID:', user.id);

        // Check if account already exists
        const existingAccount = await dbService.prisma.mT5Account.findFirst({
            where: {
                accountId: accountId.toString(),
                userId: user.id
            }
        });

        if (existingAccount) {
            console.log('⚠️ MT5 account already exists in database');
            return res.json({
                success: true,
                message: 'MT5 account already exists in database',
                data: {
                    accountId: existingAccount.accountId,
                    id: existingAccount.id
                }
            });
        }

        // Prepare account data
        const accountData = {
            accountId: accountId.toString(),
            userId: user.id
        };

        // Add optional fields if provided
        if (password) {
            accountData.password = password;
        }
        if (leverage) {
            accountData.leverage = parseInt(leverage);
        }

        // Store in DB and send credentials email concurrently
        console.log('🗄️ SERVER: Starting DB save and email send concurrently...');

        const savePromise = dbService.prisma.mT5Account.create({ data: accountData });
        const emailPromise = (async () => {
            if (!userEmail) {
                console.warn('⚠️ SERVER: Email not sent. No recipient email provided.');
                return null;
            }

            console.log('📧 SERVER: Preparing to send MT5 credentials email', {
                to: userEmail,
                login: accountId,
                leverage,
                hasPassword: !!password,
            });

            const result = await sendMt5AccountEmail({
                to: userEmail,
                userName,
                accountName: userName,
                login: accountId,
                leverage,
                masterPassword: password,
            });

            console.log('📬 SERVER: SMTP send result', {
                to: userEmail,
                messageId: result?.messageId,
                accepted: result?.accepted,
                rejected: result?.rejected,
                response: result?.response,
                envelope: result?.envelope,
            });

            return result;
        })();

        const [saveOutcome, emailOutcome] = await Promise.allSettled([savePromise, emailPromise]);

        if (saveOutcome.status === 'rejected') {
            console.error('❌ SERVER: Failed to store MT5 account:', saveOutcome.reason);
            throw saveOutcome.reason;
        }

        const newAccount = saveOutcome.value;

        if (emailOutcome.status === 'rejected') {
            console.error('❌ SERVER: Failed to send MT5 credentials email:', emailOutcome.reason);
        } else if (emailOutcome.value) {
            console.log('✅ SERVER: MT5 credentials email sent successfully');
        } else {
            console.log('ℹ️ SERVER: Email send skipped (no recipient).');
        }

        console.log('✅ SERVER: MT5 account stored successfully in database');
        console.log('🆔 Database record ID:', newAccount.id);
        console.log('💾 Stored accountId:', newAccount.accountId);

        res.json({
            success: true,
            message: 'MT5 account stored in database successfully',
            data: {
                accountId: newAccount.accountId,
                id: newAccount.id
            }
        });

    } catch (error) {
        console.error('❌ SERVER: Error storing MT5 account in database:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

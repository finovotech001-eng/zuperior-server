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
        console.log('🔍 DEBUG: Full request body:', JSON.stringify(req.body, null, 2));
        
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
        
        console.log('🔍 DEBUG: Extracted group from request:', group);

        // Validate required fields
        if (!name || !group || !masterPassword || !investorPassword) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, group, masterPassword, investorPassword'
            });
        }

        // Validate group is one of the allowed groups (Live or Demo)
        const allowedGroups = [
            'real\\Bbook\\Pro\\dynamic-2000x-10P',
            'real\\Bbook\\Standard\\dynamic-2000x-20Pips',
            'demo\\Pro\\dynamic-2000x-10PAbook',
            'demo\\Standard\\dynamic-2000x-20PAbook'
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
        // Note: openMt5Account uses mt5Request which returns response.data.Data when Success === true
        // So mt5Response will be the Data object, not the full response
        const mt5Data = await mt5Service.openMt5Account(mt5AccountData);
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

        // Determine account type from group
        console.log('🔍 DEBUG: Group received:', group);
        console.log('🔍 DEBUG: Group type:', typeof group);
        
        // Simple check: if group contains "demo" (case-insensitive), it's a demo account
        const groupLower = group.toLowerCase();
        const isDemoGroup = groupLower.includes('demo');
        
        console.log('🔍 DEBUG: Group lowercased:', groupLower);
        console.log('🔍 DEBUG: Contains "demo"?', isDemoGroup);
        
        const accountType = isDemoGroup ? 'Demo' : 'Live';
        
        // Determine package from group (Standard or Pro)
        const packageValue = groupLower.includes('pro') ? 'Pro' : 'Standard';
        
        console.log('📝 FINAL DECISION - Creating account with type:', accountType);
        console.log('📦 Package determined:', packageValue);
        console.log('📝 Full account creation data:', { mt5Login, userId, accountType, leverageValue, package: packageValue, nameOnAccount: name, originalGroup: group });
        
        console.log('💾 ABOUT TO SAVE TO DATABASE:');
        console.log('  - accountId:', mt5Login.toString());
        console.log('  - userId:', userId);
        console.log('  - accountType:', accountType);
        console.log('  - nameOnAccount:', name);
        console.log('  - package:', packageValue);
        console.log('  - password:', masterPassword ? 'SET' : 'NOT SET');
        console.log('  - leverage:', leverageValue);
        
        // Return response immediately after MT5 account is created
        // Store account and send email in background (non-blocking)
        res.json({
            success: true,
            message: 'MT5 account created successfully',
            data: {
                mt5Login: mt5Login,
                accountId: mt5Login // Use mt5Login as accountId for immediate response
            }
        });

        // Store account and send email in background (fire and forget)
        // Don't wait for these operations to complete
        Promise.allSettled([
            // Store in database using upsert to handle race conditions
            // If frontend store-account call happens first, this will update the account
            dbService.prisma.mT5Account.upsert({
                where: {
                    accountId: mt5Login.toString()
                },
                update: {
                    // Update fields if they're missing (especially nameOnAccount and package)
                    userId: userId,
                    accountType: accountType,
                    password: masterPassword,
                    leverage: leverageValue,
                    nameOnAccount: name,
                    package: packageValue
                },
                create: {
                    accountId: mt5Login.toString(),
                    userId,
                    accountType: accountType,
                    password: masterPassword,
                    leverage: leverageValue,
                    nameOnAccount: name,
                    package: packageValue
                }
            }).then(savedAccount => {
                console.log('✅ ACCOUNT SAVED/UPDATED IN DATABASE:', {
                    id: savedAccount.id,
                    accountId: savedAccount.accountId,
                    accountType: savedAccount.accountType,
                    nameOnAccount: savedAccount.nameOnAccount,
                    package: savedAccount.package,
                    userId: savedAccount.userId
                });
            }).catch(error => {
                console.error('❌ ERROR SAVING TO DATABASE:', error);
            }),
            
            // Send email (if recipient available)
            recipientEmail
                ? (async () => {
                    console.log('📧 Dispatching MT5 account email (background)', {
                        to: recipientEmail,
                        userId,
                        mt5Login,
                    });

                    try {
                        const result = await sendMt5AccountEmail({
                            to: recipientEmail,
                            userName: req.user?.name || name,
                            accountName: name,
                            login: mt5Login,
                            accountType: accountType,
                            group,
                            leverage: leverageValue,
                            masterPassword,
                            investorPassword,
                            accountType: accountType,
                        });

                        console.log('📬 MT5 account email sent successfully', {
                            to: recipientEmail,
                            messageId: result?.messageId,
                        });
                        return result;
                    } catch (emailError) {
                        console.error('❌ MT5 account email failed to send:', {
                            message: emailError?.message,
                            stack: emailError?.stack,
                        });
                        return null;
                    }
                })()
                : Promise.resolve(null)
        ]).then(() => {
            console.log('✅ Background operations completed (DB save + email)');
        }).catch(err => {
            console.error('⚠️ Background operation error (non-critical):', err);
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
        // Get login from URL parameter (if present) or from body
        const login = req.params.login || req.body.login;
        const { balance, comment } = req.body;

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

        // Call server-side function to add balance
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
        const { accountType } = req.query; // Optional filter by accountType

        // Build where clause
        const whereClause = { userId: userId };
        if (accountType) {
            whereClause.accountType = accountType;
        }

        const accounts = await dbService.prisma.mT5Account.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
        });

        console.log('🔍 Fetching user MT5 accounts from database...');
        console.log('👤 User ID:', userId);
        console.log('📊 Number of accounts found:', accounts.length);
        if (accountType) {
            console.log('🔍 Filtering by accountType:', accountType);
        }

        accounts.forEach((account, index) => {
            console.log(`📋 Account ${index + 1}:`, {
                id: account.id,
                accountId: account.accountId,
                accountType: account.accountType,
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
                    accountType: account.accountType,
                    nameOnAccount: account.nameOnAccount || null,
                    leverage: account.leverage || null,
                    package: account.package || null,
                    password: account.password || null,
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

        // Get optional access token from query params
        const accessToken = req.query.accessToken || null;
        if (accessToken) {
            console.log('🔐 Using Bearer token for authentication');
        }

        // Call MT5 API to get fresh profile data
        const mt5Data = await mt5Service.getMt5UserProfile(login, accessToken);

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
        const { accountId, accountType, userName, userEmail, password, leverage, group, nameOnAccount, package: packageValue } = req.body;

        console.log('🔄 SERVER: Storing MT5 account in database...');
        console.log('📊 Account ID:', accountId);
        console.log('📊 Account Type:', accountType);
        console.log('📊 Group:', group);
        console.log('👤 User Name:', userName);
        console.log('📊 Name on Account:', nameOnAccount);
        console.log('📦 Package:', packageValue);
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

        // Get user ID from authenticated request if available
        const userId = req.user?.id;
        
        if (!userId && (!userName || !userEmail)) {
            return res.status(400).json({
                success: false,
                message: 'User ID or name and email are required'
            });
        }

        let user;
        
        if (userId) {
            // Use authenticated user ID
            user = { id: userId };
        } else {
            // Find user by name and email
            user = await dbService.prisma.User.findFirst({
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
        }

        // Check if account already exists
        const existingAccount = await dbService.prisma.mT5Account.findFirst({
            where: {
                accountId: accountId.toString(),
                userId: user.id
            }
        });

        // Prepare account data
        const accountData = {
            accountId: accountId.toString(),
            userId: user.id
        };

        // Add accountType if provided
        if (accountType) {
            accountData.accountType = accountType;
        }
        
        // Add optional fields if provided
        if (password) {
            accountData.password = password;
        }
        if (leverage) {
            accountData.leverage = parseInt(leverage);
        }
        if (nameOnAccount) {
            accountData.nameOnAccount = nameOnAccount;
        }
        
        // Determine package from group if not provided, otherwise use provided value
        let finalPackage = packageValue;
        if (!finalPackage && group) {
            const groupLower = group.toLowerCase();
            finalPackage = groupLower.includes('pro') ? 'Pro' : 'Standard';
        }
        if (finalPackage) {
            accountData.package = finalPackage;
        }

        // Use upsert to handle both create and update cases (for race conditions)
        // This ensures nameOnAccount and package are always set, even if account already exists
        if (existingAccount) {
            console.log('⚠️ MT5 account already exists in database, updating with provided fields...');
            console.log('📝 Updating fields:', { nameOnAccount, package: finalPackage, leverage, hasPassword: !!password });
        }

        // Store in DB and send credentials email concurrently
        console.log('🗄️ SERVER: Starting DB save and email send concurrently...');

        console.log('💾 ABOUT TO SAVE ACCOUNT TO DATABASE:', accountData);
        
        // Use upsert to handle race conditions:
        // - If account doesn't exist, create it with all fields
        // - If account exists, update it with provided fields (especially nameOnAccount and package)
        const savePromise = dbService.prisma.mT5Account.upsert({
            where: {
                accountId: accountId.toString()
            },
            update: {
                // Only update fields that are provided (don't overwrite with null/undefined)
                ...(accountType && { accountType }),
                ...(password && { password }),
                ...(leverage && { leverage: parseInt(leverage) }),
                ...(nameOnAccount && { nameOnAccount }),
                ...(finalPackage && { package: finalPackage })
            },
            create: accountData
        });
        
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
                accountType: accountType,
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

// 4.10 SET /api/mt5/set-default-account
export const setDefaultAccount = async (req, res) => {
    try {
        const { accountId } = req.body;
        const userId = req.user.id;

        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'accountId is required'
            });
        }

        console.log(`🔍 Setting default MT5 account for user ${userId}:`, accountId);

        // Verify the account belongs to the user
        const mt5Account = await dbService.prisma.mT5Account.findFirst({
            where: { 
                accountId: accountId.toString(),
                userId: userId 
            },
            select: { accountId: true }
        });

        if (!mt5Account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found or does not belong to user'
            });
        }

        // Upsert (update if exists, create if not) default account
        const defaultAccount = await dbService.prisma.DefaultMT5Account.upsert({
            where: { userId: userId },
            update: { 
                mt5AccountId: mt5Account.accountId
            },
            create: { 
                id: accountId, // Use accountId as the id
                userId: userId, 
                mt5AccountId: mt5Account.accountId 
            }
        });

        console.log(`✅ Default MT5 account set successfully for user ${userId}:`, accountId);

        res.json({
            success: true,
            message: 'Default MT5 account set successfully',
            data: {
                accountId: defaultAccount.mt5AccountId
            }
        });

    } catch (error) {
        console.error('❌ Error setting default MT5 account:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

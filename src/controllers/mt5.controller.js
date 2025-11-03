// zuperior-dashboard/server/src/controllers/mt5.controller.js

import * as mt5Service from '../services/mt5.service.js';
import dbService from '../services/db.service.js';
import { sendMt5AccountEmail, sendInternalTransferEmail, sendTransactionCompletedEmail } from '../services/email.service.js';
import { toTitleCase } from '../utils/stringUtils.js';

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
        // Auto-capitalize nameOnAccount (title case)
        const titleCaseNameOnAccount = toTitleCase(name);
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
                    nameOnAccount: titleCaseNameOnAccount.trim(), // Title case
                    package: packageValue
                },
                create: {
                    accountId: mt5Login.toString(),
                    userId,
                    accountType: accountType,
                    password: masterPassword,
                    leverage: leverageValue,
                    nameOnAccount: titleCaseNameOnAccount.trim(), // Title case
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
        console.log('📋 Account details:', { 
            accountId: login, 
            userId: userId,
            hasPassword: !!account.password,
            accountType: account.accountType
        });

        // Try to get access token using account password (if available)
        // IMPORTANT: Use the account's own password to get access token for the correct account ID
        let accessToken = req.query.accessToken || null;
        if (!accessToken && account.password) {
            console.log(`🔐 Getting MT5 access token for account ${login} using its own password...`);
            try {
                accessToken = await mt5Service.getMt5AccessToken(login.toString(), account.password);
                if (accessToken) {
                    console.log(`✅ MT5 access token obtained successfully for account ${login}`);
                } else {
                    console.log(`⚠️ Failed to get access token for account ${login}, will attempt without token`);
                }
            } catch (tokenError) {
                console.error(`❌ Error getting access token for account ${login}:`, tokenError.message);
                // Continue without token - API may still work
            }
        } else if (!account.password) {
            console.log(`⚠️ No password stored for account ${login} - cannot get access token`);
        }

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

// ✅ Update MT5 Account Leverage - PUT /api/mt5/update-account/:login
export const updateAccountLeverage = async (req, res) => {
    try {
        const { login } = req.params;
        const { leverage } = req.body;
        const userId = req.user.id;

        if (!login || !leverage) {
            return res.status(400).json({
                success: false,
                message: 'Login and leverage are required'
            });
        }

        // Verify account belongs to user
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

        // Get current account profile from MT5 API to get all required fields
        console.log(`[MT5] 🔄 Fetching current profile for account ${login} before leverage update`);
        const currentProfile = await mt5Service.getMt5UserProfile(login, null);

        if (!currentProfile) {
            return res.status(400).json({
                success: false,
                message: 'Failed to fetch current account profile'
            });
        }

        // Prepare update data - include all required fields from current profile
        const updateData = {
            name: currentProfile.Name || currentProfile.name || account.nameOnAccount || 'User',
            group: currentProfile.Group || currentProfile.group || '',
            email: currentProfile.Email || currentProfile.email || '',
            country: currentProfile.Country || currentProfile.country || '',
            city: currentProfile.City || currentProfile.city || '',
            phone: currentProfile.Phone || currentProfile.phone || '',
            leverage: parseInt(leverage),
            comment: currentProfile.Comment || currentProfile.comment || ''
        };

        console.log(`[MT5] 🔄 Updating leverage for account ${login} to ${leverage}`);
        
        // Update via MT5 API (no access token needed - Manager API doesn't require it)
        const result = await mt5Service.updateMt5User(login, updateData, null);

        if (result && result.Success === true) {
            // Update leverage in our database
            await dbService.prisma.mT5Account.update({
                where: { accountId: login.toString() },
                data: { leverage: parseInt(leverage) }
            });

            console.log(`✅ Leverage updated successfully for account ${login}`);
            res.json({
                success: true,
                message: 'Leverage updated successfully',
                data: result
            });
        } else {
            throw new Error(result?.Message || result?.message || 'Failed to update leverage');
        }

    } catch (error) {
        console.error('❌ Error updating leverage:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update leverage'
        });
    }
};

// ✅ Update MT5 Account Name - PUT /api/mt5/update-account/:login
export const updateAccountName = async (req, res) => {
    try {
        const { login } = req.params;
        const { name } = req.body;
        const userId = req.user.id;

        if (!login || !name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Login and name are required'
            });
        }

        // Verify account belongs to user
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

        // Get current account profile from MT5 API to get all required fields
        console.log(`[MT5] 🔄 Fetching current profile for account ${login} before name update`);
        const currentProfile = await mt5Service.getMt5UserProfile(login, null);

        if (!currentProfile) {
            return res.status(400).json({
                success: false,
                message: 'Failed to fetch current account profile'
            });
        }

        // Auto-capitalize the new name (title case)
        const titleCaseName = toTitleCase(name.trim());

        // Prepare update data - include all required fields from current profile
        const updateData = {
            name: titleCaseName,
            group: currentProfile.Group || currentProfile.group || '',
            email: currentProfile.Email || currentProfile.email || '',
            country: currentProfile.Country || currentProfile.country || '',
            city: currentProfile.City || currentProfile.city || '',
            phone: currentProfile.Phone || currentProfile.phone || '',
            leverage: currentProfile.Leverage || currentProfile.leverage || account.leverage || 100,
            comment: currentProfile.Comment || currentProfile.comment || ''
        };

        console.log(`[MT5] 🔄 Updating name for account ${login} to "${titleCaseName}"`);
        
        // Update via MT5 API (no access token needed - Manager API doesn't require it)
        const result = await mt5Service.updateMt5User(login, updateData, null);

        if (result && result.Success === true) {
            // Update nameOnAccount in our database
            await dbService.prisma.mT5Account.update({
                where: { accountId: login.toString() },
                data: { nameOnAccount: titleCaseName }
            });

            console.log(`✅ Name updated successfully for account ${login}`);
            res.json({
                success: true,
                message: 'Account name updated successfully',
                data: result
            });
        } else {
            throw new Error(result?.Message || result?.message || 'Failed to update account name');
        }

    } catch (error) {
        console.error('❌ Error updating account name:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update account name'
        });
    }
};

// ✅ Change MT5 Account Password - PUT /api/mt5/change-password/:login
export const changeAccountPassword = async (req, res) => {
    try {
        const { login } = req.params;
        const { newPassword, passwordType = 'main' } = req.body;
        const userId = req.user.id;

        if (!login || !newPassword || !newPassword.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Login and new password are required'
            });
        }

        // Verify account belongs to user
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

        console.log(`[MT5] 🔐 Changing password for account ${login}, type: ${passwordType}`);
        
        // Change password via MT5 API
        const result = await mt5Service.changeMt5Password(login, newPassword.trim(), passwordType);

        // Check if the API call was successful
        // The MT5 API might return success in different formats, handle accordingly
        const isSuccess = result?.Success === true || 
                         result?.success === true || 
                         result?.status_code === "1" ||
                         (!result?.Error && !result?.error && result !== null);

        if (isSuccess) {
            // Update password in our database (optional - depends on if you want to store it)
            // Note: You may want to hash the password before storing
            // For now, we'll update it to the new password (unhashed)
            // In production, consider whether you want to store MT5 passwords at all
            await dbService.prisma.mT5Account.update({
                where: { accountId: login.toString() },
                data: { password: newPassword.trim() } // Update stored password
            });

            console.log(`✅ Password changed successfully for account ${login}`);
            res.json({
                success: true,
                message: 'Password changed successfully',
                data: result
            });
        } else {
            const errorMessage = result?.Message || result?.message || result?.Error || result?.error || 'Failed to change password';
            throw new Error(errorMessage);
        }

    } catch (error) {
        console.error('❌ Error changing password:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to change password'
        });
    }
};

// ✅ OPTIMIZED: Fetch account balances for all user's accounts in parallel (fast & accurate)
export const getUserAccountsWithBalance = async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch all user's MT5 accounts from database
        const accounts = await dbService.prisma.mT5Account.findMany({
            where: { userId: userId },
            select: {
                id: true,
                accountId: true,
                accountType: true,
                package: true,
                nameOnAccount: true,
                leverage: true,
                password: true, // Need password to get access token
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!accounts || accounts.length === 0) {
            return res.json({
                success: true,
                data: {
                    accounts: [],
                    totalBalance: 0
                }
            });
        }

        // CRITICAL: Deduplicate accounts by accountId to prevent fetching the same account multiple times
        const uniqueAccountsMap = new Map();
        accounts.forEach(account => {
            // Use accountId as key to ensure uniqueness
            if (!uniqueAccountsMap.has(account.accountId)) {
                uniqueAccountsMap.set(account.accountId, account);
            } else {
                console.warn(`[MT5] ⚠️ Duplicate account ID ${account.accountId} detected - skipping duplicate`);
            }
        });
        
        const uniqueAccounts = Array.from(uniqueAccountsMap.values());
        
        console.log(`[MT5] 🔄 Fetching balances for ${uniqueAccounts.length} unique accounts (${accounts.length} total before dedup) in parallel for user ${userId}`);

        // Fetch balances for all unique accounts in parallel (like admin panel - fast & accurate)
        // Use access tokens with AccountID to properly fetch balance and P/L info from getClientProfile
        const accountsWithBalance = await Promise.allSettled(
            uniqueAccounts.map(async (account) => {
                const maxRetries = 2;
                let lastError = null;
                
                // Retry logic for fetching balance
                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    try {
                        // Get access token for this account using its password
                        let accessToken = null;
                        if (account.password) {
                            try {
                                console.log(`[MT5] 🔐 Getting access token for account ${account.accountId} (attempt ${attempt + 1})`);
                                accessToken = await mt5Service.getMt5AccessToken(account.accountId, account.password);
                                if (accessToken) {
                                    console.log(`[MT5] ✅ Access token obtained for account ${account.accountId}`);
                                } else {
                                    console.log(`[MT5] ⚠️ Failed to get access token for account ${account.accountId}, will try without token`);
                                }
                            } catch (tokenError) {
                                console.warn(`[MT5] ⚠️ Error getting access token for account ${account.accountId}:`, tokenError.message);
                                // Continue without token - will try without it
                            }
                        } else {
                            console.log(`[MT5] ⚠️ No password available for account ${account.accountId}, will try without token`);
                        }
                        
                        // Fetch profile from MT5 API - use access token if available
                        // Increased timeout to 10 seconds per account to handle slower API responses
                        console.log(`[MT5] 🔄 Fetching FRESH balance for account ${account.accountId} ${accessToken ? 'with access token' : 'without token'} (attempt ${attempt + 1})`);
                        const mt5Data = await Promise.race([
                            mt5Service.getMt5UserProfile(account.accountId, accessToken), // Pass access token if available
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Timeout')), 10000) // 10s timeout per account
                            )
                        ]);
                        
                        // CRITICAL: Verify the response is for the correct account
                        const responseLogin = mt5Data?.Login ?? mt5Data?.login;
                        if (responseLogin && Number(responseLogin) !== Number(account.accountId)) {
                            console.error(`[MT5] ❌ MISMATCH: Requested account ${account.accountId} but got account ${responseLogin} from API`);
                            throw new Error(`Account mismatch: requested ${account.accountId} but received ${responseLogin}`);
                        }

                        // Verify we got valid data (not empty/undefined)
                        if (!mt5Data || (mt5Data.Balance === undefined && mt5Data.balance === undefined)) {
                            throw new Error(`Empty or invalid response for account ${account.accountId}`);
                        }

                        // Extract balance data - log the actual values from API
                        const balance = Number(mt5Data?.Balance ?? mt5Data?.balance ?? 0);
                        const equity = Number(mt5Data?.Equity ?? mt5Data?.equity ?? 0);
                        
                        // CRITICAL: Use Profit from API if available (even if 0), otherwise calculate from Equity - Balance
                        // Check for null/undefined specifically, not falsy values, since Profit can be 0
                        let profit = 0;
                        if (mt5Data?.Profit !== undefined && mt5Data?.Profit !== null) {
                            profit = Number(mt5Data.Profit) || 0;
                        } else if (mt5Data?.profit !== undefined && mt5Data?.profit !== null) {
                            profit = Number(mt5Data.profit) || 0;
                        } else {
                            // Fallback: Calculate P/L as Equity - Balance (unrealized + realized profit/loss)
                            profit = Number((equity - balance).toFixed(2));
                        }
                        
                        console.log(`[MT5] ✅ Account ${account.accountId} (Login: ${responseLogin}) - Balance: ${balance}, Equity: ${equity}, Profit (API): ${mt5Data?.Profit ?? mt5Data?.profit ?? 'N/A'}, Profit (calculated/used): ${profit}`);
                        const credit = Number(mt5Data?.Credit ?? mt5Data?.credit ?? 0);
                        const margin = Number(mt5Data?.Margin ?? mt5Data?.margin ?? 0);
                        const marginFree = Number(mt5Data?.MarginFree ?? mt5Data?.Margin_Free ?? mt5Data?.marginFree ?? 0);
                        const marginLevel = Number(mt5Data?.MarginLevel ?? mt5Data?.Margin_Level ?? mt5Data?.marginLevel ?? 0);

                        // Success - return account data
                        return {
                            id: account.id,
                            accountId: account.accountId,
                            accountType: account.accountType,
                            package: account.package,
                            nameOnAccount: account.nameOnAccount,
                            leverage: account.leverage,
                            balance,
                            equity,
                            profit,
                            credit,
                            margin,
                            marginFree,
                            marginLevel,
                        };
                    } catch (error) {
                        lastError = error;
                        const isLastAttempt = attempt === maxRetries;
                        
                        if (isLastAttempt) {
                            console.error(`[MT5] ❌ Failed to fetch balance for account ${account.accountId} after ${maxRetries + 1} attempts:`, error.message);
                        } else {
                            // Wait before retry (exponential backoff: 500ms, 1000ms)
                            const delay = (attempt + 1) * 500;
                            console.warn(`[MT5] ⚠️ Attempt ${attempt + 1} failed for account ${account.accountId}, retrying in ${delay}ms... Error: ${error.message}`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue; // Retry
                        }
                    }
                }
                
                // All retries failed - return account with zero balance
                console.warn(`[MT5] ⚠️ Returning zero balance for account ${account.accountId} after all retries failed:`, lastError?.message);
                return {
                    id: account.id,
                    accountId: account.accountId,
                    accountType: account.accountType,
                    package: account.package,
                    nameOnAccount: account.nameOnAccount,
                    leverage: account.leverage,
                    balance: 0,
                    equity: 0,
                    profit: 0,
                    credit: 0,
                    margin: 0,
                    marginFree: 0,
                    marginLevel: 0,
                };
            })
        ).then(results => {
            // Process Promise.allSettled results - extract fulfilled values or handle rejections
            return results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                } else {
                    // Handle rejection (shouldn't happen since we catch all errors, but just in case)
                    const account = uniqueAccounts[index];
                    console.error(`[MT5] ❌ Promise rejected for account ${account?.accountId}:`, result.reason);
                    return {
                        id: account?.id,
                        accountId: account?.accountId,
                        accountType: account?.accountType,
                        package: account?.package,
                        nameOnAccount: account?.nameOnAccount,
                        leverage: account?.leverage,
                        balance: 0,
                        equity: 0,
                        profit: 0,
                        credit: 0,
                        margin: 0,
                        marginFree: 0,
                        marginLevel: 0,
                    };
                }
            });
        });

        // Calculate total balance from Live accounts only
        const totalBalance = accountsWithBalance
            .filter(acc => (acc.accountType || 'Live') === 'Live')
            .reduce((sum, acc) => sum + (acc.balance || 0), 0);

        // Log detailed summary of all accounts processed
        const accountsWithBalanceCount = accountsWithBalance.filter(acc => acc.balance > 0).length;
        const accountsWithZeroBalanceCount = accountsWithBalance.filter(acc => acc.balance === 0).length;
        const fetchedAccountIds = accountsWithBalance.map(acc => acc.accountId);
        
        console.log(`[MT5] ✅ Successfully processed ${accountsWithBalance.length} UNIQUE accounts:`);
        console.log(`[MT5]   - Accounts with balance > 0: ${accountsWithBalanceCount}`);
        console.log(`[MT5]   - Accounts with balance = 0: ${accountsWithZeroBalanceCount}`);
        console.log(`[MT5]   - Total balance (Live accounts only): ${totalBalance}`);
        console.log(`[MT5] 📋 Processed account IDs: [${fetchedAccountIds.join(', ')}]`);
        
        // Log accounts with zero balance for debugging
        if (accountsWithZeroBalanceCount > 0) {
            const zeroBalanceAccounts = accountsWithBalance
                .filter(acc => acc.balance === 0)
                .map(acc => acc.accountId);
            console.warn(`[MT5] ⚠️ Accounts with zero balance (may indicate fetch failures): [${zeroBalanceAccounts.join(', ')}]`);
        }

        res.json({
            success: true,
            message: 'Account balances retrieved successfully',
            data: {
                accounts: accountsWithBalance,
                totalBalance
            }
        });

    } catch (error) {
        console.error('❌ Error fetching accounts with balance:', error.message || error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch account balances'
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
            accountData.nameOnAccount = toTitleCase(nameOnAccount); // Auto-capitalize (title case)
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
                ...(nameOnAccount && { nameOnAccount: toTitleCase(nameOnAccount) }), // Auto-capitalize (title case)
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

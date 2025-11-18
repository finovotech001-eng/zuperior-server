// zuperior-server/src/controllers/groupManagement.controller.js

import dbService from '../services/db.service.js';

/**
 * Get active groups from group_management table
 * Optionally filter by account type (Live/Demo)
 * 
 * @route GET /api/group-management/active-groups
 * @query {string} accountType - Optional filter: "Live" or "Demo"
 */
export const getActiveGroups = async (req, res) => {
    try {
        const { accountType } = req.query;
        
        // Build where clause
        const where = {
            is_active: true
        };
        
        // Filter by account_type if provided
        if (accountType) {
            where.account_type = accountType;
        }
        
        // Query group_management table
        const groups = await dbService.prisma.group_management.findMany({
            where,
            orderBy: {
                id: 'asc' // Use id instead of created_at in case created_at is null
            },
            select: {
                id: true,
                group: true,
                dedicated_name: true,
                account_type: true,
                server: true,
                auth_mode: true,
                auth_password_min: true,
                currency: true,
                leverage: true,
                min_deposit: true,
                spread: true,
                commission: true,
                is_active: true,
                synced_at: true,
                created_at: true,
                updated_at: true
            }
        });
        
        console.log('📊 Groups fetched:', groups.length);
        if (groups.length > 0) {
            console.log('📊 First group sample:', {
                id: groups[0].id,
                group: groups[0].group,
                leverage: groups[0].leverage,
                min_deposit: groups[0].min_deposit,
                spread: groups[0].spread,
                commission: groups[0].commission
            });
        }
        
        return res.status(200).json({
            success: true,
            data: groups,
            count: groups.length
        });
    } catch (error) {
        console.error('❌ Error fetching active groups:', error);
        console.error('❌ Error stack:', error.stack);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch active groups',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Validate if a group exists and is active
 * Used internally by other controllers
 * 
 * @param {string} group - The group string to validate
 * @returns {Promise<Object|null>} - Group object if valid, null otherwise
 */
export const validateGroup = async (group) => {
    try {
        const groupRecord = await dbService.prisma.group_management.findFirst({
            where: {
                group: group,
                is_active: true
            }
        });
        
        return groupRecord;
    } catch (error) {
        console.error('Error validating group:', error);
        return null;
    }
};


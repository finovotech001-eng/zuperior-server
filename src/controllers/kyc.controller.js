// server/src/controllers/kyc.controller.js

import dbService from '../services/db.service.js';

// 1. Create initial KYC record for user
export const createKycRecord = async (req, res) => {
    try {
        const userId = req.user.id;

        console.log('📝 Creating KYC record for user:', userId);

        // Check if KYC record already exists
        const existingKyc = await dbService.prisma.KYC.findUnique({
            where: { userId }
        });

        if (existingKyc) {
            console.log('✅ KYC record already exists:', existingKyc.id);
            return res.json({
                success: true,
                message: 'KYC record already exists',
                data: existingKyc
            });
        }

        // Create new KYC record
        const kyc = await dbService.prisma.KYC.create({
            data: {
                userId,
                verificationStatus: 'Pending'
            }
        });

        console.log('✅ KYC record created successfully:', kyc.id);

        res.json({
            success: true,
            message: 'KYC record created successfully',
            data: kyc
        });
    } catch (error) {
        console.error('❌ Error creating KYC record:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// 2. Update document verification status
export const updateDocumentStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const { documentReference, isDocumentVerified, amlReference } = req.body;

        if (!documentReference) {
            return res.status(400).json({
                success: false,
                message: 'Document reference is required'
            });
        }

        // Find or create KYC record
        let kyc = await dbService.prisma.KYC.findUnique({
            where: { userId }
        });

        if (!kyc) {
            kyc = await dbService.prisma.KYC.create({
                data: {
                    userId,
                    documentReference,
                    isDocumentVerified: isDocumentVerified || false,
                    amlReference: amlReference || null,
                    documentSubmittedAt: new Date(),
                    verificationStatus: isDocumentVerified ? 'Partially Verified' : 'Pending'
                }
            });
        } else {
            // Determine verification status
            let newStatus = 'Pending';
            if (!isDocumentVerified) {
                newStatus = 'Declined';
            } else if (kyc.isAddressVerified && isDocumentVerified) {
                newStatus = 'Verified';
            } else if (isDocumentVerified) {
                newStatus = 'Partially Verified';
            }

            kyc = await dbService.prisma.KYC.update({
                where: { userId },
                data: {
                    documentReference,
                    isDocumentVerified: isDocumentVerified || false,
                    amlReference: amlReference || null,
                    documentSubmittedAt: new Date(),
                    verificationStatus: newStatus
                }
            });
        }

        console.log('✅ Document verification status updated:', {
            userId,
            documentReference,
            isDocumentVerified,
            verificationStatus: kyc.verificationStatus
        });

        res.json({
            success: true,
            message: 'Document verification status updated',
            data: kyc
        });
    } catch (error) {
        console.error('Error updating document status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// 3. Update address verification status
export const updateAddressStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const { addressReference, isAddressVerified } = req.body;

        if (!addressReference) {
            return res.status(400).json({
                success: false,
                message: 'Address reference is required'
            });
        }

        // Find or create KYC record
        let kyc = await dbService.prisma.KYC.findUnique({
            where: { userId }
        });

        if (!kyc) {
            kyc = await dbService.prisma.KYC.create({
                data: {
                    userId,
                    addressReference,
                    isAddressVerified: isAddressVerified || false,
                    addressSubmittedAt: new Date(),
                    verificationStatus: isAddressVerified ? 'Partially Verified' : 'Pending'
                }
            });
        } else {
            // Determine verification status
            let newStatus = 'Pending';
            if (!isAddressVerified) {
                newStatus = 'Declined';
            } else if (kyc.isDocumentVerified && isAddressVerified) {
                newStatus = 'Verified';
            } else if (isAddressVerified) {
                newStatus = 'Partially Verified';
            }

            kyc = await dbService.prisma.KYC.update({
                where: { userId },
                data: {
                    addressReference,
                    isAddressVerified: isAddressVerified || false,
                    addressSubmittedAt: new Date(),
                    verificationStatus: newStatus
                }
            });
        }

        console.log('✅ Address verification status updated:', {
            userId,
            addressReference,
            isAddressVerified,
            verificationStatus: kyc.verificationStatus
        });

        res.json({
            success: true,
            message: 'Address verification status updated',
            data: kyc
        });
    } catch (error) {
        console.error('Error updating address status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// 4. Get user's KYC status
export const getKycStatus = async (req, res) => {
    try {
        const userId = req.user.id;

        const kyc = await dbService.prisma.KYC.findUnique({
            where: { userId }
        });

        if (!kyc) {
            return res.json({
                success: true,
                message: 'No KYC record found',
                data: {
                    isDocumentVerified: false,
                    isAddressVerified: false,
                    verificationStatus: 'Pending'
                }
            });
        }

        res.json({
            success: true,
            message: 'KYC status retrieved successfully',
            data: kyc
        });
    } catch (error) {
        console.error('Error fetching KYC status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// 5. Webhook handler for Shufti Pro callbacks
export const handleCallback = async (req, res) => {
    try {
        const payload = req.body;
        
        console.log('🔔 Shufti Pro Webhook received:', {
            reference: payload.reference,
            event: payload.event,
            timestamp: new Date().toISOString(),
            payload: JSON.stringify(payload, null, 2)
        });

        // Extract reference and event type
        const { reference, event, verification_result, verification_data, declined_reason, error } = payload;

        if (!reference) {
            return res.status(400).json({
                success: false,
                message: 'Reference is required'
            });
        }

        // Find KYC record by reference (document, address, or AML)
        const kyc = await dbService.prisma.KYC.findFirst({
            where: {
                OR: [
                    { documentReference: reference },
                    { addressReference: reference },
                    { amlReference: reference }
                ]
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                }
            }
        });

        if (!kyc) {
            console.log('⚠️ No KYC record found for reference:', reference);
            return res.status(404).json({
                success: false,
                message: 'KYC record not found'
            });
        }

        // Update KYC status based on event
        const isAccepted = event === 'verification.accepted';
        const isDeclined = event === 'verification.declined';
        const isPending = event === 'request.pending' || event === 'request.received';
        const isCancelled = event === 'request.invalid' || event === 'request.timeout';

        let updateData = {};
        let verificationType = '';

        // Determine verification type and update accordingly
        if (kyc.documentReference === reference) {
            verificationType = 'document';
            updateData.isDocumentVerified = isAccepted;
            updateData.documentSubmittedAt = new Date();
            
            if (isDeclined) {
                const reason = declined_reason || 
                              verification_result?.document?.declined_reason ||
                              verification_data?.document?.message ||
                              'Document verification failed';
                updateData.rejectionReason = reason;
                updateData.isDocumentVerified = false;
            } else if (isAccepted) {
                updateData.rejectionReason = null;
            }
        } else if (kyc.addressReference === reference) {
            verificationType = 'address';
            updateData.isAddressVerified = isAccepted;
            updateData.addressSubmittedAt = new Date();
            
            if (isDeclined) {
                const reason = declined_reason || 
                              verification_result?.address?.declined_reason ||
                              verification_data?.address?.message ||
                              'Address verification failed';
                updateData.rejectionReason = reason;
                updateData.isAddressVerified = false;
            } else if (isAccepted) {
                updateData.rejectionReason = null;
            }
        } else if (kyc.amlReference === reference) {
            verificationType = 'aml';
            // AML check doesn't change document/address verification
            // But we track the result
            if (isDeclined) {
                const reason = declined_reason || 
                              verification_result?.background_checks?.declined_reason ||
                              'AML screening failed';
                updateData.rejectionReason = reason;
            }
        }

        // Determine overall verification status
        const newDocumentStatus = updateData.isDocumentVerified !== undefined 
            ? updateData.isDocumentVerified 
            : kyc.isDocumentVerified;
        const newAddressStatus = updateData.isAddressVerified !== undefined 
            ? updateData.isAddressVerified 
            : kyc.isAddressVerified;

        if (isAccepted) {
            if (newDocumentStatus && newAddressStatus) {
                updateData.verificationStatus = 'Verified';
            } else if (newDocumentStatus || newAddressStatus) {
                updateData.verificationStatus = 'Partially Verified';
            }
        } else if (isDeclined) {
            updateData.verificationStatus = 'Declined';
        } else if (isPending) {
            updateData.verificationStatus = 'Pending';
        } else if (isCancelled) {
            updateData.verificationStatus = 'Cancelled';
        }

        // Update KYC record
        const updatedKyc = await dbService.prisma.KYC.update({
            where: { id: kyc.id },
            data: updateData
        });

        console.log('✅ KYC record updated via webhook:', {
            reference,
            event,
            verificationType,
            verificationStatus: updatedKyc.verificationStatus,
            userId: kyc.userId
        });

        // TODO: Send email notification to user based on status
        // if (isAccepted) {
        //     await sendKycApprovedEmail(kyc.user.email, kyc.user.name);
        // } else if (isDeclined) {
        //     await sendKycRejectedEmail(kyc.user.email, kyc.user.name, updateData.rejectionReason);
        // }

        res.json({
            success: true,
            message: 'Callback processed successfully',
            data: {
                reference,
                verificationType,
                status: updatedKyc.verificationStatus
            }
        });
    } catch (error) {
        console.error('❌ Error processing callback:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};


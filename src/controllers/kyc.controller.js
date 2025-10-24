// server/src/controllers/kyc.controller.js

import dbService from '../services/db.service.js';
import { sendTemplate } from '../services/mail.service.js';
import { kycStatus as kycEmail } from '../templates/emailTemplates.js';

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

// 2. Submit Document for Verification (calls Shufti Pro API)
export const submitDocumentVerification = async (req, res) => {
    try {
        const userId = req.user.id;
        const { document, reference } = req.body;

        if (!document || !reference) {
            return res.status(400).json({
                success: false,
                message: 'Document and reference are required'
            });
        }

        // Get user information
        const user = await dbService.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true, country: true }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Call Shufti Pro API for document verification
        const { verifyDocument } = await import('../services/shufti.service.js');
        
        console.log('🚀 Submitting document to Shufti Pro:', {
            reference,
            userId,
            userEmail: user.email
        });

        const shuftiResponse = await verifyDocument({
            reference,
            email: user.email,
            country: user.country || 'US',
            documentProof: document.proof,
            supportedTypes: document.supported_types || ['passport', 'id_card', 'driving_license'],
            name: document.name,
            dob: document.dob
        });

        // Create or update KYC record with reference
        let kyc = await dbService.prisma.KYC.findUnique({
            where: { userId }
        });

        const updateData = {
            documentReference: reference,
            documentSubmittedAt: new Date(),
            verificationStatus: 'Pending'
        };

        if (!kyc) {
            kyc = await dbService.prisma.KYC.create({
                data: {
                    userId,
                    ...updateData
                }
            });
        } else {
            kyc = await dbService.prisma.KYC.update({
                where: { userId },
                data: updateData
            });
        }

        console.log('✅ Document submitted successfully:', {
            reference,
            event: shuftiResponse.event,
            verificationStatus: kyc.verificationStatus
        });

        res.json({
            success: true,
            message: 'Document submitted for verification',
            data: {
                reference,
                event: shuftiResponse.event,
                verification_url: shuftiResponse.verification_url,
                kyc
            }
        });
    } catch (error) {
        console.error('❌ Error submitting document:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to submit document for verification'
        });
    }
};

// 3. Update document verification status (for manual updates or test mode)
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

// 4. Submit Address for Verification (calls Shufti Pro API)
export const submitAddressVerification = async (req, res) => {
    try {
        const userId = req.user.id;
        const { address, reference } = req.body;

        if (!address || !reference) {
            return res.status(400).json({
                success: false,
                message: 'Address and reference are required'
            });
        }

        // Get user information
        const user = await dbService.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true, country: true }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Call Shufti Pro API for address verification
        const { verifyAddress } = await import('../services/shufti.service.js');
        
        console.log('🚀 Submitting address to Shufti Pro:', {
            reference,
            userId,
            userEmail: user.email
        });

        const shuftiResponse = await verifyAddress({
            reference,
            email: user.email,
            country: user.country || 'US',
            addressProof: address.proof,
            supportedTypes: address.supported_types || ['utility_bill', 'bank_statement', 'rent_agreement'],
            name: address.name,
            fullAddress: address.full_address
        });

        // Update KYC record with address reference
        let kyc = await dbService.prisma.KYC.findUnique({
            where: { userId }
        });

        const updateData = {
            addressReference: reference,
            addressSubmittedAt: new Date()
        };

        if (!kyc) {
            kyc = await dbService.prisma.KYC.create({
                data: {
                    userId,
                    verificationStatus: 'Pending',
                    ...updateData
                }
            });
        } else {
            kyc = await dbService.prisma.KYC.update({
                where: { userId },
                data: updateData
            });
        }

        console.log('✅ Address submitted successfully:', {
            reference,
            event: shuftiResponse.event
        });

        res.json({
            success: true,
            message: 'Address submitted for verification',
            data: {
                reference,
                event: shuftiResponse.event,
                verification_url: shuftiResponse.verification_url,
                kyc
            }
        });
    } catch (error) {
        console.error('❌ Error submitting address:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to submit address for verification'
        });
    }
};

// 5. Update address verification status (for manual updates or test mode)
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

// 6. Get user's KYC status
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

// 7. Webhook handler for Shufti Pro callbacks
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

        // Email notification
        try {
            const user = await dbService.prisma.user.findUnique({ where: { id: kyc.userId }, select: { email: true, name: true } });
            if (user?.email) {
                const tpl = kycEmail({ name: user.name, status: updatedKyc.verificationStatus, reason: updateData.rejectionReason });
                await sendTemplate({ to: user.email, subject: tpl.subject, html: tpl.html });
            }
        } catch (e) { console.warn('Email(send KYC) failed:', e?.message); }

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


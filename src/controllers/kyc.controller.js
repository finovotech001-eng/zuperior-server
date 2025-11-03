// server/src/controllers/kyc.controller.js

import dbService from '../services/db.service.js';
import * as shuftiService from '../services/shufti.service.js';

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

// 2. Submit document for verification (calls Shufti API)
export const submitDocument = async (req, res) => {
    try {
        const userId = req.user.id;
        const { reference, document, email, country } = req.body;

        if (!reference) {
            return res.status(400).json({
                success: false,
                message: 'Reference is required'
            });
        }

        if (!document || !document.proof) {
            return res.status(400).json({
                success: false,
                message: 'Document proof is required'
            });
        }

        // Get user info if not provided in request
        const user = await dbService.prisma.User.findUnique({
            where: { id: userId },
            select: { email: true, country: true }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Use provided email/country or fallback to user data
        const userEmail = email || user.email;
        const userCountry = country || user.country || 'US'; // Default to US if not set

        if (!userEmail) {
            return res.status(400).json({
                success: false,
                message: 'Email is required for document verification'
            });
        }

        console.log('📝 Submitting document for verification:', {
            userId,
            reference,
            email: userEmail,
            country: userCountry
        });

        // Prepare document data for Shufti
        const documentData = {
            reference,
            email: userEmail,
            country: userCountry,
            documentProof: document.proof,
            supportedTypes: document.supported_types || ['passport', 'id_card', 'driving_license'],
            name: document.name || {
                first_name: '',
                last_name: '',
                fuzzy_match: '1'
            },
            dob: document.dob || null
        };

        // Call Shufti API
        let shuftiResponse;
        try {
            shuftiResponse = await shuftiService.verifyDocument(documentData);
        } catch (shuftiError) {
            console.error('❌ Shufti API Error:', JSON.stringify(shuftiError, null, 2));
            // If Shufti fails, still create/update KYC record but mark as pending
            // This allows the system to track submissions even if Shufti is down
            let kyc = await dbService.prisma.KYC.findUnique({
                where: { userId }
            });

            if (!kyc) {
                kyc = await dbService.prisma.KYC.create({
                    data: {
                        userId,
                        documentReference: reference,
                        documentSubmittedAt: new Date(),
                        verificationStatus: 'Pending'
                    }
                });
            } else {
                kyc = await dbService.prisma.KYC.update({
                    where: { userId },
                    data: {
                        documentReference: reference,
                        documentSubmittedAt: new Date(),
                        verificationStatus: 'Pending'
                    }
                });
            }

            // Return error response but with KYC record created
            return res.status(500).json({
                success: false,
                message: shuftiError.message || 'Failed to submit document to Shufti Pro',
                error: shuftiError.error || shuftiError,
                data: {
                    reference,
                    kyc: {
                        verificationStatus: kyc.verificationStatus,
                        documentReference: kyc.documentReference
                    }
                }
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
                    documentReference: reference,
                    documentSubmittedAt: new Date(),
                    verificationStatus: 'Pending'
                }
            });
        } else {
            kyc = await dbService.prisma.KYC.update({
                where: { userId },
                data: {
                    documentReference: reference,
                    documentSubmittedAt: new Date(),
                    verificationStatus: 'Pending'
                }
            });
        }

        console.log('✅ Document submitted to Shufti:', {
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
                verification_url: shuftiResponse.verification_url || '',
                kyc: {
                    verificationStatus: kyc.verificationStatus,
                    documentReference: kyc.documentReference
                }
            }
        });
    } catch (error) {
        console.error('❌ Error submitting document:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error',
            error: error.error || error.toString(),
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// 3. Submit address for verification (calls Shufti API)
export const submitAddress = async (req, res) => {
    try {
        const userId = req.user.id;
        const { reference, address, email, country } = req.body;

        if (!reference) {
            return res.status(400).json({
                success: false,
                message: 'Reference is required'
            });
        }

        if (!address || !address.proof) {
            return res.status(400).json({
                success: false,
                message: 'Address proof is required'
            });
        }

        // Get user info if not provided in request
        const user = await dbService.prisma.User.findUnique({
            where: { id: userId },
            select: { email: true, country: true }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Use provided email/country or fallback to user data
        const userEmail = email || user.email;
        const userCountry = country || user.country || 'US'; // Default to US if not set

        if (!userEmail) {
            return res.status(400).json({
                success: false,
                message: 'Email is required for address verification'
            });
        }

        console.log('📍 Submitting address for verification:', {
            userId,
            reference,
            email: userEmail,
            country: userCountry
        });

        // Prepare address data for Shufti
        const addressData = {
            reference,
            email: userEmail,
            country: userCountry,
            addressProof: address.proof,
            supportedTypes: address.supported_types || ['utility_bill', 'bank_statement', 'rent_agreement'],
            name: address.name || {
                first_name: '',
                last_name: '',
                fuzzy_match: '1'
            },
            fullAddress: address.full_address || ''
        };

        // Call Shufti API
        let shuftiResponse;
        try {
            shuftiResponse = await shuftiService.verifyAddress(addressData);
        } catch (shuftiError) {
            console.error('❌ Shufti API Error:', JSON.stringify(shuftiError, null, 2));
            // If Shufti fails, still create/update KYC record but mark as pending
            let kyc = await dbService.prisma.KYC.findUnique({
                where: { userId }
            });

            if (!kyc) {
                kyc = await dbService.prisma.KYC.create({
                    data: {
                        userId,
                        addressReference: reference,
                        addressSubmittedAt: new Date(),
                        verificationStatus: 'Pending'
                    }
                });
            } else {
                kyc = await dbService.prisma.KYC.update({
                    where: { userId },
                    data: {
                        addressReference: reference,
                        addressSubmittedAt: new Date(),
                        verificationStatus: kyc.isDocumentVerified ? 'Partially Verified' : 'Pending'
                    }
                });
            }

            // Return error response but with KYC record created
            return res.status(500).json({
                success: false,
                message: shuftiError.message || 'Failed to submit address to Shufti Pro',
                error: shuftiError.error || shuftiError,
                data: {
                    reference,
                    kyc: {
                        verificationStatus: kyc.verificationStatus,
                        addressReference: kyc.addressReference
                    }
                }
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
                    addressReference: reference,
                    addressSubmittedAt: new Date(),
                    verificationStatus: 'Pending'
                }
            });
        } else {
            kyc = await dbService.prisma.KYC.update({
                where: { userId },
                data: {
                    addressReference: reference,
                    addressSubmittedAt: new Date(),
                    verificationStatus: kyc.isDocumentVerified ? 'Partially Verified' : 'Pending'
                }
            });
        }

        console.log('✅ Address submitted to Shufti:', {
            reference,
            event: shuftiResponse.event,
            verificationStatus: kyc.verificationStatus
        });

        res.json({
            success: true,
            message: 'Address submitted for verification',
            data: {
                reference,
                event: shuftiResponse.event,
                verification_url: shuftiResponse.verification_url || '',
                kyc: {
                    verificationStatus: kyc.verificationStatus,
                    addressReference: kyc.addressReference
                }
            }
        });
    } catch (error) {
        console.error('❌ Error submitting address:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error',
            error: error.error || error.toString(),
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// 4. Update document verification status
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

// 5. Update address verification status
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

        // Calculate verification status based on the boolean flags
        let calculatedStatus = kyc.verificationStatus;
        if (kyc.isDocumentVerified && kyc.isAddressVerified) {
            calculatedStatus = 'Verified';
        } else if (kyc.isDocumentVerified || kyc.isAddressVerified) {
            calculatedStatus = 'Partially Verified';
        } else if (kyc.verificationStatus === 'Declined') {
            calculatedStatus = 'Declined';
        } else if (!kyc.documentSubmittedAt && !kyc.addressSubmittedAt) {
            calculatedStatus = 'Pending';
        }

        res.json({
            success: true,
            message: 'KYC status retrieved successfully',
            data: {
                ...kyc,
                verificationStatus: calculatedStatus
            }
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


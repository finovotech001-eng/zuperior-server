// server/src/controllers/adminKyc.controller.js

import { PrismaClient } from '@prisma/client';
import { logActivity } from './activityLog.controller.js';

const prisma = new PrismaClient();

// Get all KYC requests with user info
export const getAllKycRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      verificationStatus = '',
      userId = '',
      startDate = '',
      endDate = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    if (verificationStatus) {
      where.verificationStatus = verificationStatus;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Get KYC requests with user info
    const kycRequests = await prisma.KYC.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            clientId: true,
            phone: true,
            country: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        [sortBy]: sortOrder
      },
      skip,
      take: limitNum
    });

    // Get total count for pagination
    const total = await prisma.KYC.count({ where });

    res.json({
      success: true,
      data: {
        kycRequests,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching KYC requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KYC requests'
    });
  }
};

// Get KYC by ID with full details
export const getKycById = async (req, res) => {
  try {
    const { id } = req.params;

    const kyc = await prisma.KYC.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            clientId: true,
            phone: true,
            country: true,
            createdAt: true
          }
        }
      }
    });

    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: 'KYC request not found'
      });
    }

    res.json({
      success: true,
      data: kyc
    });
  } catch (error) {
    console.error('Error fetching KYC:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KYC request'
    });
  }
};

// Update KYC status
export const updateKycStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationStatus, rejectionReason, isDocumentVerified, isAddressVerified } = req.body;

    const kyc = await prisma.KYC.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: 'KYC request not found'
      });
    }

    // Prepare update data
    const updateData = {};
    
    if (verificationStatus) {
      updateData.verificationStatus = verificationStatus;
    }
    
    if (rejectionReason !== undefined) {
      updateData.rejectionReason = rejectionReason;
    }
    
    if (isDocumentVerified !== undefined) {
      updateData.isDocumentVerified = isDocumentVerified;
    }
    
    if (isAddressVerified !== undefined) {
      updateData.isAddressVerified = isAddressVerified;
    }

    // Update KYC
    const updatedKyc = await prisma.KYC.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Log activity
    await logActivity(
      kyc.userId,
      req.user.id,
      'update',
      'kyc',
      {
        entityId: id,
        oldValues: {
          verificationStatus: kyc.verificationStatus,
          isDocumentVerified: kyc.isDocumentVerified,
          isAddressVerified: kyc.isAddressVerified,
          rejectionReason: kyc.rejectionReason
        },
        newValues: {
          verificationStatus: updatedKyc.verificationStatus,
          isDocumentVerified: updatedKyc.isDocumentVerified,
          isAddressVerified: updatedKyc.isAddressVerified,
          rejectionReason: updatedKyc.rejectionReason
        }
      },
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      data: updatedKyc,
      message: 'KYC status updated successfully'
    });
  } catch (error) {
    console.error('Error updating KYC status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update KYC status'
    });
  }
};

// Get KYC document URL from Shufti Pro
export const getKycDocumentUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType } = req.query; // 'document' or 'address'

    const kyc = await prisma.KYC.findUnique({
      where: { id }
    });

    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: 'KYC request not found'
      });
    }

    let referenceId;
    if (documentType === 'document' && kyc.documentReference) {
      referenceId = kyc.documentReference;
    } else if (documentType === 'address' && kyc.addressReference) {
      referenceId = kyc.addressReference;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Document reference not found'
      });
    }

    // Here you would integrate with Shufti Pro API to get document viewer URL
    // For now, return a placeholder URL structure
    const documentUrl = `https://shuftipro.com/document-viewer/${referenceId}`;

    res.json({
      success: true,
      data: {
        documentUrl,
        referenceId,
        documentType
      }
    });
  } catch (error) {
    console.error('Error fetching KYC document URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document URL'
    });
  }
};

// Get KYC statistics
export const getKycStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get KYC counts by status
    const statusStats = await prisma.KYC.groupBy({
      by: ['verificationStatus'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        verificationStatus: true
      }
    });

    // Get verification type stats
    const verificationStats = await prisma.KYC.aggregate({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        isDocumentVerified: true,
        isAddressVerified: true
      }
    });

    // Get daily KYC submissions
    const dailyStats = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM "KYC"
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    res.json({
      success: true,
      data: {
        statusStats,
        verificationStats,
        dailyStats,
        period: `${days} days`
      }
    });
  } catch (error) {
    console.error('Error fetching KYC stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KYC statistics'
    });
  }
};


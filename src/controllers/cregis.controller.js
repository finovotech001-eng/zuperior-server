/**
 * Cregis Payment Controller
 * Handles Cregis payment operations
 */

import * as cregisService from '../services/cregis.service.js';
import dbService from '../services/db.service.js';

/**
 * Create Cregis payment order
 * POST /api/cregis/create-payment
 */
export const createPaymentOrder = async (req, res) => {
  try {
    const {
      orderAmount,
      orderCurrency,
      callbackUrl,
      successUrl,
      cancelUrl,
      payerId,
      validTime,
      mt5AccountId,
      accountType,
      network,
    } = req.body;

    console.log('💳 [Cregis Controller] Creating payment order:', {
      orderAmount,
      orderCurrency,
      mt5AccountId,
      accountType,
      network,
    });

    // Validate required fields
    if (!orderAmount || !orderCurrency || !callbackUrl || !successUrl || !cancelUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderAmount, orderCurrency, callbackUrl, successUrl, cancelUrl',
      });
    }

    // Create payment order using Cregis service
    const result = await cregisService.createPaymentOrder({
      orderAmount,
      orderCurrency,
      callbackUrl,
      successUrl,
      cancelUrl,
      payerId,
      validTime: validTime || 30,
    });

    if (!result.success) {
      console.error('❌ [Cregis Controller] Payment order creation failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    console.log('✅ [Cregis Controller] Payment order created successfully');

    // If mt5AccountId is provided, create a deposit record
    if (mt5AccountId && req.user) {
      try {
        const userId = req.user.id;

        // Verify the MT5 account belongs to the user
        const account = await dbService.prisma.mT5Account.findFirst({
          where: {
            accountId: mt5AccountId,
            userId: userId,
          },
        });

        if (!account) {
          console.warn('⚠️ [Cregis Controller] MT5 account not found or access denied');
        } else {
          // Create deposit record
          const deposit = await dbService.prisma.Deposit.create({
            data: {
              userId: userId,
              mt5AccountId: mt5AccountId,
              amount: parseFloat(orderAmount),
              currency: orderCurrency,
              network: network || 'TRC20',
              paymentMethod: 'crypto',
              cregisOrderId: result.data.orderId,
              cregisId: result.data.cregisId,
              paymentUrl: result.data.paymentUrl,
              qrCode: result.data.qrCode,
              expireTime: result.data.expireTime,
              status: 'pending',
            },
          });

          console.log('✅ [Cregis Controller] Deposit record created:', deposit.id);
        }
      } catch (dbError) {
        console.error('❌ [Cregis Controller] Error creating deposit record:', dbError);
        // Continue even if deposit record creation fails
      }
    }

    res.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('❌ [Cregis Controller] Error in createPaymentOrder:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
};

/**
 * Query payment order status
 * POST /api/cregis/query-payment
 */
export const queryPaymentOrder = async (req, res) => {
  try {
    const { cregisId } = req.body;

    if (!cregisId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: cregisId',
      });
    }

    console.log('🔍 [Cregis Controller] Querying payment order:', cregisId);

    const result = await cregisService.queryPaymentOrder(cregisId);

    if (!result.success) {
      console.error('❌ [Cregis Controller] Query failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('❌ [Cregis Controller] Error in queryPaymentOrder:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
};

/**
 * Get available payment currencies
 * GET /api/cregis/currencies
 */
export const getPaymentCurrencies = async (req, res) => {
  try {
    console.log('📋 [Cregis Controller] Fetching payment currencies');

    const result = await cregisService.getOrderCurrencyList();

    if (!result.success) {
      console.error('❌ [Cregis Controller] Failed to fetch currencies:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('❌ [Cregis Controller] Error in getPaymentCurrencies:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
};

/**
 * Create withdrawal order
 * POST /api/cregis/create-withdrawal
 */
export const createWithdrawalOrder = async (req, res) => {
  try {
    const { currency, address, amount, thirdPartyId, remark, callbackUrl } = req.body;

    console.log('💸 [Cregis Controller] Creating withdrawal order:', {
      currency,
      address: address?.substring(0, 10) + '...',
      amount,
      thirdPartyId,
    });

    // Validate required fields
    if (!currency || !address || !amount || !thirdPartyId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: currency, address, amount, thirdPartyId',
      });
    }

    const result = await cregisService.createWithdrawalOrder({
      currency,
      address,
      amount,
      thirdPartyId,
      remark,
      callbackUrl,
    });

    if (!result.success) {
      console.error('❌ [Cregis Controller] Withdrawal order creation failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    console.log('✅ [Cregis Controller] Withdrawal order created successfully');

    res.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('❌ [Cregis Controller] Error in createWithdrawalOrder:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
};

/**
 * Handle Cregis payment callback/webhook
 * POST /api/cregis/payment-callback
 */
export const handlePaymentCallback = async (req, res) => {
  try {
    const callbackData = req.body;
    const { sign, ...params } = callbackData;

    console.log('📥 [Cregis Controller] Received payment callback:', {
      cregis_id: params.cregis_id,
      event_type: params.event_type,
      order_amount: params.order_amount,
    });

    // Verify signature
    const apiKey = cregisService.getPaymentApiKey();
    const isValid = cregisService.verifyCallbackSignature(params, apiKey, sign);

    if (!isValid) {
      console.error('❌ [Cregis Controller] Invalid callback signature!');
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }

    console.log('✅ [Cregis Controller] Callback signature verified');

    // Find deposit by cregisId
    const deposit = await dbService.prisma.Deposit.findFirst({
      where: {
        cregisId: params.cregis_id,
      },
      include: {
        user: true,
      },
    });

    if (!deposit) {
      console.warn('⚠️ [Cregis Controller] Deposit not found for cregis_id:', params.cregis_id);
      // Still return 200 to acknowledge receipt
      return res.json({ success: true, message: 'Callback received' });
    }

    // Update deposit status based on event_type
    const statusMap = {
      success: 'approved',
      confirmed: 'approved',
      failed: 'rejected',
      expired: 'rejected',
      cancelled: 'rejected',
    };

    const newStatus = statusMap[params.event_type] || deposit.status;

    console.log('🔄 [Cregis Controller] Updating deposit status:', {
      depositId: deposit.id,
      oldStatus: deposit.status,
      newStatus,
      eventType: params.event_type,
    });

    // Update deposit
    const updatedDeposit = await dbService.prisma.Deposit.update({
      where: { id: deposit.id },
      data: {
        status: newStatus,
        paidAmount: params.paid_amount ? parseFloat(params.paid_amount) : deposit.amount,
        completedAt: newStatus === 'approved' ? new Date() : null,
      },
    });

    console.log('✅ [Cregis Controller] Deposit updated successfully');

    // If approved, credit MT5 account
    if (newStatus === 'approved' && deposit.mt5AccountId) {
      console.log('💰 [Cregis Controller] Crediting MT5 account:', deposit.mt5AccountId);
      // TODO: Integrate with MT5 API to credit account
      // This would be handled by your MT5 service
    }

    res.json({ success: true, message: 'Callback processed successfully' });
  } catch (error) {
    console.error('❌ [Cregis Controller] Error in handlePaymentCallback:', error);
    // Return 200 to acknowledge receipt even on error
    res.json({ success: false, error: error.message });
  }
};



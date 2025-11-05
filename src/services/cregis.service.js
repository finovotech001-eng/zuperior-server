/**
 * Cregis Payment Service
 * Handles all Cregis API interactions for deposits and withdrawals
 */

import crypto from 'crypto';

// Cregis Payment Engine Configuration (Deposits)
const PAYMENT_CONFIG = {
  PROJECT_ID: process.env.CREGIS_PAYMENT_PROJECT_ID || '1435226128711680',
  API_KEY: process.env.CREGIS_PAYMENT_API_KEY || 'afe05cea1f354bc0a9a484e139d5f4af',
  GATEWAY_URL: process.env.CREGIS_GATEWAY_URL || 'https://t-rwwagnvw.cregis.io',
};

// Cregis WaaS Configuration (Withdrawals)
const WAAS_CONFIG = {
  PROJECT_ID: process.env.CREGIS_WAAS_PROJECT_ID || '1435226266132480',
  API_KEY: process.env.CREGIS_WAAS_API_KEY || 'f2ce7723128e4fdb88daf9461fce9562',
  GATEWAY_URL: process.env.CREGIS_GATEWAY_URL || 'https://t-rwwagnvw.cregis.io',
};

/**
 * Generate MD5 signature for Cregis API requests
 * @param {Object} params - Request parameters
 * @param {string} secretKey - API key
 * @returns {string} MD5 signature in lowercase hex
 */
function generateSignature(params, secretKey) {
  // Filter out null, undefined, and empty string values
  const filtered = Object.entries(params).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );

  // Sort parameters by key
  const sorted = filtered.sort(([a], [b]) => a.localeCompare(b));

  // Create string to sign: secretKey + sorted key-value pairs
  const stringToSign = secretKey + sorted.map(([k, v]) => `${k}${v}`).join('');

  console.log('🔐 [Cregis] Generating signature:', {
    paramsCount: filtered.length,
    sortedKeys: sorted.map(([k]) => k),
  });

  // Generate MD5 hash in lowercase
  const signature = crypto
    .createHash('md5')
    .update(stringToSign)
    .digest('hex')
    .toLowerCase();

  return signature;
}

/**
 * Create payment order for deposits
 * @param {Object} params - Payment parameters
 * @param {string} params.orderAmount - Amount to deposit
 * @param {string} params.orderCurrency - Currency (e.g., "USDT")
 * @param {string} params.callbackUrl - Callback URL for payment notifications
 * @param {string} params.successUrl - Redirect URL after successful payment
 * @param {string} params.cancelUrl - Redirect URL after cancelled payment
 * @param {string} params.payerId - Optional payer ID
 * @param {number} params.validTime - Optional valid time in MINUTES (default 30)
 * @returns {Promise<Object>} Payment order result
 */
export async function createPaymentOrder({
  orderAmount,
  orderCurrency,
  callbackUrl,
  successUrl,
  cancelUrl,
  payerId,
  validTime = 30,
}) {
  try {
    // Validate all required parameters
    if (!orderAmount || orderAmount.trim() === '') {
      throw new Error('orderAmount must not be empty');
    }
    if (!orderCurrency || orderCurrency.trim() === '') {
      throw new Error('orderCurrency must not be empty');
    }
    if (!callbackUrl || callbackUrl.trim() === '') {
      throw new Error('callbackUrl must not be empty');
    }
    if (!successUrl || successUrl.trim() === '') {
      throw new Error('successUrl must not be empty');
    }
    if (!cancelUrl || cancelUrl.trim() === '') {
      throw new Error('cancelUrl must not be empty');
    }

    // Validate validTime is within Cregis acceptable range (10-60 minutes)
    if (validTime < 10 || validTime > 60) {
      console.warn(
        `⚠️ [Cregis] validTime ${validTime} is outside range (10-60 minutes). Clamping to valid range.`
      );
      validTime = Math.max(10, Math.min(60, validTime));
    }

    const orderId = crypto.randomUUID();
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 8);

    // Build payload according to Cregis API documentation
    const payload = {
      pid: Number(PAYMENT_CONFIG.PROJECT_ID),
      nonce,
      timestamp,
      order_id: orderId,
      order_amount: orderAmount.trim(),
      order_currency: orderCurrency.trim(),
      callback_url: callbackUrl.trim(),
      success_url: successUrl.trim(),
      cancel_url: cancelUrl.trim(),
      valid_time: validTime,
      ...(payerId && payerId.trim() !== '' && { payer_id: payerId.trim() }),
    };

    // Generate signature
    const sign = generateSignature(payload, PAYMENT_CONFIG.API_KEY);
    const requestData = { ...payload, sign };

    console.log('📤 [Cregis] Creating payment order:', {
      orderId,
      orderAmount,
      orderCurrency,
      gatewayUrl: PAYMENT_CONFIG.GATEWAY_URL,
      validTime,
    });

    // Make request to Cregis API
    const response = await fetch(`${PAYMENT_CONFIG.GATEWAY_URL}/api/v2/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Cregis] API HTTP error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`Cregis API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('📥 [Cregis] API response:', {
      code: data.code,
      msg: data.msg,
      hasCregisId: !!data.data?.cregis_id,
      hasPaymentUrl: !!data.data?.payment_url,
    });

    if (data.code !== '00000') {
      const errorMessage = data.msg || 'Unknown error';
      console.error('❌ [Cregis] API error:', {
        code: data.code,
        msg: errorMessage,
      });

      // Provide helpful error messages
      if (errorMessage.includes('whitelist')) {
        throw new Error(
          `IP whitelist error: Your server IP needs to be added to Cregis whitelist. Please contact Cregis support.`
        );
      }

      throw new Error(`Cregis API error: ${errorMessage}`);
    }

    console.log('✅ [Cregis] Payment order created successfully');

    // Extract payment data from Cregis response
    const paymentData = {
      cregisId: data.data?.cregis_id,
      paymentUrl: data.data?.payment_url,
      qrCode: data.data?.qr_code,
      expireTime: data.data?.expire_time,
      orderId,
    };

    // Verify payment_url is present
    if (!paymentData.paymentUrl) {
      console.error('❌ [Cregis] Missing payment_url in response!');
      throw new Error(
        `Cregis API did not return a payment URL. Currency '${orderCurrency}' may not be enabled for your project.`
      );
    }

    return {
      success: true,
      data: paymentData,
    };
  } catch (error) {
    console.error('❌ [Cregis] Error creating payment order:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Query payment order status
 * @param {string} cregisId - Cregis payment ID
 * @returns {Promise<Object>} Payment status result
 */
export async function queryPaymentOrder(cregisId) {
  try {
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 8);

    const payload = {
      pid: Number(PAYMENT_CONFIG.PROJECT_ID),
      nonce,
      timestamp,
      cregis_id: cregisId,
    };

    const sign = generateSignature(payload, PAYMENT_CONFIG.API_KEY);
    const requestData = { ...payload, sign };

    console.log('📥 [Cregis] Querying payment order status:', cregisId);

    const response = await fetch(`${PAYMENT_CONFIG.GATEWAY_URL}/api/v2/checkout/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`Cregis API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== '00000') {
      throw new Error(`Cregis API error: ${data.msg}`);
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error) {
    console.error('❌ [Cregis] Error querying payment order:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Get order currency list (available payment methods)
 * @returns {Promise<Object>} Currency list result
 */
export async function getOrderCurrencyList() {
  try {
    const pid = Number(PAYMENT_CONFIG.PROJECT_ID);
    const nonce = Math.random().toString(36).substring(2, 8);
    const timestamp = Date.now();

    const payload = {
      pid,
      nonce,
      timestamp,
    };

    const sign = generateSignature(payload, PAYMENT_CONFIG.API_KEY);
    const requestData = { ...payload, sign };

    const response = await fetch(
      `${PAYMENT_CONFIG.GATEWAY_URL}/api/v2/checkout/order_currency/list`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      }
    );

    if (!response.ok) {
      throw new Error(`Cregis API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== '00000') {
      throw new Error(`Cregis API error: ${data.msg}`);
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error) {
    console.error('❌ [Cregis] Error fetching order currency list:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * WaaS - Create withdrawal order
 * @param {Object} params - Withdrawal parameters
 * @param {string} params.currency - Currency identifier
 * @param {string} params.address - Destination address
 * @param {string} params.amount - Withdrawal amount
 * @param {string} params.thirdPartyId - Unique third-party order ID
 * @param {string} params.remark - Optional remark
 * @param {string} params.callbackUrl - Optional callback URL
 * @returns {Promise<Object>} Withdrawal order result
 */
export async function createWithdrawalOrder({
  currency,
  address,
  amount,
  thirdPartyId,
  remark,
  callbackUrl,
}) {
  try {
    const pid = Number(WAAS_CONFIG.PROJECT_ID);
    const nonce = Math.random().toString(36).substring(2, 8);
    const timestamp = Date.now();

    const payload = {
      pid,
      nonce,
      timestamp,
      currency,
      address,
      amount,
      third_party_id: thirdPartyId,
      ...(remark && { remark }),
      ...(callbackUrl && { callback_url: callbackUrl }),
    };

    const sign = generateSignature(payload, WAAS_CONFIG.API_KEY);
    const requestData = { ...payload, sign };

    console.log('📤 [Cregis] Creating withdrawal order:', {
      currency,
      address: address.substring(0, 10) + '...',
      amount,
      thirdPartyId,
    });

    const response = await fetch(`${WAAS_CONFIG.GATEWAY_URL}/api/v1/payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`Cregis API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== '00000') {
      throw new Error(`Cregis API error: ${data.msg}`);
    }

    console.log('✅ [Cregis] Withdrawal order created successfully');

    return {
      success: true,
      data: data.data,
    };
  } catch (error) {
    console.error('❌ [Cregis] Error creating withdrawal order:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Verify Cregis callback signature
 * @param {Object} params - Callback parameters
 * @param {string} secretKey - API key
 * @param {string} receivedSign - Signature received from Cregis
 * @returns {boolean} True if signature is valid
 */
export function verifyCallbackSignature(params, secretKey, receivedSign) {
  const generatedSign = generateSignature(params, secretKey);
  return generatedSign.toLowerCase() === receivedSign.toLowerCase();
}

/**
 * Get Payment Engine API key for webhook verification
 * @returns {string} Payment Engine API key
 */
export function getPaymentApiKey() {
  return PAYMENT_CONFIG.API_KEY;
}

/**
 * Get WaaS API key for webhook verification
 * @returns {string} WaaS API key
 */
export function getWaasApiKey() {
  return WAAS_CONFIG.API_KEY;
}


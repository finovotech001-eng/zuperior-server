// server/src/services/shufti.service.js
// Shufti Pro API Integration Service

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SHUFTI_PRO_API_URL = 'https://api.shuftipro.com/';
const CLIENT_ID = process.env.SHUFTI_PRO_CLIENT_ID;
const SECRET_KEY = process.env.SHUFTI_PRO_SECRET_KEY;
const CALLBACK_URL = process.env.SHUFTI_PRO_CALLBACK_URL;
const AML_CALLBACK_URL = process.env.SHUFTI_PRO_AML_CALLBACK_URL;

// Validate environment variables
const validateConfig = () => {
  if (!CLIENT_ID || !SECRET_KEY) {
    const error = new Error('Shufti Pro credentials not configured. Please set SHUFTI_PRO_CLIENT_ID and SHUFTI_PRO_SECRET_KEY in .env file');
    error.name = 'ShuftiConfigError';
    throw error;
  }
};

/**
 * Create Basic Auth header for Shufti Pro API
 */
const getAuthHeader = () => {
  validateConfig();
  const authString = Buffer.from(`${CLIENT_ID}:${SECRET_KEY}`).toString('base64');
  return `Basic ${authString}`;
};

/**
 * Document Verification (Identity Proof)
 * @param {Object} params - Verification parameters
 * @param {string} params.reference - Unique reference ID
 * @param {string} params.email - User email
 * @param {string} params.country - Country code (e.g., 'GB', 'US')
 * @param {string} params.documentProof - Base64 encoded document image
 * @param {Array<string>} params.supportedTypes - Document types (e.g., ['passport', 'id_card', 'driving_license'])
 * @param {Object} params.name - Name object with first_name, last_name, fuzzy_match
 * @param {string} params.dob - Date of birth (YYYY-MM-DD) - optional
 * @returns {Promise<Object>} Shufti Pro API response
 */
export const verifyDocument = async ({
  reference,
  email,
  country,
  documentProof,
  supportedTypes = ['passport', 'id_card', 'driving_license'],
  name,
  dob
}) => {
  try {
    validateConfig();

    const payload = {
      reference,
      email,
      country,
      language: 'en',
      verification_mode: 'image_only',
      document: {
        proof: documentProof,
        supported_types: supportedTypes,
        fetch_enhanced_data: '1',
        name,
      }
    };

    // Only include callback_url if it's configured and valid
    // Localhost URLs are not accepted by Shufti unless registered, so omit in development
    if (CALLBACK_URL) {
      if (CALLBACK_URL.includes('localhost') || CALLBACK_URL.includes('127.0.0.1')) {
        // In development, omit localhost callback URLs to avoid Shufti rejection
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Localhost callback URLs are not allowed in production. Please set SHUFTI_PRO_CALLBACK_URL to a registered production domain.');
        }
        console.warn('⚠️ Omitting localhost callback URL (not registered in Shufti). Status updates will not be received via webhook. You can poll for status using the reference.');
      } else {
        payload.callback_url = CALLBACK_URL;
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('SHUFTI_PRO_CALLBACK_URL must be configured in production. Please set it in your .env file and register the domain in your Shufti Pro account.');
    }
    // In development without callback_url, verification will work but you'll need to poll for status

    // Add DOB if provided
    if (dob) {
      payload.document.dob = dob;
    }

    console.log('🚀 Calling Shufti Pro Document Verification API:', {
      reference,
      email,
      country,
      supportedTypes,
      callback_url: payload.callback_url
    });

    const response = await axios.post(SHUFTI_PRO_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
      },
      timeout: 30000, // 30 second timeout
    });

    console.log('✅ Shufti Pro Document Verification Response:', {
      reference,
      event: response.data.event,
      message: response.data.message
    });

    return response.data;
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error('❌ Shufti Pro Document Verification Error:', {
      reference,
      error: errorDetails,
      fullError: JSON.stringify(errorDetails, null, 2)
    });
    
    // Check if error is about callback URL
    const errorData = error.response?.data;
    if (errorData?.error?.key === 'callback_url') {
      throw {
        success: false,
        message: `Callback URL Error: ${errorData.error.message}. Please register your callback domain in your Shufti Pro account dashboard, or omit callback_url in development mode.`,
        error: errorData,
        help: 'To fix: 1) Register your callback domain in Shufti Pro dashboard, or 2) Set SHUFTI_PRO_CALLBACK_URL to a registered domain, or 3) Remove callback_url for polling mode (development only)'
      };
    }
    
    throw {
      success: false,
      message: error.response?.data?.message || error.message,
      error: error.response?.data || error.message
    };
  }
};

/**
 * Address Verification (Proof of Address)
 * @param {Object} params - Verification parameters
 * @param {string} params.reference - Unique reference ID
 * @param {string} params.email - User email
 * @param {string} params.country - Country code
 * @param {string} params.addressProof - Base64 encoded address document
 * @param {Array<string>} params.supportedTypes - Document types (e.g., ['utility_bill', 'bank_statement'])
 * @param {Object} params.name - Name object with first_name, last_name, fuzzy_match
 * @param {string} params.fullAddress - Full address string
 * @returns {Promise<Object>} Shufti Pro API response
 */
export const verifyAddress = async ({
  reference,
  email,
  country,
  addressProof,
  supportedTypes = ['utility_bill', 'bank_statement', 'rent_agreement'],
  name,
  fullAddress
}) => {
  try {
    validateConfig();

    const payload = {
      reference,
      email,
      country,
      language: 'en',
      verification_mode: 'image_only',
      address: {
        proof: addressProof,
        supported_types: supportedTypes,
        full_address: fullAddress,
        name,
        fuzzy_match: '1'
      }
    };

    // Only include callback_url if it's configured and valid
    // Localhost URLs are not accepted by Shufti unless registered, so omit in development
    if (CALLBACK_URL) {
      if (CALLBACK_URL.includes('localhost') || CALLBACK_URL.includes('127.0.0.1')) {
        // In development, omit localhost callback URLs to avoid Shufti rejection
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Localhost callback URLs are not allowed in production. Please set SHUFTI_PRO_CALLBACK_URL to a registered production domain.');
        }
        console.warn('⚠️ Omitting localhost callback URL (not registered in Shufti). Status updates will not be received via webhook. You can poll for status using the reference.');
      } else {
        payload.callback_url = CALLBACK_URL;
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('SHUFTI_PRO_CALLBACK_URL must be configured in production. Please set it in your .env file and register the domain in your Shufti Pro account.');
    }
    // In development without callback_url, verification will work but you'll need to poll for status

    console.log('🚀 Calling Shufti Pro Address Verification API:', {
      reference,
      email,
      country,
      supportedTypes,
      callback_url: payload.callback_url
    });

    const response = await axios.post(SHUFTI_PRO_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
      },
      timeout: 30000,
    });

    console.log('✅ Shufti Pro Address Verification Response:', {
      reference,
      event: response.data.event,
      message: response.data.message
    });

    return response.data;
  } catch (error) {
    console.error('❌ Shufti Pro Address Verification Error:', {
      reference,
      error: error.response?.data || error.message
    });
    
    // Check if error is about callback URL
    const errorData = error.response?.data;
    if (errorData?.error?.key === 'callback_url') {
      throw {
        success: false,
        message: `Callback URL Error: ${errorData.error.message}. Please register your callback domain in your Shufti Pro account dashboard, or omit callback_url in development mode.`,
        error: errorData,
        help: 'To fix: 1) Register your callback domain in Shufti Pro dashboard, or 2) Set SHUFTI_PRO_CALLBACK_URL to a registered domain, or 3) Remove callback_url for polling mode (development only)'
      };
    }
    
    throw {
      success: false,
      message: error.response?.data?.message || error.message,
      error: error.response?.data || error.message
    };
  }
};

/**
 * AML/Background Checks Verification
 * @param {Object} params - Verification parameters
 * @param {string} params.reference - Unique reference ID
 * @param {string} params.fullName - Full name for AML screening
 * @param {string} params.dob - Date of birth (YYYY-MM-DD)
 * @param {string} params.country - Country code
 * @param {Array<string>} params.filters - AML filters (e.g., ['sanction', 'pep', 'pep-class-1'])
 * @returns {Promise<Object>} Shufti Pro API response
 */
export const verifyAML = async ({
  reference,
  fullName,
  dob,
  country,
  filters = ['sanction', 'pep', 'pep-class-1']
}) => {
  try {
    validateConfig();

    const payload = {
      reference,
      language: 'en',
      verification_mode: 'any',
      decline_on_single_step: '0',
      ttl: 60, // Time-to-live in minutes
      background_checks: {
        name: {
          full_name: fullName
        },
        filters,
        dob,
        alias_search: '1',
        rca_search: '1'
      }
    };

    // Use AML-specific callback URL if available, otherwise use general callback URL
    const callbackUrl = AML_CALLBACK_URL || CALLBACK_URL;
    if (callbackUrl) {
      if (callbackUrl.includes('localhost') || callbackUrl.includes('127.0.0.1')) {
        // In development, omit localhost callback URLs to avoid Shufti rejection
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Localhost callback URLs are not allowed in production. Please set SHUFTI_PRO_AML_CALLBACK_URL or SHUFTI_PRO_CALLBACK_URL to a registered production domain.');
        }
        console.warn('⚠️ Omitting localhost callback URL (not registered in Shufti). Status updates will not be received via webhook.');
      } else {
        payload.callback_url = callbackUrl;
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('SHUFTI_PRO_AML_CALLBACK_URL or SHUFTI_PRO_CALLBACK_URL must be configured in production.');
    }
    // In development without callback_url, verification will work but you'll need to poll for status

    console.log('🚀 Calling Shufti Pro AML Verification API:', {
      reference,
      fullName,
      filters,
      callback_url: payload.callback_url
    });

    const response = await axios.post(SHUFTI_PRO_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
      },
      timeout: 30000,
    });

    console.log('✅ Shufti Pro AML Verification Response:', {
      reference,
      event: response.data.event,
      message: response.data.message
    });

    return response.data;
  } catch (error) {
    console.error('❌ Shufti Pro AML Verification Error:', {
      reference,
      error: error.response?.data || error.message
    });
    
    throw {
      success: false,
      message: error.response?.data?.message || error.message,
      error: error.response?.data || error.message
    };
  }
};

/**
 * Face Verification (Optional - for future use)
 * @param {Object} params - Verification parameters
 * @param {string} params.reference - Unique reference ID
 * @param {string} params.email - User email
 * @param {string} params.country - Country code
 * @param {string} params.faceProof - Base64 encoded face image or video
 * @returns {Promise<Object>} Shufti Pro API response
 */
export const verifyFace = async ({
  reference,
  email,
  country,
  faceProof
}) => {
  try {
    validateConfig();

    const payload = {
      reference,
      callback_url: CALLBACK_URL || 'http://localhost:3000/api/kyc/callback',
      email,
      country,
      language: 'en',
      verification_mode: 'image_only',
      face: {
        proof: faceProof
      }
    };

    console.log('🚀 Calling Shufti Pro Face Verification API:', {
      reference,
      email,
      callback_url: payload.callback_url
    });

    const response = await axios.post(SHUFTI_PRO_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
      },
      timeout: 30000,
    });

    console.log('✅ Shufti Pro Face Verification Response:', {
      reference,
      event: response.data.event
    });

    return response.data;
  } catch (error) {
    console.error('❌ Shufti Pro Face Verification Error:', {
      reference,
      error: error.response?.data || error.message
    });
    
    throw {
      success: false,
      message: error.response?.data?.message || error.message,
      error: error.response?.data || error.message
    };
  }
};

export default {
  verifyDocument,
  verifyAddress,
  verifyAML,
  verifyFace
};



